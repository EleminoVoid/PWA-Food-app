import type { ImageInput, ModelMetadata, SegmentDetection } from './types'

export async function imageDataUrlToBitmap(imageDataUrl: string) {
  const response = await fetch(imageDataUrl)
  const blob = await response.blob()
  return createImageBitmap(blob)
}

export function preprocessImage(bitmap: ImageBitmap, metadata: ModelMetadata): ImageInput {
  if (metadata.modelType === 'rfdetr-seg') {
    return preprocessDirect(bitmap, metadata)
  }
  return preprocessLetterbox(bitmap, metadata)
}

function preprocessDirect(bitmap: ImageBitmap, metadata: ModelMetadata): ImageInput {
  const imgSize = metadata.imgsz
  const canvas = document.createElement('canvas')
  canvas.width = imgSize
  canvas.height = imgSize
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Unable to prepare image canvas.')

  context.drawImage(bitmap, 0, 0, imgSize, imgSize)

  const mean = metadata.preprocess?.mean ?? [0.485, 0.456, 0.406]
  const std = metadata.preprocess?.std ?? [0.229, 0.224, 0.225]
  const imageData = context.getImageData(0, 0, imgSize, imgSize)
  const chw = new Float32Array(3 * imgSize * imgSize)
  const plane = imgSize * imgSize

  for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
    chw[p] = (imageData.data[i] / 255 - mean[0]) / std[0]
    chw[plane + p] = (imageData.data[i + 1] / 255 - mean[1]) / std[1]
    chw[2 * plane + p] = (imageData.data[i + 2] / 255 - mean[2]) / std[2]
  }

  return {
    bitmap,
    originalWidth: bitmap.width,
    originalHeight: bitmap.height,
    imgSize,
    tensorData: chw,
  }
}

function preprocessLetterbox(bitmap: ImageBitmap, metadata: ModelMetadata): ImageInput {
  const imgSize = metadata.imgsz
  const canvas = document.createElement('canvas')
  canvas.width = imgSize
  canvas.height = imgSize
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Unable to prepare image canvas.')

  context.fillStyle = 'rgb(114, 114, 114)'
  context.fillRect(0, 0, imgSize, imgSize)

  const ratio = Math.min(imgSize / bitmap.width, imgSize / bitmap.height)
  const resizedWidth = Math.round(bitmap.width * ratio)
  const resizedHeight = Math.round(bitmap.height * ratio)
  const padX = Math.floor((imgSize - resizedWidth) / 2)
  const padY = Math.floor((imgSize - resizedHeight) / 2)
  context.drawImage(bitmap, padX, padY, resizedWidth, resizedHeight)

  const imageData = context.getImageData(0, 0, imgSize, imgSize)
  const chw = new Float32Array(3 * imgSize * imgSize)
  const plane = imgSize * imgSize

  for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
    chw[p] = imageData.data[i] / 255
    chw[plane + p] = imageData.data[i + 1] / 255
    chw[2 * plane + p] = imageData.data[i + 2] / 255
  }

  return {
    bitmap,
    originalWidth: bitmap.width,
    originalHeight: bitmap.height,
    imgSize,
    tensorData: chw,
    ratio,
    padX,
    padY,
  }
}

export function drawSegmentationOverlay(
  canvas: HTMLCanvasElement,
  input: ImageInput,
  detections: SegmentDetection[],
) {
  canvas.width = input.originalWidth
  canvas.height = input.originalHeight

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to draw segmentation result.')

  context.drawImage(input.bitmap, 0, 0)

  detections.forEach((detection, index) => {
    const color = palette(index)
    if (detection.mask && detection.maskWidth && detection.maskHeight) {
      drawMask(context, detection, input, color)
    }
    drawBox(context, detection, color)
  })
}

function drawMask(
  context: CanvasRenderingContext2D,
  detection: SegmentDetection,
  input: ImageInput,
  color: [number, number, number],
) {
  const scratch = document.createElement('canvas')
  scratch.width = detection.maskWidth ?? 1
  scratch.height = detection.maskHeight ?? 1
  const scratchContext = scratch.getContext('2d')
  if (!scratchContext || !detection.mask) return

  const imageData = scratchContext.createImageData(scratch.width, scratch.height)
  for (let i = 0; i < detection.mask.length; i += 1) {
    const offset = i * 4
    const visible = detection.mask[i] > 0.5
    imageData.data[offset] = color[0]
    imageData.data[offset + 1] = color[1]
    imageData.data[offset + 2] = color[2]
    imageData.data[offset + 3] = visible ? 95 : 0
  }
  scratchContext.putImageData(imageData, 0, 0)
  context.drawImage(scratch, 0, 0, scratch.width, scratch.height, 0, 0, input.originalWidth, input.originalHeight)
}

function drawBox(
  context: CanvasRenderingContext2D,
  detection: SegmentDetection,
  color: [number, number, number],
) {
  const [x1, y1, x2, y2] = detection.box
  const label = `${detection.label} ${detection.score.toFixed(2)}`

  context.save()
  context.strokeStyle = `rgb(${color.join(',')})`
  context.lineWidth = 3
  context.strokeRect(x1, y1, x2 - x1, y2 - y1)

  context.font = '14px system-ui, sans-serif'
  const textWidth = Math.ceil(context.measureText(label).width) + 12
  const labelY = Math.max(0, y1 - 24)
  context.fillStyle = `rgb(${color.join(',')})`
  context.fillRect(x1, labelY, textWidth, 24)
  context.fillStyle = 'white'
  context.fillText(label, x1 + 6, labelY + 17)
  context.restore()
}

function palette(index: number): [number, number, number] {
  const colors: Array<[number, number, number]> = [
    [239, 68, 68],
    [59, 130, 246],
    [34, 197, 94],
    [234, 179, 8],
    [168, 85, 247],
    [20, 184, 166],
    [249, 115, 22],
  ]
  return colors[index % colors.length]
}
