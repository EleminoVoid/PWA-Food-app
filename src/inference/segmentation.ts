import * as ort from 'onnxruntime-web/webgpu'
import wasmMjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'
import wasmBinaryUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import { imageDataUrlToBitmap, preprocessImage } from './image'
import { getModelOption } from './models'
import { runRfdetrSegmentation } from './rfdetrSeg'
import type { ImageInput, ModelId, ModelMetadata, RunOptions, SegmentResult } from './types'
import { runYoloSegmentation } from './yoloSeg'

type RuntimeApi = typeof import('onnxruntime-web')

type LoadedModel = {
  api: RuntimeApi
  session: ort.InferenceSession
  metadata: ModelMetadata
  label: string
}

const modelCache = new Map<ModelId, Promise<LoadedModel>>()

ort.env.wasm.wasmPaths = {
  mjs: wasmMjsUrl,
  wasm: wasmBinaryUrl,
}
ort.env.wasm.numThreads = 1
ort.env.wasm.proxy = false
ort.env.logLevel = 'warning'

export async function loadSegmentationModel(modelId: ModelId) {
  if (!modelCache.has(modelId)) {
    modelCache.set(modelId, createLoadedModel(modelId))
  }
  return modelCache.get(modelId)!
}

export async function warmSegmentationModels() {
  await Promise.allSettled((['yolo', 'rfdetr'] as ModelId[]).map((modelId) => loadSegmentationModel(modelId)))
}

export async function runSegmentation(
  modelId: ModelId,
  imageDataUrl: string,
  options: RunOptions,
): Promise<{ result: SegmentResult; input: ImageInput }> {
  const loaded = await loadSegmentationModel(modelId)
  const bitmap = await imageDataUrlToBitmap(imageDataUrl)
  const input = preprocessImage(bitmap, loaded.metadata)

  const started = performance.now()
  const detections = loaded.metadata.modelType === 'rfdetr-seg'
    ? await runRfdetrSegmentation(loaded.api, loaded.session, input, loaded.metadata, options)
    : await runYoloSegmentation(loaded.api, loaded.session, input, loaded.metadata, options)
  const elapsedMs = performance.now() - started

  return {
    input,
    result: {
      modelId,
      modelLabel: loaded.label,
      modelType: loaded.metadata.modelType,
      elapsedMs,
      imageWidth: input.originalWidth,
      imageHeight: input.originalHeight,
      detections,
    },
  }
}

async function createLoadedModel(modelId: ModelId): Promise<LoadedModel> {
  const option = getModelOption(modelId)
  const metadata = await fetch(option.metadataUrl).then((response) => {
    if (!response.ok) throw new Error(`Could not load ${option.metadataUrl}`)
    return response.json() as Promise<ModelMetadata>
  })
  const modelUrl = modelUrlFor(option.metadataUrl, metadata.modelFile)

  try {
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all',
    })
    return { api: ort, session, metadata, label: option.label }
  } catch (error) {
    console.warn('WebGPU session failed, falling back to WASM.', error)
    const wasmOrt = await import('onnxruntime-web/wasm')
    wasmOrt.env.wasm.wasmPaths = {
      mjs: wasmMjsUrl,
      wasm: wasmBinaryUrl,
    }
    wasmOrt.env.wasm.numThreads = 1
    wasmOrt.env.wasm.proxy = false

    const session = await wasmOrt.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    return { api: wasmOrt, session, metadata, label: option.label }
  }
}

function modelUrlFor(metadataUrl: string, modelFile: string) {
  const metadata = new URL(metadataUrl, window.location.origin)
  return new URL(modelFile, metadata).toString()
}
