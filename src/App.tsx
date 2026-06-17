import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

/* ── ONNX Integration Guide (uncomment when ready to wire in the model) ────────
 *
 * 1. Install:        npm install onnxruntime-web
 * 2. Serve model at: public/models/food_classifier.onnx
 * 3. Session once:   const session = await ort.InferenceSession.create('/models/food_classifier.onnx')
 * 4. Pre-process:    draw to 224×224 canvas → CHW Float32Array [1,3,224,224] tensor
 * 5. Run:            const { output } = await session.run({ input: tensor })
 * 6. Top-1 label:    LABELS[scores.indexOf(Math.max(...scores))]
 *
 * Wire it into confirmPhoto() below — that is the single gated call point.
 * Nutrition card, confidence chip, and results panel are commented out until ready.
 * ────────────────────────────────────────────────────────────────────────────── */

// ── Types ─────────────────────────────────────────────────────────────────────

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type FoodProfile = {
  name: string
  category: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  confidence: number
  tip: string
}

type ScanRecord = FoodProfile & {
  id: string
  source: 'camera' | 'upload'
  imageDataUrl: string
  createdAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'nutriscan_history'
const ONBOARDING_KEY = 'nutriscan_onboarded'

// Demo profiles — replaced by ONNX output once the model is connected
const FOOD_PROFILES: FoodProfile[] = [
  {
    name: 'Garden salad bowl',
    category: 'Vegetable meal',
    calories: 260, protein: 8, carbs: 28, fat: 13, fiber: 9, confidence: 91,
    tip: 'Add beans, egg, tofu, or grilled chicken if this is your main meal.',
  },
  {
    name: 'Chicken rice plate',
    category: 'Balanced meal',
    calories: 520, protein: 34, carbs: 58, fat: 17, fiber: 5, confidence: 87,
    tip: 'Pair it with greens or soup to make the plate more filling.',
  },
  {
    name: 'Fruit snack',
    category: 'Fresh snack',
    calories: 180, protein: 2, carbs: 44, fat: 1, fiber: 7, confidence: 84,
    tip: 'Great for quick energy. Add yogurt or nuts for longer satiety.',
  },
  {
    name: 'Pasta serving',
    category: 'Carb-forward meal',
    calories: 610, protein: 18, carbs: 82, fat: 23, fiber: 6, confidence: 79,
    tip: 'A smaller portion plus vegetables keeps the meal lighter.',
  },
]

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
    body: 'The camera launches automatically when you open the app. Make sure you are in a well-lit area.',
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
    body: 'Fill the frame with the main food item. Good lighting and a steady hand give the best results.',
  },
  {
    id: 3,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
    title: 'Tap the shutter',
    body: 'Press the large white button to capture. Review the photo and confirm or retake before it is saved.',
  },
  {
    id: 4,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="step-icon">
        <polyline points="16 16 12 12 8 16" />
        <line x1="12" y1="12" x2="12" y2="21" />
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      </svg>
    ),
    title: 'Or upload a photo',
    body: 'Tap the gallery button in the bottom-left to pick an existing photo from your device.',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function readHistory(): ScanRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) as Array<Partial<ScanRecord> & { imageUrl?: string }> : []
    return parsed
      .map((item) => ({
        ...item,
        imageDataUrl: item.imageDataUrl ?? (item.imageUrl?.startsWith('data:') ? item.imageUrl : ''),
      }))
      .filter((item): item is ScanRecord => Boolean(
        item.id && item.name && item.category && item.createdAt && item.imageDataUrl,
      ))
  } catch {
    return []
  }
}

function hasSeenOnboarding() {
  try { return localStorage.getItem(ONBOARDING_KEY) === '1' } catch { return false }
}

function pickProfile(seed: number) {
  return FOOD_PROFILES[Math.abs(seed) % FOOD_PROFILES.length]
}

function createRecord(imageDataUrl: string, source: ScanRecord['source'], seed: number): ScanRecord {
  return { ...pickProfile(seed), id: crypto.randomUUID(), source, imageDataUrl, createdAt: new Date().toISOString() }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the selected image.'))
    img.src = URL.createObjectURL(file)
  })
}

function imageToDataUrl(img: HTMLImageElement, maxSize = 900) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Unable to prepare the photo buffer.')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(img.src)
  return canvas.toDataURL('image/jpeg', 0.72)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

// ── Onboarding modal ──────────────────────────────────────────────────────────

function OnboardingModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="modal">
        <div className="modal-header">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="modal-logo">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" />
          </svg>
          <h2 id="onboard-title" className="modal-title">Welcome to NutriScan</h2>
          <p className="modal-subtitle">
            Point your camera at any food and the app will identify it — entirely on-device.
          </p>
        </div>

        <ol className="steps-list">
          {STEPS.map((step) => (
            <li key={step.id} className="step">
              <div className="step-placeholder" aria-label={`Screenshot placeholder for step ${step.id}`}>
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

// ── Result card (shown in history panel) ─────────────────────────────────────

function MacroGrid({ record }: { record: ScanRecord }) {
  return (
    <div className="macro-grid">
      <div className="macro-item macro-cal">
        <span className="macro-value">{record.calories}</span>
        <span className="macro-label">kcal</span>
      </div>
      <div className="macro-item">
        <span className="macro-value">{record.protein}g</span>
        <span className="macro-label">protein</span>
      </div>
      <div className="macro-item">
        <span className="macro-value">{record.carbs}g</span>
        <span className="macro-label">carbs</span>
      </div>
      <div className="macro-item">
        <span className="macro-value">{record.fat}g</span>
        <span className="macro-label">fat</span>
      </div>
      <div className="macro-item">
        <span className="macro-value">{record.fiber}g</span>
        <span className="macro-label">fiber</span>
      </div>
      <div className="macro-item">
        <span className="macro-value">{record.confidence}%</span>
        <span className="macro-label">match</span>
      </div>
    </div>
  )
}

function ResultCard({ record }: { record: ScanRecord }) {
  return (
    <div className="result-card">
      <img src={record.imageDataUrl} alt="" className="result-thumb" />
      <div className="result-body">
        <span className="result-category">{record.category}</span>
        <strong className="result-name">{record.name}</strong>
        <div className="result-mini-macros">
          <span>{record.calories} kcal</span>
          <span>{record.protein}g protein</span>
          <span>{record.carbs}g carbs</span>
        </div>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Tracks whether the file picker is open to detect dismissal without a pick
  const pickerOpenRef = useRef(false)

  const [isCameraActive, setIsCameraActive] = useState(false)
  const [pendingImage, setPendingImage] = useState('')
  const [resultRecord, setResultRecord] = useState<ScanRecord | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding())
  const [showHistory, setShowHistory] = useState(false)
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>(readHistory)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installMessage, setInstallMessage] = useState('')

  // Stats derived from history
  const stats = useMemo(() => {
    if (!scanHistory.length) return { scans: 0, averageCalories: 0, protein: 0 }
    const calories = Math.round(scanHistory.reduce((s, r) => s + r.calories, 0) / scanHistory.length)
    const protein = Math.round(scanHistory.reduce((s, r) => s + r.protein, 0))
    return { scans: scanHistory.length, averageCalories: calories, protein }
  }, [scanHistory])

  // Persist history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(scanHistory.slice(0, 20)))
    } catch {
      console.warn('NutriScan history could not be persisted.')
    }
  }, [scanHistory])

  // Online / offline + install prompt listeners
  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    const onInstallPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallPrompt(null)
      setInstallMessage('NutriScan is installed.')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // ── Camera ──────────────────────────────────────────────────────────────────

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setIsCameraActive(false)
  }

  const startCamera = async () => {
    const video = videoRef.current
    if (!video) return
    setErrorMessage('')
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      setIsCameraActive(true)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Camera access failed. Check permissions and try again.')
    }
  }

  useEffect(() => {
    void startCamera()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Capture ─────────────────────────────────────────────────────────────────

  const capturePhoto = () => {
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
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72)
    // Hold as pending — user must confirm or retake
    setPendingImage(dataUrl)
    setErrorMessage('')
  }

  const confirmPhoto = (source: ScanRecord['source'] = 'camera') => {
    if (!pendingImage) return
    const record = createRecord(pendingImage, source, Date.now())
    // Show the result screen first — user saves to history from there
    setResultRecord(record)
    setPendingImage('')
    // ── TODO: replace createRecord() with ONNX inference output here ─────────
  }

  const saveResult = () => {
    if (!resultRecord) return
    setScanHistory((prev) => [resultRecord, ...prev])
    setResultRecord(null)
  }

  const discardResult = () => setResultRecord(null)

  const retakePhoto = () => {
    setPendingImage('')
    setErrorMessage('')
  }

  // ── Gallery upload ───────────────────────────────────────────────────────────

  const openGallery = () => {
    pickerOpenRef.current = true
    setErrorMessage('')
    const handleFocus = () => {
      setTimeout(() => {
        if (pickerOpenRef.current) {
          setErrorMessage('No image selected. Please allow access and pick a photo to analyse it.')
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
      const img = await loadImage(file)
      const dataUrl = imageToDataUrl(img)
      const record = createRecord(dataUrl, 'upload', file.size + file.name.length)
      // Show result screen — user saves to history from there
      setResultRecord(record)
      setErrorMessage('')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not prepare the selected photo.')
    }
    e.target.value = ''
  }

  // ── Install ──────────────────────────────────────────────────────────────────

  const installApp = async () => {
    if (!installPrompt) {
      setInstallMessage('Already installed, or waiting for the browser install prompt.')
      return
    }
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    setInstallMessage(
      choice.outcome === 'accepted'
        ? 'Install started. Offline shell available after first load.'
        : 'Install dismissed. You can try again later.',
    )
  }

  const dismissOnboarding = () => {
    setShowOnboarding(false)
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch { /* ignore */ }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {showOnboarding && <OnboardingModal onDismiss={dismissOnboarding} />}

      <main className="camera-app" aria-label="NutriScan food camera">
        <section className="camera-stage" aria-label="Camera preview">
          <video ref={videoRef} className="camera-video" muted autoPlay playsInline />

          {/* Top bar — history + online indicator + install */}
          <div className="topbar-overlay">
            <div className="status-pill" aria-live="polite">
              <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} aria-hidden="true" />
              <span className="status-label">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            <div className="topbar-right">
              {installPrompt && (
                <button type="button" className="install-button" onClick={installApp} aria-label="Install app">
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
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-5" />
                  <polyline points="12 7 12 12 15 15" />
                </svg>
                {scanHistory.length > 0 && (
                  <span className="history-badge" aria-label={`${scanHistory.length} scans`}>
                    {scanHistory.length > 9 ? '9+' : scanHistory.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Viewfinder corners */}
          <div className="viewfinder" aria-hidden="true">
            <span className="vf-corner vf-tl" />
            <span className="vf-corner vf-tr" />
            <span className="vf-corner vf-bl" />
            <span className="vf-corner vf-br" />
          </div>

          {!isCameraActive && (
            <div className="camera-overlay">
              <p>Camera loading&hellip;</p>
            </div>
          )}

          {errorMessage && (
            <p className="error-message" role="alert">{errorMessage}</p>
          )}

          {installMessage && (
            <p className="install-message" role="status">{installMessage}</p>
          )}

          {/* Pending review overlay */}
          {pendingImage && (
            <div className="pending-overlay" aria-live="polite">
              <img className="pending-preview" src={pendingImage} alt="Captured photo awaiting confirmation" />
              <div className="pending-actions">
                <button type="button" className="btn-retake" onClick={retakePhoto}>Retake</button>
                <button type="button" className="btn-use" onClick={() => confirmPhoto('camera')}>Use Photo</button>
              </div>
            </div>
          )}

          {/* Result overlay — shown after confirming a photo */}
          {resultRecord && (
            <div className="result-overlay" role="dialog" aria-label="Scan result">
              <img
                src={resultRecord.imageDataUrl}
                alt="Scanned food"
                className="result-bg-image"
              />
              <div className="result-sheet">
                <div className="result-sheet-header">
                  <div>
                    <p className="result-sheet-category">{resultRecord.category}</p>
                    <h2 className="result-sheet-name">{resultRecord.name}</h2>
                  </div>
                  <span className="result-confidence-chip">{resultRecord.confidence}% match</span>
                </div>

                <MacroGrid record={resultRecord} />

                {resultRecord.tip && (
                  <p className="result-tip">{resultRecord.tip}</p>
                )}

                <div className="result-sheet-actions">
                  <button type="button" className="btn-retake" onClick={discardResult}>
                    Discard
                  </button>
                  <button type="button" className="btn-use" onClick={saveResult}>
                    Save to History
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom controls — hidden during review or result */}
          {!pendingImage && !resultRecord && (
            <div className="controls-row">
              <button
                type="button"
                className="gallery-button"
                onClick={openGallery}
                aria-label="Upload from gallery"
              >
                {scanHistory.length > 0 && scanHistory[0].imageDataUrl ? (
                  <img className="gallery-thumb" src={scanHistory[0].imageDataUrl} alt="Last scan" />
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="gallery-icon">
                    <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                className="capture-button"
                onClick={capturePhoto}
                aria-label="Take photo"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4.5 7.6 6H5.5A2.5 2.5 0 0 0 3 8.5v9A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 18.5 6h-2.1L15 4.5H9Zm3 12.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
                </svg>
              </button>

              <div className="controls-spacer" aria-hidden="true" />
            </div>
          )}

          <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
          {/* No capture="environment" — opens gallery on mobile, file picker on desktop */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden-input" onChange={handleFilePick} />
        </section>

        {/* History panel */}
        {showHistory && (
          <div className="history-panel" role="dialog" aria-modal="true" aria-label="Scan history">
            <div className="history-header">
              <div>
                <h2 className="history-title">History</h2>
                <p className="history-subtitle">
                  {stats.scans} scan{stats.scans !== 1 ? 's' : ''}
                  {stats.scans > 0 && ` · avg ${stats.averageCalories} kcal · ${stats.protein}g protein`}
                </p>
              </div>
              <div className="history-header-actions">
                {scanHistory.length > 0 && (
                  <button
                    type="button"
                    className="history-clear"
                    onClick={() => setScanHistory([])}
                  >
                    Clear
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
                  <li key={item.id} className="history-item">
                    <ResultCard record={item} />
                    <span className="history-time">{formatTime(item.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </>
  )
}

export default App
