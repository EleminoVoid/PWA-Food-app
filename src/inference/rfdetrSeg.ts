import type { InferenceSession, Tensor } from 'onnxruntime-web'
import type { ImageInput, ModelMetadata, RunOptions, SegmentDetection } from './types'
import { boxToPoints, maskToBoundaryPoints, nms, scaleDirectBox, sigmoid, tensorRows } from './postprocess'

type NumericTensor = Tensor & { data: ArrayLike<number> }

export async function runRfdetrSegmentation(
  ort: typeof import('onnxruntime-web'),
  session: InferenceSession,
  input: ImageInput,
  metadata: ModelMetadata,
  options: RunOptions,
) {
  const tensor = new ort.Tensor('float32', input.tensorData, [1, 3, input.imgSize, input.imgSize])
  const outputMap = await session.run({ [session.inputNames[0]]: tensor })
  const outputs = session.outputNames.map((name) => outputMap[name])

  return nms(decodeRfdetrOutputs(outputs, session.outputNames, metadata, input, options), options.iouThreshold)
}

function decodeRfdetrOutputs(
  outputs: Tensor[],
  outputNames: readonly string[],
  metadata: ModelMetadata,
  input: ImageInput,
  options: RunOptions,
) {
  const byName = Object.fromEntries(outputs.map((output, index) => [outputNames[index], output]))
  const boxesTensor = findTensor(byName, outputs, ['box', 'det', 'bbox'], 4)
  const scoreTensor = findTensor(byName, outputs, ['score', 'label', 'logit', 'class'])
  const maskTensor = findTensor(byName, outputs, ['mask'])

  if (!boxesTensor || !scoreTensor) {
    const shapes = outputNames.map((name, index) => `${name}: [${outputs[index].dims.join(', ')}]`).join('; ')
    throw new Error(`Could not identify RF-DETR outputs. Outputs: ${shapes}`)
  }

  const boxes = tensorRows(boxesTensor as NumericTensor, 4)
  const scores = decodeScores(scoreTensor, metadata.names.length)
  const masks = maskTensor ? decodeMasks(maskTensor) : null
  const detections: SegmentDetection[] = []

  const count = Math.min(boxes.length, scores.length)
  for (let i = 0; i < count; i += 1) {
    const score = scores[i].score
    if (score < options.confidenceThreshold) continue

    const box = scaleDirectBox(boxes[i], input)
    const mask = masks?.items[i] ?? null
    const maskWidth = masks?.width ?? null
    const maskHeight = masks?.height ?? null

    detections.push({
      classId: scores[i].classId,
      label: metadata.names[scores[i].classId] ?? `class_${scores[i].classId}`,
      score,
      box,
      points: mask && maskWidth && maskHeight ? maskToBoundaryPoints(mask, maskWidth, maskHeight, input) : boxToPoints(box),
      mask,
      maskWidth,
      maskHeight,
    })
  }

  return detections
}

function findTensor(
  byName: Record<string, Tensor>,
  outputs: Tensor[],
  nameHints: string[],
  lastDim: number | null = null,
) {
  for (const [name, tensor] of Object.entries(byName)) {
    const lowered = name.toLowerCase()
    if (nameHints.some((hint) => lowered.includes(hint)) && (lastDim == null || tensor.dims.at(-1) === lastDim)) {
      return tensor
    }
  }

  if (lastDim != null) {
    return outputs.find((tensor) => tensor.dims.at(-1) === lastDim)
  }

  return null
}

function decodeScores(tensor: Tensor, numClasses: number) {
  const dims = tensor.dims
  const data = tensor.data as Float32Array

  if (dims.at(-1) === numClasses || dims.at(-1) === numClasses + 1) {
    const width = dims.at(-1) ?? 0
    const count = dims.length === 3 ? dims[1] : Math.floor(data.length / width)
    const scores: Array<{ classId: number; score: number }> = []

    for (let i = 0; i < count; i += 1) {
      let bestClass = 0
      let bestScore = -Infinity
      const classLimit = Math.min(numClasses, width)
      for (let c = 0; c < classLimit; c += 1) {
        const score = sigmoid(data[i * width + c])
        if (score > bestScore) {
          bestScore = score
          bestClass = c
        }
      }
      scores.push({ classId: bestClass, score: bestScore })
    }

    return scores
  }

  if (dims.at(-1) === 2) {
    return tensorRows(tensor as NumericTensor, 2).map(([score, classId]) => ({ score, classId: Math.round(classId) }))
  }

  return Array.from(data).map((score, classId) => ({ score, classId }))
}

function decodeMasks(tensor: Tensor) {
  const dims = tensor.dims
  const data = tensor.data as Float32Array
  let count: number
  let height: number
  let width: number

  if (dims.length === 4) {
    count = dims[1]
    height = dims[2]
    width = dims[3]
  } else if (dims.length === 3) {
    count = dims[0]
    height = dims[1]
    width = dims[2]
  } else {
    return null
  }

  const plane = height * width
  const items: Float32Array[] = []

  for (let i = 0; i < count; i += 1) {
    const mask = new Float32Array(plane)
    for (let p = 0; p < plane; p += 1) {
      mask[p] = sigmoid(data[i * plane + p])
    }
    items.push(mask)
  }

  return { items, width, height }
}
