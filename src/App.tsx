import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'
import './segmentation.css'
import { drawSegmentationOverlay } from './inference/image'
import { MODEL_OPTIONS } from './inference/models'
import { runSegmentation, warmSegmentationModels } from './inference/segmentation'
import type { ImageInput, ModelId, SegmentDetection, SegmentResult } from './inference/types'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type ScanRecord = {
  id: string
  source: 'camera' | 'upload'
  imageDataUrl: string
  overlayDataUrl: string
  createdAt: string
  result: SegmentResult
}

type Screen = 'home' | 'scan' | 'history'

const HISTORY_KEY = 'nutriscan_segmentation_history'
const ONBOARDING_KEY = 'nutriscan_onboarded'
const SELECTED_MODEL_KEY = 'nutriscan_selected_model'

const defaultThresholds = {
  confidenceThreshold: 0.35,
  iouThreshold: 0.5,
}

const emptyStats = {
  scans: 0,
  detections: 0,
  modelsUsed: 0,
}

function readHistory(): ScanRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as ScanRecord[]) : []
    return parsed.filter((item) => Boolean(
      item.id &&
      item.createdAt &&
      item.imageDataUrl &&
      item.overlayDataUrl &&
      item.result?.detections,
    ))
  } catch {
    return []
  }
}

function readSelectedModel(): ModelId {
  try {
    const stored = localStorage.getItem(SELECTED_MODEL_KEY)
    return stored === 'rfdetr' ? 'rfdetr' : 'yolo'
  } catch {
    return 'yolo'
  }
}

function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return false
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Could not read the selected image as a data URL.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function serializeDetections(detections: SegmentDetection[]) {
  return detections.map((detection) => ({
    label: detection.label,
    confidence: Number(detection.score.toFixed(4)),
    box: {
      x1: Math.round(detection.box[0]),
      y1: Math.round(detection.box[1]),
      x2: Math.round(detection.box[2]),
      y2: Math.round(detection.box[3]),
      width: Math.round(detection.box[2] - detection.box[0]),
      height: Math.round(detection.box[3] - detection.box[1]),
    },
    points: detection.points.map(([x, y]) => [Math.round(x), Math.round(y)]),
  }))
}

function resultJson(result: SegmentResult) {
  return JSON.stringify(
    {
      model: result.modelLabel,
      modelType: result.modelType,
      elapsedMs: Math.round(result.elapsedMs),
      image: {
        width: result.imageWidth,
        height: result.imageHeight,
      },
      detections: serializeDetections(result.detections),
    },
    null,
    2,
  )
}

function formatScore(score: number) {
  return score.toFixed(2)
}

function formatScorePercent(score: number) {
  return `${(score * 100).toFixed(1)}%`
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [screen, setScreen] = useState<Screen>('home')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [latestResult, setLatestResult] = useState<ScanRecord | null>(null)
  const [history, setHistory] = useState<ScanRecord[]>(readHistory)
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installMessage, setInstallMessage] = useState('')
  const [fullPreview, setFullPreview] = useState<ScanRecord | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelId>(readSelectedModel)
  const [confidenceThreshold, setConfidenceThreshold] = useState(defaultThresholds.confidenceThreshold)
  const [iouThreshold, setIouThreshold] = useState(defaultThresholds.iouThreshold)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [modelStatus, setModelStatus] = useState('Models will load on first scan.')

  const selectedModelOption = MODEL_OPTIONS.find((model) => model.id === selectedModel) ?? MODEL_OPTIONS[0]

  const stats = useMemo(() => {
    if (!history.length) return emptyStats
    const detections = history.reduce((sum, item) => sum + item.result.detections.length, 0)
    const modelsUsed = new Set(history.map((item) => item.result.modelId)).size
    return { scans: history.length, detections, modelsUsed }
  }, [history])

  const displayedResult = latestResult ?? history[0] ?? null

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setInstallMessage('Ready to install for offline use.')
    }
    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setInstallMessage('NutriScan is installed.')
    }
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    warmSegmentationModels()
      .then(() => setModelStatus('YOLO and RF-DETR are ready for offline inference.'))
      .catch((error) => {
        console.warn('Model warmup failed.', error)
        setModelStatus('Model warmup failed. A scan will retry loading the selected model.')
      })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8)))
    } catch {
      console.warn('NutriScan history could not be persisted.')
    }
  }, [history])

  useEffect(() => {
    try {
      localStorage.setItem(SELECTED_MODEL_KEY, selectedModel)
    } catch {
      // The model can still be selected for this session.
    }
  }, [selectedModel])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsCameraActive(false)
  }

  const startCamera = async () => {
    const video = videoRef.current
    if (!video) return

    setErrorMessage('')
    stopCamera()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      setIsCameraActive(true)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Camera access failed. Check permissions and try again.',
      )
    }
  }

  useEffect(() => {
    if (screen !== 'scan') return

    const startTimer = window.setTimeout(() => {
      void startCamera()
    }, 0)

    return () => {
      window.clearTimeout(startTimer)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    // Camera startup is intentionally tied only to entering the scan screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const saveResult = (record: ScanRecord) => {
    setLatestResult(record)
    setHistory((items) => [record, ...items].slice(0, 20))
    setScreen('home')
    setErrorMessage('')
  }

  const analyzeImage = async (imageDataUrl: string, source: ScanRecord['source']) => {
    const canvas = canvasRef.current
    if (!canvas) {
      setErrorMessage('Unable to prepare the segmentation canvas.')
      return
    }

    setIsAnalyzing(true)
    setErrorMessage('')
    setModelStatus(`Running ${selectedModelOption.label}...`)

    try {
      const { input, result } = await runSegmentation(selectedModel, imageDataUrl, {
        confidenceThreshold,
        iouThreshold,
      })
      drawSegmentationOverlay(canvas, input as ImageInput, result.detections)
      const overlayDataUrl = canvas.toDataURL('image/jpeg', 0.86)
      const record: ScanRecord = {
        id: crypto.randomUUID(),
        source,
        imageDataUrl,
        overlayDataUrl,
        result,
        createdAt: new Date().toISOString(),
      }
      saveResult(record)
      setModelStatus(`${result.modelLabel} finished with ${result.detections.length} detections.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ONNX inference failed.')
      setModelStatus('Inference failed. Check the model files and browser console.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setErrorMessage('Start the camera and wait for the preview before scanning.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setErrorMessage('Unable to prepare the photo buffer.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageDataUrl = canvas.toDataURL('image/png')
    stopCamera()
    void analyzeImage(imageDataUrl, 'camera')
  }

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const imageDataUrl = await fileToDataUrl(file)
      await analyzeImage(imageDataUrl, 'upload')
      event.target.value = ''
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not prepare the selected photo.',
      )
    }
  }

  const installApp = async () => {
    if (!installPrompt) {
      setInstallMessage('Already installed or waiting for the browser install prompt. Offline use works after one production load.')
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    setInstallMessage(
      choice.outcome === 'accepted'
        ? 'Install started. Offline shell and model cache are available after first load.'
        : 'Install dismissed. You can try again later.',
    )
  }

  const dismissOnboarding = () => {
    setShowOnboarding(false)
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      // Local storage may be disabled; the app can still run.
    }
  }

  const clearHistory = () => {
    setHistory([])
    setLatestResult(null)
  }

  return (
    <main className="app-shell">
      {showOnboarding && (
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <div className="brand-mark" aria-hidden="true">N</div>
          <div>
            <p className="eyebrow">Offline-ready segmentation</p>
            <h1 id="welcome-title">Meet NutriScan</h1>
            <p>
              Capture or upload a meal and run YOLO or RF-DETR segmentation directly
              on this device. The result is boxes, mask overlays, and JSON points.
            </p>
          </div>
          <button type="button" className="primary-action" onClick={dismissOnboarding}>
            Start scanning
          </button>
        </section>
      )}

      <header className="topbar">
        <button type="button" className="brand-button" onClick={() => setScreen('home')}>
          <span className="brand-mark small" aria-hidden="true">N</span>
          <span>
            <strong>NutriScan</strong>
            <small>{isOnline ? 'Online' : 'Offline mode'}</small>
          </span>
        </button>

        <button type="button" className="install-button" onClick={installApp}>
          <span aria-hidden="true">↓</span>
          Install
        </button>
      </header>

      {installMessage && <p className="status-note">{installMessage}</p>}
      <p className="status-note">{modelStatus}</p>

      {screen === 'home' && (
        <section className="home-grid" aria-label="NutriScan dashboard">
          <div className="hero-panel">
            <p className="eyebrow">On-device food segmentation</p>
            <h2>Scan food, inspect masks, export JSON.</h2>
            <p>
              Choose YOLO or RF-DETR before scanning. Each model uses its own preprocessing
              path and runs locally through ONNX Runtime Web.
            </p>
            <ModelControls
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              confidenceThreshold={confidenceThreshold}
              onConfidenceChange={setConfidenceThreshold}
              iouThreshold={iouThreshold}
              onIouChange={setIouThreshold}
              disabled={isAnalyzing}
            />
            <div className="hero-actions">
              <button type="button" className="primary-action" onClick={() => setScreen('scan')} disabled={isAnalyzing}>
                Scan food
              </button>
              <button type="button" className="secondary-action" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}>
                Upload photo
              </button>
            </div>
          </div>

          <div className="stats-strip" aria-label="Scan stats">
            <article>
              <strong>{stats.scans}</strong>
              <span>Saved scans</span>
            </article>
            <article>
              <strong>{stats.detections}</strong>
              <span>Total detections</span>
            </article>
            <article>
              <strong>{stats.modelsUsed}</strong>
              <span>Models used</span>
            </article>
          </div>

          {isAnalyzing && (
            <section className="empty-result">
              <h3>Running segmentation</h3>
              <p>{selectedModelOption.label} is processing the image. First load may take longer while the model is cached.</p>
            </section>
          )}

          {displayedResult ? (
            <ResultCard result={displayedResult} onOpenPreview={setFullPreview} />
          ) : (
            <section className="empty-result">
              <h3>No food segmented yet</h3>
              <p>Take a photo or upload one to see mask overlays, boxes, confidence scores, and JSON points.</p>
            </section>
          )}
        </section>
      )}

      {screen === 'scan' && (
        <section className="scan-layout" aria-label="Food scanner">
          <div className="camera-card">
            <video ref={videoRef} className="camera-video" muted autoPlay playsInline />
            {!isCameraActive && (
              <div className="camera-placeholder">
                <span aria-hidden="true">⌾</span>
                <h2>Camera is paused</h2>
                <p>Use live camera when available, or open the device camera picker.</p>
                <div className="camera-fallback-actions">
                  <button type="button" className="primary-action" onClick={startCamera} disabled={isAnalyzing}>
                    Start camera
                  </button>
                  <button type="button" className="secondary-action" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}>
                    Take or upload photo
                  </button>
                </div>
              </div>
            )}
            <div className="viewfinder" aria-hidden="true" />
          </div>

          {errorMessage && <p className="error-message">{errorMessage}</p>}

          <div className="scan-actions">
            <button type="button" className="secondary-action" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}>
              Upload
            </button>
            <button type="button" className="capture-action" onClick={capturePhoto} disabled={isAnalyzing}>
              {isAnalyzing ? '...' : 'Scan'}
            </button>
            <button type="button" className="secondary-action" onClick={stopCamera} disabled={isAnalyzing}>
              Pause
            </button>
          </div>
        </section>
      )}

      {screen === 'history' && (
        <section className="history-view" aria-label="Scan history">
          <div className="section-title">
            <div>
              <p className="eyebrow">Private log</p>
              <h2>Recent segmentations</h2>
            </div>
            <button type="button" className="text-action" onClick={clearHistory}>
              Clear
            </button>
          </div>

          {history.length ? (
            <div className="history-list">
              {history.map((item) => (
                <article className="history-item" key={item.id}>
                  <img src={item.overlayDataUrl} alt="" />
                  <div>
                    <strong>{item.result.modelLabel}</strong>
                    <span>{formatTime(item.createdAt)} · {item.result.detections.length} detections · {item.source}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="empty-result">
              <h3>No saved scans</h3>
              <p>Your latest segmentation runs will appear here and remain stored locally on this device.</p>
            </section>
          )}
        </section>
      )}

      {errorMessage && screen !== 'scan' && <p className="error-message">{errorMessage}</p>}

      {fullPreview && (
        <FullPreviewModal result={fullPreview} onClose={() => setFullPreview(null)} />
      )}

      <nav className="bottom-nav" aria-label="Main navigation">
        <button type="button" className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}>
          Home
        </button>
        <button type="button" className={screen === 'scan' ? 'active' : ''} onClick={() => setScreen('scan')}>
          Scan
        </button>
        <button type="button" className={screen === 'history' ? 'active' : ''} onClick={() => setScreen('history')}>
          History
        </button>
      </nav>

      <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden-input"
        onChange={handleFilePick}
      />
    </main>
  )
}

function ModelControls({
  selectedModel,
  onModelChange,
  confidenceThreshold,
  onConfidenceChange,
  iouThreshold,
  onIouChange,
  disabled,
}: {
  selectedModel: ModelId
  onModelChange: (modelId: ModelId) => void
  confidenceThreshold: number
  onConfidenceChange: (value: number) => void
  iouThreshold: number
  onIouChange: (value: number) => void
  disabled: boolean
}) {
  return (
    <div className="model-panel" aria-label="Model and threshold controls">
      <div className="model-switcher">
        {MODEL_OPTIONS.map((model) => (
          <button
            type="button"
            key={model.id}
            className={selectedModel === model.id ? 'active' : ''}
            onClick={() => onModelChange(model.id)}
            disabled={disabled}
          >
            <strong>{model.label}</strong>
            <span>{model.description}</span>
          </button>
        ))}
      </div>

      <label>
        Confidence {confidenceThreshold.toFixed(2)}
        <input
          type="range"
          min="0.05"
          max="0.95"
          step="0.05"
          value={confidenceThreshold}
          onChange={(event) => onConfidenceChange(Number(event.target.value))}
          disabled={disabled}
        />
      </label>

      <label>
        IoU {iouThreshold.toFixed(2)}
        <input
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          value={iouThreshold}
          onChange={(event) => onIouChange(Number(event.target.value))}
          disabled={disabled}
        />
      </label>
    </div>
  )
}

function ResultCard({
  result,
  onOpenPreview,
}: {
  result: ScanRecord
  onOpenPreview: (record: ScanRecord) => void
}) {
  const topDetection = result.result.detections[0]

  return (
    <section className="result-card" aria-label="Latest segmentation result">
      <button
        type="button"
        className="result-preview"
        aria-label="Open full segmentation preview"
        onClick={() => onOpenPreview(result)}
      >
        <img src={result.overlayDataUrl} alt="" />
        <span>Open full preview</span>
      </button>
      <div className="result-content">
        <div>
          <p className="eyebrow">{result.result.modelLabel}</p>
          <h2>{topDetection ? topDetection.label : 'No detections'}</h2>
          <span className="confidence">
            {result.result.detections.length} detections · {Math.round(result.result.elapsedMs)} ms
          </span>
        </div>

        {result.result.detections.length ? (
          <div className="detection-list">
            {result.result.detections.slice(0, 5).map((detection, index) => (
              <span key={`${detection.label}-${index}`}>
                <strong>{detection.label}</strong>
                {formatScore(detection.score)} ({formatScorePercent(detection.score)})
              </span>
            ))}
          </div>
        ) : (
          <p className="tip">No objects passed the current confidence threshold. Try lowering it or switching models.</p>
        )}

        <pre className="result-json">{resultJson(result.result)}</pre>
      </div>
    </section>
  )
}

function FullPreviewModal({
  result,
  onClose,
}: {
  result: ScanRecord
  onClose: () => void
}) {
  return (
    <section className="preview-modal" role="dialog" aria-modal="true" aria-label="Full segmentation preview">
      <div className="preview-modal__bar">
        <div>
          <p className="eyebrow">{result.result.modelLabel}</p>
          <h2>{result.result.detections.length} detections</h2>
        </div>
        <button type="button" className="secondary-action" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="preview-modal__image">
        <img src={result.overlayDataUrl} alt="Full segmentation overlay" />
      </div>
    </section>
  )
}

export default App
