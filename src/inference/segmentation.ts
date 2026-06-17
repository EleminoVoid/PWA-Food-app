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
  session: import('onnxruntime-web').InferenceSession
  metadata: ModelMetadata
  label: string
}

const modelCache = new Map<ModelId, Promise<LoadedModel>>()

// Configure wasm paths once for the wasm-only backend.
// We import the wasm module lazily so we can set env before creating any session.
async function getWasmApi(): Promise<RuntimeApi> {
  const wasmOrt = await import('onnxruntime-web/wasm')
  wasmOrt.env.wasm.wasmPaths = {
    mjs: wasmMjsUrl,
    wasm: wasmBinaryUrl,
  }
  wasmOrt.env.wasm.numThreads = 1
  wasmOrt.env.wasm.proxy = false
  wasmOrt.env.logLevel = 'warning'
  return wasmOrt as unknown as RuntimeApi
}

export async function loadSegmentationModel(modelId: ModelId) {
  if (!modelCache.has(modelId)) {
    modelCache.set(modelId, createLoadedModel(modelId))
  }
  return modelCache.get(modelId)!
}

export async function warmSegmentationModels() {
  await Promise.allSettled((['yolo', 'rfdetr'] as ModelId[]).map((id) => loadSegmentationModel(id)))
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
  const metadata = await fetch(option.metadataUrl).then((res) => {
    if (!res.ok) throw new Error(`Could not load model metadata: ${option.metadataUrl}`)
    return res.json() as Promise<ModelMetadata>
  })
  const modelUrl = modelUrlFor(option.metadataUrl, metadata.modelFile)

  // Try WebGPU first (no wasm path config needed), fall through to wasm on any error.
  try {
    const webgpuOrt = await import('onnxruntime-web/webgpu')
    const session = await webgpuOrt.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    })
    return { api: webgpuOrt as unknown as RuntimeApi, session, metadata, label: option.label }
  } catch {
    // WebGPU unavailable — use WASM backend with explicit wasm paths.
  }

  const api = await getWasmApi()
  const session = await (api as typeof import('onnxruntime-web')).InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  return { api, session, metadata, label: option.label }
}

function modelUrlFor(metadataUrl: string, modelFile: string) {
  const base = new URL(metadataUrl, window.location.origin)
  return new URL(modelFile, base).toString()
}
