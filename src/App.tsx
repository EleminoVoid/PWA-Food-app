import { useEffect, useRef, useState } from 'react'
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

const CAMERA_CONFIG = {
  facingMode: 'environment' as const,
}

const ONBOARDING_KEY = 'nutriscan_onboarded'

type ScanEntry = { url: string; timestamp: string }

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

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Tracks whether the file picker is open so we can detect dismissal without a pick
  const pickerOpenRef = useRef(false)

  const [isCameraActive, setIsCameraActive] = useState(false)
  // pendingImage: photo held for user review before it is committed
  const [pendingImage, setPendingImage] = useState('')
  const [latestImage, setLatestImage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [scanHistory, setScanHistory] = useState<ScanEntry[]>([])

  // ── Onboarding ────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) setShowOnboarding(true)
    } catch {
      setShowOnboarding(true)
    }
  }, [])

  const dismissOnboarding = () => {
    setShowOnboarding(false)
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch { /* ignore */ }
  }

  // ── Camera ────────────────────────────────────────────────────────────────
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: CAMERA_CONFIG.facingMode },
        audio: false,
      })
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      setIsCameraActive(true)
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Camera access failed. Check permissions and try again.',
      )
    }
  }

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  // ── Photo capture ─────────────────────────────────────────────────────────
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
    canvas.toBlob(
      (blob) => {
        if (!blob) { setErrorMessage('Could not save the captured photo.'); return }
        setPendingImage(URL.createObjectURL(blob))
        setErrorMessage('')
      },
      'image/jpeg',
      0.92,
    )
  }

  const confirmPhoto = () => {
    if (!pendingImage) return
    const timestamp = new Date().toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    setScanHistory((prev) => [{ url: pendingImage, timestamp }, ...prev])
    setLatestImage((prev) => { if (prev) URL.revokeObjectURL(prev); return pendingImage })
    setPendingImage('')
    // ── TODO: run ONNX inference here (see guide at the top of the file) ────
    // setFoodLabel(label)
    // Nutrition card, confidence chip, results panel → uncomment when ready
  }

  const retakePhoto = () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage)
    setPendingImage('')
    setErrorMessage('')
  }

  // ── Gallery upload ────────────────────────────────────────────────────────
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

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    pickerOpenRef.current = false
    const file = e.target.files?.[0]
    if (!file) return
    setLatestImage((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
    setErrorMessage('')
    e.target.value = ''
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {showOnboarding && <OnboardingModal onDismiss={dismissOnboarding} />}

      <main className="camera-app" aria-label="NutriScan food camera">
        <section className="camera-stage" aria-label="Camera preview">

          <video ref={videoRef} className="camera-video" muted autoPlay playsInline />

          {/* History button — top right */}
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
          </button>

          {/* Viewfinder frame */}
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

          {/* Pending review overlay */}
          {pendingImage && (
            <div className="pending-overlay" aria-live="polite">
              <img
                className="pending-preview"
                src={pendingImage}
                alt="Captured photo awaiting confirmation"
              />
              <div className="pending-actions">
                <button type="button" className="btn-retake" onClick={retakePhoto}>
                  Retake
                </button>
                <button type="button" className="btn-use" onClick={confirmPhoto}>
                  Use Photo
                </button>
              </div>
            </div>
          )}

          {/* Bottom controls — hidden during review */}
          {!pendingImage && (
            <div className="controls-row">
              <button
                type="button"
                className="gallery-button"
                onClick={openGallery}
                aria-label="Upload from gallery"
              >
                {latestImage ? (
                  <img className="gallery-thumb" src={latestImage} alt="Last uploaded image" />
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
              <h2 className="history-title">History</h2>
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

            {scanHistory.length === 0 ? (
              <p className="history-empty">No scans yet. Take a photo to get started.</p>
            ) : (
              <ul className="history-list">
                {scanHistory.map((item, i) => (
                  <li key={i} className="history-item">
                    <img src={item.url} alt={`Scan from ${item.timestamp}`} className="history-thumb" />
                    <div className="history-meta">
                      {/* Food name replaces this placeholder once ONNX is wired in */}
                      <span className="history-label">Unidentified food</span>
                      <span className="history-time">{item.timestamp}</span>
                    </div>
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
