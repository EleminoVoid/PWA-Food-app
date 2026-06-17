import type { InferenceSession, Tensor } from 'onnxruntime-web'
import type { ImageInput, ModelMetadata, RunOptions, SegmentDetection } from './types'
import { boxToPoints, maskToBoundaryPoints, nms, scaleYoloBox, sigmoid, xywhToXyxy } from './postprocess'

export async function runYoloSegmentation(
  ort: typeof import('onnxruntime-web'),
  session: InferenceSession,
  input: ImageInput,
  metadata: ModelMetadata,
  options: RunOptions,
) {
  const tensor = new ort.Tensor('float32', input.tensorData, [1, 3, input.imgSize, input.imgSize])
  const outputMap = await session.run({ [session.inputNames[0]]: tensor })
  const output0 = outputMap[session.outputNames[0]]
  const output1 = outputMap[session.outputNames[1]]

  if (!output0) throw new Error('YOLO output0 is missing.')

  const detections = decodeYoloOutput(output0, output1, input, metadata, options)
  return nms(detections, options.iouThreshold)
}

function decodeYoloOutput(
  boxesTensor: Tensor,
  maskTensor: Tensor | undefined,
  input: ImageInput,
  metadata: ModelMetadata,
  options: RunOptions,
) {
  const names = metadata.names
  const data = boxesTensor.data as Float32Array
  const dims = boxesTensor.dims
  const maskDims = maskTensor?.dims
  const maskDim = maskDims?.length === 4 ? maskDims[1] : 32
  const detections: SegmentDetection[] = []

  if (dims.length !== 3) {
    throw new Error(`Unsupported YOLO output shape: [${dims.join(', ')}]`)
  }

  const compactRows = dims[1]
  const compactWidth = dims[2]
  const rawChannels = dims[1]
  const rawBoxes = dims[2]
  const compactChannels = 6 + maskDim
  const compactLayout = compactWidth === compactChannels || rawChannels === compactChannels
  const count = compactLayout ? compactRows : rawBoxes
  const width = compactLayout ? compactWidth : rawChannels
  const maskCoeffStart = compactLayout ? 6 : width - maskDim

  for (let i = 0; i < count; i += 1) {
    const values = compactLayout
      ? Array.from(data.slice(i * width, i * width + width))
      : Array.from({ length: width }, (_, c) => data[c * count + i])

    let classId = 0
    let score = -Infinity

    let scaledBox: [number, number, number, number]

    if (compactLayout) {
      classId = Math.round(values[5])
      score = values[4]
      scaledBox = scaleYoloBox(values.slice(0, 4), input)
    } else {
      const classStart = 4
      const classEnd = Math.min(maskCoeffStart, classStart + names.length)
      for (let c = classStart; c < classEnd; c += 1) {
        const classScore = values[c]
        if (classScore > score) {
          score = classScore
          classId = c - classStart
        }
      }
      scaledBox = scaleYoloBox(xywhToXyxy(values.slice(0, 4)), input)
    }

    if (score < options.confidenceThreshold) continue

    const mask = maskTensor ? buildYoloMask(maskTensor, values.slice(maskCoeffStart), input) : null
    detections.push({
      classId,
      label: names[classId] ?? `class_${classId}`,
      score,
      box: scaledBox,
      points: mask ? maskToBoundaryPoints(mask.data, mask.width, mask.height, input) : boxToPoints(scaledBox),
      mask: mask?.data ?? null,
      maskWidth: mask?.width ?? null,
      maskHeight: mask?.height ?? null,
    })
  }

  return detections
}

function buildYoloMask(
  maskTensor: Tensor,
  coeffs: number[],
  input: ImageInput,
) {
  const dims = maskTensor.dims
  if (dims.length !== 4) return null

  const channels = dims[1]
  const height = dims[2]
  const width = dims[3]
  const prototype = maskTensor.data as Float32Array
  const data = new Float32Array(width * height)

  for (let p = 0; p < data.length; p += 1) {
    let value = 0
    for (let c = 0; c < Math.min(channels, coeffs.length); c += 1) {
      value += coeffs[c] * prototype[c * width * height + p]
    }
    data[p] = sigmoid(value)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return { data, width, height }

  const imageData = context.createImageData(width, height)
  for (let p = 0; p < data.length; p += 1) {
    const offset = p * 4
    imageData.data[offset] = 255
    imageData.data[offset + 1] = 255
    imageData.data[offset + 2] = 255
    imageData.data[offset + 3] = data[p] > 0.5 ? 255 : 0
  }
  context.putImageData(imageData, 0, 0)

  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = input.originalWidth
  fullCanvas.height = input.originalHeight
  const fullContext = fullCanvas.getContext('2d', { willReadFrequently: true })
  if (!fullContext) return { data, width, height }

  const sourceX = ((input.padX ?? 0) / input.imgSize) * width
  const sourceY = ((input.padY ?? 0) / input.imgSize) * height
  const sourceWidth = (input.originalWidth * (input.ratio ?? 1) / input.imgSize) * width
  const sourceHeight = (input.originalHeight * (input.ratio ?? 1) / input.imgSize) * height
  fullContext.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, input.originalWidth, input.originalHeight)

  const fullImage = fullContext.getImageData(0, 0, input.originalWidth, input.originalHeight)
  const fullMask = new Float32Array(input.originalWidth * input.originalHeight)
  for (let p = 0; p < fullMask.length; p += 1) {
    fullMask[p] = fullImage.data[p * 4 + 3] / 255
  }

  return {
    data: fullMask,
    width: input.originalWidth,
    height: input.originalHeight,
  }
}
