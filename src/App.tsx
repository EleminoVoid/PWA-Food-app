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

type TutorialStep = {
  targetId: string
  title: string
  body: string
  position: 'above' | 'below' | 'left' | 'right'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'nutriscan_segmentation_history'
const ONBOARDING_KEY = 'nutriscan_onboarded'
const SELECTED_MODEL_KEY = 'nutriscan_selected_model'

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    targetId: 'tut-status',
    title: 'Works offline too',
    body: 'This app identifies food right on your device — no internet required after the first load.',
    position: 'below',
  },
  {
    targetId: 'tut-help',
    title: 'Need help?',
    body: 'Tap this any time to replay this guide.',
    position: 'below',
  },
  {
    targetId: 'tut-hamburger',
    title: 'Menu',
    body: 'Your scan history, accuracy settings, and the option to install the app are all in here.',
    position: 'below',
  },
  {
    targetId: 'tut-gallery',
    title: 'Use a photo from your gallery',
    body: 'Already have a food photo? Tap here to pick it from your library.',
    position: 'above',
  },
  {
    targetId: 'tut-shutter',
    title: 'Take a photo',
    body: 'Point the camera at any food and tap this button. Results appear in seconds.',
    position: 'above',
  },
]

const ONBOARDING_STEPS = [
  {
    id: 1,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    title: 'Point at your food',
    body: 'Hold your phone over any dish, snack, or ingredient.',
  },
  {
    id: 2,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: 'Tap the big button',
    body: 'Press the shutter and the app instantly identifies what it sees.',
  },
  {
    id: 3,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    title: 'See your food history',
    body: 'Every scan is saved so you can look back at what you have eaten.',
  },
]

// ── Accuracy levels (hides the technical "confidence threshold" concept) ──────

const ACCURACY_LEVELS = [
  { label: 'More results', value: 0.2, desc: 'Catches more items, may include uncertain ones' },
  { label: 'Balanced', value: 0.35, desc: 'Recommended for most situations' },
  { label: 'High accuracy', value: 0.55, desc: 'Only very confident detections shown' },
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
  } catch { /* quota exceeded */ }
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

function isRunningAsPwa() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
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
      else reject(new Error('Could not read image.'))
    }
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function labelToDisplay(label: string) {
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getFriendlyAccuracy(score: number): string {
  if (score >= 0.85) return 'Very confident'
  if (score >= 0.7) return 'Confident'
  if (score >= 0.5) return 'Likely'
  return 'Possible'
}

// ── Tutorial overlay ──────────────────────────────────────────────────────────

function TutorialOverlay({ steps, onDone }: { steps: TutorialStep[]; onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [bubbleStyle, setBubbleStyle] = useState<React.CSSProperties>({})
  const [spotStyle, setSpotStyle] = useState<React.CSSProperties>({})
  const [arrowDir, setArrowDir] = useState<TutorialStep['position']>('below')

  const current = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1

  useEffect(() => {
    const el = document.querySelector(`[data-tutorial-id="${current.targetId}"]`)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const PAD = 10

    setSpotStyle({
      top: rect.top - PAD,
      left: rect.left - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
      borderRadius: 14,
    })

    const BUBBLE_W = Math.min(270, vw - 32)
    const BUBBLE_H = 150
    const ARROW = 10
    let pos = current.position
    if (pos === 'below' && rect.bottom + BUBBLE_H + ARROW + 16 > vh) pos = 'above'
    if (pos === 'above' && rect.top - BUBBLE_H - ARROW - 16 < 0) pos = 'below'
    setArrowDir(pos)

    let top: number, left: number
    if (pos === 'below') { top = rect.bottom + ARROW + 8; left = rect.left + rect.width / 2 - BUBBLE_W / 2 }
    else if (pos === 'above') { top = rect.top - BUBBLE_H - ARROW - 8; left = rect.left + rect.width / 2 - BUBBLE_W / 2 }
    else if (pos === 'left') { top = rect.top + rect.height / 2 - BUBBLE_H / 2; left = rect.left - BUBBLE_W - ARROW - 8 }
    else { top = rect.top + rect.height / 2 - BUBBLE_H / 2; left = rect.right + ARROW + 8 }

    left = Math.max(16, Math.min(left, vw - BUBBLE_W - 16))
    top = Math.max(16, Math.min(top, vh - BUBBLE_H - 16))
    setBubbleStyle({ top, left, width: BUBBLE_W })
  }, [stepIndex, current])

  return (
    <div className="tutorial-root" role="dialog" aria-modal="true" aria-label="App guide">
      <div className="tutorial-dim" aria-hidden="true" />
      <div className="tutorial-spot" style={spotStyle} aria-hidden="true" />
      <div className={`tutorial-bubble tutorial-bubble--${arrowDir}`} style={bubbleStyle}>
        <div className="tutorial-progress">
          {steps.map((_, i) => (
            <span key={i} className={`tutorial-pip${i === stepIndex ? ' tutorial-pip--active' : ''}`} />
          ))}
        </div>
        <strong className="tutorial-title">{current.title}</strong>
        <p className="tutorial-body">{current.body}</p>
        <button type="button" className="tutorial-next" onClick={() => isLast ? onDone() : setStepIndex(i => i + 1)}>
          {isLast ? 'Got it!' : 'Next'}
        </button>
      </div>
    </div>
  )
}

// ── Onboarding modal ──────────────────────────────────────────────────────────

function OnboardingModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-logo-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="modal-logo">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <h1 className="modal-title">Welcome to FoodLens</h1>
          <p className="modal-subtitle">
            Point your camera at any food and find out exactly what it is — works right on your phone, no internet needed.
          </p>
        </div>
        <ol className="steps-list">
          {ONBOARDING_STEPS.map((step) => (
            <li key={step.id} className="step">
              <div className="step-icon-wrap">{step.icon}</div>
              <div className="step-body">
                <strong className="step-title">{step.title}</strong>
                <span className="step-desc">{step.body}</span>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn-primary" onClick={onDismiss}>
          Let&apos;s go
        </button>
      </div>
    </div>
  )
}

// ── Detection result list ─────────────────────────────────────────────────────

function FoodResultList({ result }: { result: SegmentResult }) {
  const sorted = [...result.detections].sort((a, b) => b.score - a.score)
  if (sorted.length === 0) return null
  return (
    <ul className="food-result-list">
      {sorted.map((det, i) => (
        <li key={i} className={`food-result-item${i === 0 ? ' food-result-item--top' : ''}`}>
          <div className="food-result-bar-wrap">
            <div
              className="food-result-bar"
              style={{ width: `${(det.score * 100).toFixed(0)}%` }}
              aria-hidden="true"
            />
          </div>
          <span className="food-result-name">{labelToDisplay(det.label)}</span>
          <span className="food-result-confidence">{getFriendlyAccuracy(det.score)}</span>
        </li>
      ))}
    </ul>
  )
}

// ── History card ──────────────────────────────────────────────────────────────

function HistoryCard({ record }: { record: ScanRecord }) {
  const top = record.result.detections.reduce<typeof record.result.detections[0] | null>(
    (best, det) => (!best || det.score > best.score ? det : best),
    null,
  )
  const count = record.result.detections.length
  return (
    <div className="history-item">
      <img src={record.overlayDataUrl} alt="" className="history-thumb" />
      <div className="history-meta">
        <span className="history-label">{top ? labelToDisplay(top.label) : 'Nothing found'}</span>
        <span className="history-sublabel">
          {count > 1 ? `+${count - 1} more item${count - 1 !== 1 ? 's' : ''}` : 'Single item'}
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

  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [tutorialActive, setTutorialActive] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [resultRecord, setResultRecord] = useState<ScanRecord | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>(() => readHistory())
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isPwa] = useState(() => isRunningAsPwa())
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => readSelectedModel())
  const [accuracyIndex, setAccuracyIndex] = useState(1) // default: Balanced
  const [iouThreshold] = useState(0.5)

  const confidenceThreshold = ACCURACY_LEVELS[accuracyIndex].value

  const stats = useMemo(() => ({
    scans: scanHistory.length,
    detections: scanHistory.reduce((sum, r) => sum + r.result.detections.length, 0),
  }), [scanHistory])

  useEffect(() => { saveHistory(scanHistory) }, [scanHistory])

  useEffect(() => {
    try { localStorage.setItem(SELECTED_MODEL_KEY, selectedModel) } catch { /* noop */ }
  }, [selectedModel])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    if (isPwa) return
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent) }
    const installed = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [isPwa])

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
    } catch {
      setErrorMessage("We couldn't access your camera. Please check your permissions and try again.")
      setIsCameraActive(false)
    }
  }, [stopCamera])

  useEffect(() => {
    startCamera()
    warmSegmentationModels().catch(() => { /* warm silently */ })
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const analyzeImage = useCallback(async (dataUrl: string, source: ScanRecord['source']) => {
    setIsAnalyzing(true)
    setErrorMessage('')
    setResultRecord(null)
    try {
      const { result, input } = await runSegmentation(selectedModel, dataUrl, {
        confidenceThreshold,
        iouThreshold,
      })
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
    } catch {
      setErrorMessage("Something went wrong while identifying the food. Please try again.")
    } finally {
      setIsAnalyzing(false)
    }
  }, [selectedModel, confidenceThreshold, iouThreshold])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) { setErrorMessage("Camera isn't ready yet — please wait a moment."); return }
    if (!video.videoWidth || !video.videoHeight) {
      setErrorMessage("Wait for the camera to fully load before taking a photo.")
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    void analyzeImage(canvas.toDataURL('image/jpeg', 0.82), 'camera')
  }, [analyzeImage])

  const openGallery = () => {
    pickerOpenRef.current = true
    setErrorMessage('')
    const handleFocus = () => {
      setTimeout(() => { pickerOpenRef.current = false }, 600)
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
    } catch {
      setErrorMessage("We couldn't open that photo. Please try a different one.")
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

  // Friendly name for the top result
  const topDetection = resultRecord?.result.detections.reduce<typeof resultRecord.result.detections[0] | null>(
    (best, d) => (!best || d.score > best.score ? d : best), null,
  ) ?? null

  return (
    <div className="app-shell">
      {showOnboarding && <OnboardingModal onDismiss={dismissOnboarding} />}
      {tutorialActive && (
        <TutorialOverlay steps={TUTORIAL_STEPS} onDone={() => setTutorialActive(false)} />
      )}

      <main className="camera-app" aria-label="FoodLens">
        <section className="camera-stage" aria-label="Camera">
          <video ref={videoRef} className="camera-video" muted autoPlay playsInline />
          <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
          <canvas ref={overlayCanvasRef} className="hidden-canvas" aria-hidden="true" />

          {/* Top bar */}
          <div className="topbar-overlay">
            <div className="status-pill" data-tutorial-id="tut-status">
              <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
              <span className="status-label">{isOnline ? 'Ready' : 'Offline'}</span>
            </div>
            <div className="topbar-right">
              <button
                type="button"
                className="topbar-icon-button"
                aria-label="Help"
                data-tutorial-id="tut-help"
                onClick={() => setTutorialActive(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>
              <button
                type="button"
                className="hamburger-button"
                aria-label="Open menu"
                data-tutorial-id="tut-hamburger"
                onClick={() => setSideMenuOpen(true)}
              >
                <span /><span /><span />
              </button>
            </div>
          </div>

          {/* Viewfinder guides */}
          <div className="viewfinder" aria-hidden="true">
            <span className="vf-corner vf-tl" />
            <span className="vf-corner vf-tr" />
            <span className="vf-corner vf-bl" />
            <span className="vf-corner vf-br" />
          </div>

          {/* Hint label under viewfinder */}
          {isCameraActive && !isAnalyzing && !resultRecord && (
            <p className="viewfinder-hint">Point at your food and tap the button</p>
          )}

          {/* Camera not available */}
          {!isCameraActive && !isAnalyzing && !resultRecord && (
            <div className="camera-overlay">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="camera-off-icon">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <p className="camera-off-title">Camera not available</p>
              <p className="camera-off-body">Check that you have given camera permission in your browser settings.</p>
              <button type="button" className="btn-retry" onClick={startCamera}>Try again</button>
            </div>
          )}

          {/* Analyzing */}
          {isAnalyzing && (
            <div className="analyzing-overlay" aria-live="polite">
              <div className="analyzing-ring" aria-hidden="true">
                <div className="analyzing-spinner" />
              </div>
              <p className="analyzing-title">Identifying your food&hellip;</p>
              <p className="analyzing-sub">This only takes a second</p>
            </div>
          )}

          {/* Error */}
          {errorMessage && !isAnalyzing && (
            <div className="error-banner" role="alert">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="error-icon">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Result sheet */}
          {resultRecord && (
            <div className="result-overlay" role="dialog" aria-label="Scan result">
              <img
                src={resultRecord.overlayDataUrl}
                alt="Identified food"
                className="result-bg-image"
              />
              <div className="result-sheet">
                {topDetection ? (
                  <>
                    <div className="result-eyebrow">Looks like&hellip;</div>
                    <h2 className="result-headline">{labelToDisplay(topDetection.label)}</h2>
                    <div className="result-certainty-row">
                      <span className="result-certainty-badge">
                        {getFriendlyAccuracy(topDetection.score)}
                      </span>
                      {resultRecord.result.detections.length > 1 && (
                        <span className="result-more-label">
                          {resultRecord.result.detections.length - 1} more item{resultRecord.result.detections.length - 1 !== 1 ? 's' : ''} found
                        </span>
                      )}
                    </div>
                    {resultRecord.result.detections.length > 1 && (
                      <FoodResultList result={resultRecord.result} />
                    )}
                  </>
                ) : (
                  <>
                    <div className="result-eyebrow">Hmm&hellip;</div>
                    <h2 className="result-headline">No food found</h2>
                    <p className="result-no-food-hint">Try moving closer, improving the lighting, or adjusting the accuracy in settings.</p>
                  </>
                )}
                <div className="result-actions">
                  <button type="button" className="btn-retake" onClick={takeAnother}>
                    Try again
                  </button>
                  <button type="button" className="btn-use" onClick={saveResult}>
                    Save to journal
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
                aria-label="Choose from gallery"
                disabled={isAnalyzing}
                data-tutorial-id="tut-gallery"
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
                data-tutorial-id="tut-shutter"
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

        {/* ── Side menu ── */}
        {sideMenuOpen && (
          <div
            className="side-menu-backdrop"
            aria-hidden="true"
            onClick={() => setSideMenuOpen(false)}
          />
        )}
        <aside className={`side-menu${sideMenuOpen ? ' side-menu--open' : ''}`} aria-label="Menu">
          <div className="side-menu-header">
            <div className="side-menu-brand">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="side-menu-logo">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="side-menu-brand-name">FoodLens</span>
            </div>
            <button
              type="button"
              className="side-menu-close"
              aria-label="Close menu"
              onClick={() => setSideMenuOpen(false)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Install */}
          {!isPwa && installPrompt && (
            <button type="button" className="side-menu-install" onClick={handleInstall}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15V3m0 12-4-4m4 4 4-4" />
                <path d="M2 17v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2" />
              </svg>
              Add to Home Screen
            </button>
          )}

          {/* Accuracy */}
          <div className="side-menu-section-label">Accuracy</div>
          <div className="side-accuracy-group">
            {ACCURACY_LEVELS.map((level, i) => (
              <button
                key={level.label}
                type="button"
                className={`side-accuracy-btn${accuracyIndex === i ? ' side-accuracy-btn--active' : ''}`}
                onClick={() => setAccuracyIndex(i)}
              >
                <span className="side-accuracy-name">{level.label}</span>
                <span className="side-accuracy-desc">{level.desc}</span>
              </button>
            ))}
          </div>

          {/* Model — shown as "Speed" vs "Accuracy" choice, no technical names */}
          <div className="side-menu-section-label">Detection mode</div>
          <div className="side-model-group">
            {MODEL_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`side-model-btn${selectedModel === opt.id ? ' side-model-btn--active' : ''}`}
                onClick={() => setSelectedModel(opt.id)}
              >
                {opt.id === 'yolo' ? 'Fast' : 'Detailed'}
              </button>
            ))}
          </div>

          {/* History */}
          <div className="side-menu-section-label">
            Food journal
            {stats.scans > 0 && (
              <span className="side-history-count">{stats.scans} scan{stats.scans !== 1 ? 's' : ''}</span>
            )}
          </div>

          {scanHistory.length > 0 && (
            <div className="side-journal-actions">
              <button
                type="button"
                className="side-menu-clear"
                onClick={() => { setScanHistory([]); saveHistory([]) }}
              >
                Clear journal
              </button>
            </div>
          )}

          {scanHistory.length === 0 ? (
            <p className="side-menu-empty">
              Your food journal is empty. Take your first photo to get started.
            </p>
          ) : (
            <ul className="side-menu-history-list">
              {scanHistory.map((item) => (
                <li key={item.id}>
                  <HistoryCard record={item} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
