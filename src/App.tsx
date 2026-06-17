import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'
import './segmentation.css'
import { drawSegmentationOverlay } from './inference/image'
import { MODEL_OPTIONS } from './inference/models'
import { runSegmentation, warmSegmentationModels } from './inference/segmentation'
import type { ModelId, SegmentResult } from './inference/types'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'nutriscan_segmentation_history'
const ONBOARDING_KEY = 'nutriscan_onboarded'
const SELECTED_MODEL_KEY = 'nutriscan_selected_model'

const STEPS = [
  {
    id: 1,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    title: 'Open the camera',
    body: 'The camera launches automatically. Make sure you are in a well-lit area.',
  },
  {
    id: 2,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <polyline points="3 7 3 3 7 3" />
        <polyline points="17 3 21 3 21 7" />
        <polyline points="21 17 21 21 17 21" />
        <polyline points="7 21 3 21 3 17" />
      </svg>
    ),
    title: 'Frame the food',
    body: 'Center the dish inside the bracket guides. Keep the camera steady.',
  },
  {
    id: 3,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: 'Tap the shutter',
    body: 'Press the large button to capture. The on-device ONNX model segments the food instantly.',
  },
  {
    id: 4,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <polyline points="3 9 21 9" />
        <polyline points="9 21 9 9" />
      </svg>
    ),
    title: 'Upload a photo',
    body: 'Tap the gallery icon to pick an image from your library instead.',
  },
]

// ── Storage helpers ───────────────────────────────────────────────────────────

function readHistory(): ScanRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as ScanRecord[]) : []
    return parsed.filter((item) =>
      Boolean(item.id && item.createdAt && item.imageDataUrl && item.overlayDataUrl && item.result?.detections),
    )
  } catch {
    return []
  }
}

function saveHistory(records: ScanRecord[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records))
  } catch { /* quota exceeded — silently skip */ }
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
  try { return localStorage.getItem(ONBOARDING_KEY) === '1' } catch { return false }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read image as data URL.'))
    }
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function formatScorePercent(score: number) {
  return `${(score * 100).toFixed(1)}%`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OnboardingModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="How to use NutriScan">
      <div className="modal">
        <div className="modal-header">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="modal-logo">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <h1 className="modal-title">Welcome to NutriScan</h1>
          <p className="modal-subtitle">
            Point your camera at any food and the on-device ONNX model will identify and segment it.
          </p>
        </div>

        <ol className="steps-list">
          {STEPS.map((step) => (
            <li key={step.id} className="step">
              <div className="step-placeholder">
                {step.icon}
                <span className="step-placeholder-label">Add screenshot here</span>
              </div>
              <div className="step-body">
                <strong className="step-title">{step.title}</strong>
                <span className="step-desc">{step.body}</span>
              </div>
            </li>
          ))}
        </ol>

        <button type="button" className="btn-primary" onClick={onDismiss}>
          Get Started
        </button>
      </div>
    </div>
  )
}

function DetectionList({ result }: { result: SegmentResult }) {
  const sorted = [...result.detections].sort((a, b) => b.score - a.score)
  if (sorted.length === 0) return null
  return (
    <div className="detection-list">
      {sorted.map((det, i) => (
        <div key={i} className="detection-row">
          <span className="detection-label">{det.label}</span>
          <span className="detection-score">{formatScorePercent(det.score)}</span>
          <div
            className="detection-bar"
            style={{ width: `${(det.score * 100).toFixed(1)}%` }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  )
}

function HistoryCard({ record }: { record: ScanRecord }) {
  const top = record.result.detections.reduce<typeof record.result.detections[0] | null>(
    (best, det) => (!best || det.score > best.score ? det : best),
    null,
  )
  return (
    <div className="history-item">
      <img src={record.overlayDataUrl} alt="Scan overlay" className="history-thumb" />
      <div className="history-meta">
        <span className="history-label">{top?.label ?? 'Unknown food'}</span>
        <span className="history-sublabel">
          {record.result.detections.length} detection{record.result.detections.length !== 1 ? 's' : ''} &middot; {record.result.modelLabel}
        </span>
        <span className="history-time">{formatTime(record.createdAt)}</span>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pickerOpenRef = useRef(false)

  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [resultRecord, setResultRecord] = useState<ScanRecord | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>(() => readHistory())
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => readSelectedModel())
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.35)
  const [iouThreshold] = useState(0.5)

  const selectedModelOption = MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS[0]

  const stats = useMemo(() => ({
    scans: scanHistory.length,
    detections: scanHistory.reduce((sum, r) => sum + r.result.detections.length, 0),
    modelsUsed: new Set(scanHistory.map((r) => r.result.modelId)).size,
  }), [scanHistory])

  // Persist history
  useEffect(() => { saveHistory(scanHistory) }, [scanHistory])

  // Persist selected model
  useEffect(() => {
    try { localStorage.setItem(SELECTED_MODEL_KEY, selectedModel) } catch { /* noop */ }
  }, [selectedModel])

  // Online / offline
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Install prompt
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent) }
    const installed = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  // Camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setIsCameraActive(false)
  }, [])

  const startCamera = useCallback(async () => {
    stopCamera()
    setErrorMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setIsCameraActive(true)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Camera permission denied.')
      setIsCameraActive(false)
    }
  }, [stopCamera])

  useEffect(() => {
    startCamera()
    warmSegmentationModels().catch(() => { /* warm silently */ })
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Analyze
  const analyzeImage = useCallback(async (dataUrl: string, source: ScanRecord['source']) => {
    setIsAnalyzing(true)
    setErrorMessage('')
    setResultRecord(null)
    try {
      const { result, input } = await runSegmentation(selectedModel, dataUrl, {
        confidenceThreshold,
        iouThreshold,
      })

      // Draw segmentation overlay onto a canvas
      const oc = overlayCanvasRef.current ?? document.createElement('canvas')
      drawSegmentationOverlay(oc, input, result.detections)
      const overlayDataUrl = oc.toDataURL('image/jpeg', 0.82)

      setResultRecord({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source,
        imageDataUrl: dataUrl,
        overlayDataUrl,
        createdAt: new Date().toISOString(),
        result,
      })
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Segmentation failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [selectedModel, confidenceThreshold, iouThreshold])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) { setErrorMessage('Camera is not ready yet.'); return }
    if (!video.videoWidth || !video.videoHeight) {
      setErrorMessage('Wait for the camera feed to load before capturing.')
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) { setErrorMessage('Unable to prepare the photo buffer.'); return }
    ctx.drawImage(video, 0, 0)
    void analyzeImage(canvas.toDataURL('image/jpeg', 0.82), 'camera')
  }, [analyzeImage])

  const openGallery = () => {
    pickerOpenRef.current = true
    setErrorMessage('')
    const handleFocus = () => {
      setTimeout(() => {
        if (pickerOpenRef.current) {
          setErrorMessage('No image selected. Please allow access and pick a photo.')
          pickerOpenRef.current = false
        }
      }, 600)
      window.removeEventListener('focus', handleFocus)
    }
    window.addEventListener('focus', handleFocus)
    fileInputRef.current?.click()
  }

  const handleFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    pickerOpenRef.current = false
    const file = e.target.files?.[0]
    if (!file) return
    try {
      void analyzeImage(await fileToDataUrl(file), 'upload')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load the selected photo.')
    }
    e.target.value = ''
  }

  const saveResult = () => {
    if (!resultRecord) return
    setScanHistory((prev) => [resultRecord, ...prev])
    setResultRecord(null)
  }

  const takeAnother = () => setResultRecord(null)

  const dismissOnboarding = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch { /* noop */ }
    setShowOnboarding(false)
  }

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {showOnboarding && <OnboardingModal onDismiss={dismissOnboarding} />}

      <main className="camera-app" aria-label="NutriScan food scanner">
        <section className="camera-stage" aria-label="Camera preview">
          <video ref={videoRef} className="camera-video" muted autoPlay playsInline />
          <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
          <canvas ref={overlayCanvasRef} className="hidden-canvas" aria-hidden="true" />

          {/* Top bar */}
          <div className="topbar-overlay">
            <div className="status-pill">
              <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
              <span className="status-label">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div className="topbar-right">
              {installPrompt && (
                <button type="button" className="install-button" onClick={handleInstall} aria-label="Install app">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="history-button"
                onClick={() => setShowHistory(true)}
                aria-label="View scan history"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="history-icon">
                  <path d="M12 8v4l3 3" />
                  <path d="M3.05 11a9 9 0 1 1 .5 4" />
                  <polyline points="3 16 3 11 8 11" />
                </svg>
                {scanHistory.length > 0 && (
                  <span className="history-badge" aria-label={`${scanHistory.length} saved scans`}>
                    {scanHistory.length > 99 ? '99+' : scanHistory.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Viewfinder */}
          <div className="viewfinder" aria-hidden="true">
            <span className="vf-corner vf-tl" />
            <span className="vf-corner vf-tr" />
            <span className="vf-corner vf-bl" />
            <span className="vf-corner vf-br" />
          </div>

          {/* Camera paused placeholder */}
          {!isCameraActive && !isAnalyzing && !resultRecord && (
            <div className="camera-overlay">
              <p>Camera paused &mdash; tap the shutter to retry</p>
            </div>
          )}

          {/* Analyzing spinner */}
          {isAnalyzing && (
            <div className="analyzing-overlay" aria-live="polite">
              <div className="analyzing-spinner" aria-hidden="true" />
              <p className="analyzing-label">Running {selectedModelOption.label}&hellip;</p>
            </div>
          )}

          {/* Error banner */}
          {errorMessage && !isAnalyzing && (
            <p className="error-message" role="alert">{errorMessage}</p>
          )}

          {/* Model picker — idle only */}
          {!resultRecord && !isAnalyzing && (
            <div className="model-picker-bar">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`model-chip ${selectedModel === opt.id ? 'model-chip--active' : ''}`}
                  onClick={() => setSelectedModel(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
              <div className="confidence-row">
                <label htmlFor="conf-slider" className="conf-label">
                  Confidence&nbsp;<span className="conf-value">{(confidenceThreshold * 100).toFixed(0)}%</span>
                </label>
                <input
                  id="conf-slider"
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="conf-slider"
                />
              </div>
            </div>
          )}

          {/* Result overlay */}
          {resultRecord && (
            <div className="result-overlay" role="dialog" aria-label="Scan result">
              <img
                src={resultRecord.overlayDataUrl}
                alt="Segmented food"
                className="result-bg-image"
              />
              <div className="result-sheet">
                <div className="result-sheet-header">
                  <div>
                    <p className="result-sheet-category">{resultRecord.result.modelLabel}</p>
                    <h2 className="result-sheet-name">
                      {resultRecord.result.detections.length > 0
                        ? resultRecord.result.detections.reduce((b, d) => d.score > b.score ? d : b).label
                        : 'No food detected'}
                    </h2>
                  </div>
                  <span className="result-confidence-chip">
                    {resultRecord.result.detections.length} detection{resultRecord.result.detections.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <DetectionList result={resultRecord.result} />

                <p className="result-meta">
                  {resultRecord.result.elapsedMs.toFixed(0)}ms &middot; {resultRecord.result.imageWidth}&times;{resultRecord.result.imageHeight}px
                </p>

                <div className="result-sheet-actions">
                  <button type="button" className="btn-retake" onClick={takeAnother}>
                    Take Another
                  </button>
                  <button type="button" className="btn-use" onClick={saveResult}>
                    Save to History
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom controls */}
          {!resultRecord && (
            <div className="controls-row">
              <button
                type="button"
                className="gallery-button"
                onClick={openGallery}
                aria-label="Upload from gallery"
                disabled={isAnalyzing}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="gallery-icon">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>

              <button
                type="button"
                className="capture-button"
                onClick={capturePhoto}
                aria-label="Take photo"
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <span className="capture-spinner" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 4.5 7.6 6H5.5A2.5 2.5 0 0 0 3 8.5v9A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 18.5 6h-2.1L15 4.5H9Zm3 12.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
                  </svg>
                )}
              </button>

              <div className="controls-spacer" aria-hidden="true" />
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden-input"
            onChange={handleFilePick}
          />
        </section>

        {/* History panel */}
        {showHistory && (
          <div className="history-panel" role="dialog" aria-modal="true" aria-label="Scan history">
            <div className="history-header">
              <div>
                <h2 className="history-title">History</h2>
                <p className="history-subtitle">
                  {stats.scans} scan{stats.scans !== 1 ? 's' : ''} &middot; {stats.detections} detections
                </p>
              </div>
              <div className="history-header-actions">
                {scanHistory.length > 0 && (
                  <button
                    type="button"
                    className="history-clear"
                    onClick={() => { setScanHistory([]); saveHistory([]) }}
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  className="history-close"
                  onClick={() => setShowHistory(false)}
                  aria-label="Close history"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {scanHistory.length === 0 ? (
              <p className="history-empty">No scans yet. Take a photo to get started.</p>
            ) : (
              <ul className="history-list">
                {scanHistory.map((item) => (
                  <li key={item.id}>
                    <HistoryCard record={item} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
