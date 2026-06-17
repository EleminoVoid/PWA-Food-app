import type { ModelOption } from './types'

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'yolo',
    label: 'YOLO Seg',
    description: '640px letterbox preprocessing, YOLO segmentation decoder.',
    metadataUrl: '/models/yolo/metadata.json',
  },
  {
    id: 'rfdetr',
    label: 'RF-DETR Seg',
    description: '504px direct resize, ImageNet normalization.',
    metadataUrl: '/models/rfdetr/metadata.json',
  },
]

export function getModelOption(modelId: string) {
  const option = MODEL_OPTIONS.find((item) => item.id === modelId)
  if (!option) throw new Error(`Unknown model id: ${modelId}`)
  return option
}
