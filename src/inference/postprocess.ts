import type { ImageInput, SegmentDetection } from './types'

export function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value))
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function boxIou(a: readonly number[], b: readonly number[]) {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2])
  const y2 = Math.min(a[3], b[3])
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  return intersection / (areaA + areaB - intersection + 1e-7)
}

export function nms(detections: SegmentDetection[], iouThreshold: number) {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const keep: SegmentDetection[] = []

  while (sorted.length) {
    const current = sorted.shift()
    if (!current) break
    keep.push(current)

    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      if (sorted[index].classId === current.classId && boxIou(sorted[index].box, current.box) > iouThreshold) {
        sorted.splice(index, 1)
      }
    }
  }

  return keep
}

export function tensorRows<T extends { data: ArrayLike<number>; dims: readonly number[] }>(
  tensor: T,
  rowSize: number,
) {
  const rows: number[][] = []
  const count = tensor.dims.length === 3 ? tensor.dims[1] : Math.floor(tensor.data.length / rowSize)

  for (let index = 0; index < count; index += 1) {
    rows.push(Array.from({ length: rowSize }, (_, offset) => tensor.data[index * rowSize + offset]))
  }

  return rows
}

export function xywhToXyxy(box: readonly number[]): [number, number, number, number] {
  const [x, y, width, height] = box
  return [x - width / 2, y - height / 2, x + width / 2, y + height / 2]
}

export function scaleYoloBox(box: readonly number[], input: ImageInput): [number, number, number, number] {
  const ratio = input.ratio ?? 1
  const padX = input.padX ?? 0
  const padY = input.padY ?? 0
  const [x1, y1, x2, y2] = box

  return [
    clamp((x1 - padX) / ratio, 0, input.originalWidth),
    clamp((y1 - padY) / ratio, 0, input.originalHeight),
    clamp((x2 - padX) / ratio, 0, input.originalWidth),
    clamp((y2 - padY) / ratio, 0, input.originalHeight),
  ]
}

export function scaleDirectBox(box: readonly number[], input: ImageInput): [number, number, number, number] {
  let [x1, y1, x2, y2] = box
  const maxValue = Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2))

  if (maxValue <= 1.5) {
    x1 *= input.originalWidth
    x2 *= input.originalWidth
    y1 *= input.originalHeight
    y2 *= input.originalHeight
  } else {
    x1 = (x1 / input.imgSize) * input.originalWidth
    x2 = (x2 / input.imgSize) * input.originalWidth
    y1 = (y1 / input.imgSize) * input.originalHeight
    y2 = (y2 / input.imgSize) * input.originalHeight
  }

  return [
    clamp(Math.min(x1, x2), 0, input.originalWidth),
    clamp(Math.min(y1, y2), 0, input.originalHeight),
    clamp(Math.max(x1, x2), 0, input.originalWidth),
    clamp(Math.max(y1, y2), 0, input.originalHeight),
  ]
}

export function boxToPoints(box: readonly number[]): Array<[number, number]> {
  return [
    [round(box[0]), round(box[1])],
    [round(box[2]), round(box[1])],
    [round(box[2]), round(box[3])],
    [round(box[0]), round(box[3])],
  ]
}

export function maskToBoundaryPoints(
  mask: Float32Array,
  maskWidth: number,
  maskHeight: number,
  input: ImageInput,
  threshold = 0.5,
) {
  const points: Array<[number, number]> = []

  for (let y = 1; y < maskHeight - 1; y += 1) {
    for (let x = 1; x < maskWidth - 1; x += 1) {
      const index = y * maskWidth + x
      if (mask[index] <= threshold) continue

      const boundary =
        mask[index - 1] <= threshold ||
        mask[index + 1] <= threshold ||
        mask[index - maskWidth] <= threshold ||
        mask[index + maskWidth] <= threshold

      if (boundary) {
        points.push([
          round((x / maskWidth) * input.originalWidth),
          round((y / maskHeight) * input.originalHeight),
        ])
      }
    }
  }

  if (points.length <= 96) return points

  const step = Math.ceil(points.length / 96)
  return points.filter((_, index) => index % step === 0).slice(0, 96)
}

export function round(value: number) {
  return Math.round(value * 10) / 10
}
