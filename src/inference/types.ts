export type ModelId = 'yolo' | 'rfdetr'

export type ModelType = 'yolo-seg' | 'rfdetr-seg'

export type ModelOption = {
  id: ModelId
  label: string
  description: string
  metadataUrl: string
}

export type ModelMetadata = {
  modelType: ModelType
  modelFile: string
  task: 'segment'
  imgsz: number
  names: string[]
  preprocess?: {
    resize?: 'letterbox' | 'direct'
    mean?: number[]
    std?: number[]
    layout?: 'NCHW'
  }
}

export type ImageInput = {
  bitmap: ImageBitmap
  originalWidth: number
  originalHeight: number
  imgSize: number
  tensorData: Float32Array
  ratio?: number
  padX?: number
  padY?: number
}

export type SegmentDetection = {
  classId: number
  label: string
  score: number
  box: [number, number, number, number]
  points: Array<[number, number]>
  mask?: Float32Array | null
  maskWidth?: number | null
  maskHeight?: number | null
}

export type SegmentResult = {
  modelId: ModelId
  modelLabel: string
  modelType: ModelType
  elapsedMs: number
  imageWidth: number
  imageHeight: number
  detections: SegmentDetection[]
}

export type RunOptions = {
  confidenceThreshold: number
  iouThreshold: number
}
