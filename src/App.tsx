import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

/* ── ONNX Integration Guide (uncomment when ready to wire in the model) ────────
 *
 * 1. Install the runtime:
 *      pnpm add onnxruntime-web
 *
 * 2. Serve the model from:
 *      public/models/food_classifier.onnx
 *
 * 3. Create the session once at module scope:
 *      import * as ort from 'onnxruntime-web'
 *      const sessionPromise = ort.InferenceSession.create('/models/food_classifier.onnx')
 *
 * 4. Pre-process — draw to 224×224, extract CHW Float32Array:
 *      const { data } = ctx.getImageData(0, 0, 224, 224)
 *      const float32 = new Float32Array(3 * 224 * 224)
 *      for (let i = 0; i < 224 * 224; i++) {
 *        float32[i]             = data[i*4]   / 255   // R
 *        float32[i + 224*224]   = data[i*4+1] / 255   // G
 *        float32[i + 224*224*2] = data[i*4+2] / 255   // B
 *      }
 *      const tensor = new ort.Tensor('float32', float32, [1, 3, 224, 224])
 *
 * 5. Run and get top-1 label:
 *      const session = await sessionPromise
 *      const { output } = await session.run({ input: tensor })
 *      const scores = Array.from(output.data as Float32Array)
 *      const topIdx = scores.indexOf(Math.max(...scores))
 *      const label  = LABELS[topIdx]   // string array of class names
 *
 * 6. Display the label — currently the app only shows the food name.
 *    Nutrition lookup and results card are commented out until the model is ready.
 * ────────────────────────────────────────────────────────────────────────────── */

const CAMERA_CONFIG = {
  facingMode: 'environment' as const,
  overlayLabel: 'Tap to capture',
}

const ONBOARDING_KEY = 'nutriscan_onboarded'

const steps = [
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
    body: 'Press the large white button to capture. The on-device ONNX model identifies the food — no internet needed.',
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
    body: 'Tap the gallery thumbnail in the bottom-left to pick an existing photo from your device.',
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
          {steps.map((step) => (
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

  const [isCameraActive, setIsCameraActive] = useState(false)
  // pendingImage: the photo the user just took — held until they confirm or retake
  const [pendingImage, setPendingImage] = useState<string>('')
  const [latestImage, setLatestImage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  // true while the file picker is open, so we can detect a dismissed picker
  const [pickerOpened, setPickerOpened] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) {
        setShowOnboarding(true)
      }
    } catch (_) {
      setShowOnboarding(true)
    }
  }, [])

  function dismissOnboarding() {
    setShowOnboarding(false)
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch (_) {}
  }

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
        video: { facingMode: CAMERA_CONFIG.facingMode },
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
    startCamera()
    return () => { stopCamera() }
  }, [])

  const applyPreviewUrl = (nextUrl: string) => {
    setLatestImage((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      return nextUrl
    })
  }

  // Open the gallery/file picker and watch for the user dismissing it without picking
  const openGallery = () => {
    setPickerOpened(true)
    setErrorMessage('')

    // Listen once on the window for focus returning — means picker was closed
    const handleFocusReturn = () => {
      // Small delay because the input change fires before window focus
      setTimeout(() => {
        setPickerOpened((wasOpen) => {
          if (wasOpen) {
            // Still open means no file was selected — show the permission nudge
            setErrorMessage('No image selected. Please allow access and pick a photo to analyse it.')
          }
          return false
        })
      }, 600)
      window.removeEventListener('focus', handleFocusReturn)
    }
    window.addEventListener('focus', handleFocusReturn)

    fileInputRef.current?.click()
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) {
      setErrorMessage('Camera capture is not ready yet.')
      return
    }
    if (!video.videoWidth || !video.videoHeight) {
      setErrorMessage('Wait for the camera feed to load before taking a photo.')
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

    canvas.toBlob(
      (blob) => {
        if (!blob) { setErrorMessage('Could not save the captured photo.'); return }
        // Hold the image — don't commit until the user confirms
        setPendingImage(URL.createObjectURL(blob))
        setErrorMessage('')
      },
      'image/jpeg',
      0.92,
    )
  }

  const confirmPhoto = () => {
    if (!pendingImage) return
    applyPreviewUrl(pendingImage)
    setPendingImage('')
    // ── TODO (when model is ready) ───────────────────────────────────────────
    // Run ONNX inference on the canvas pixels to get the food name.
    // See the integration guide at the top of this file for the full steps.
    // setFoodLabel(label)   <-- uncomment once inference is wired up
    //
    // Features commented out until inference is ready:
    //   - Nutrition card (calories, protein, carbs, fat)
    //   - Confidence score chip
    //   - Results panel / history list
    // ─────────────────────────────────────────────────────────────────────────
  }

  const retakePhoto = () => {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage)
      setPendingImage('')
    }
    setErrorMessage('')
  }

  const handleFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setPickerOpened(false)
    if (!file) return
    applyPreviewUrl(URL.createObjectURL(file))
    setErrorMessage('')
    event.target.value = ''
  }

  return (
    <>
      {showOnboarding && <OnboardingModal onDismiss={dismissOnboarding} />}

      <main className="camera-app" aria-label="Food camera app">
        <section className="camera-stage" aria-label="Camera preview">
          <video ref={videoRef} className="camera-video" muted autoPlay playsInline />

          {/* Centered viewfinder frame */}
          <div className="viewfinder" aria-hidden="true">
            <span className="vf-corner vf-tl" />
            <span className="vf-corner vf-tr" />
            <span className="vf-corner vf-bl" />
            <span className="vf-corner vf-br" />
          </div>

          {!isCameraActive && (
            <div className="camera-overlay">
              <p>{CAMERA_CONFIG.overlayLabel}</p>
            </div>
          )}

          {/* Pending photo preview — held until user confirms or retakes */}
          {pendingImage && (
            <div className="pending-overlay" aria-live="polite">
              <img className="pending-preview" src={pendingImage} alt="Captured photo awaiting confirmation" />
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

          {/* Bottom controls row — hidden while reviewing a pending photo */}
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

              {/* Spacer to keep shutter centered */}
              <div className="controls-spacer" aria-hidden="true" />
            </div>
          )}

          {errorMessage && <p className="error-message">{errorMessage}</p>}

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
      </main>
    </>
  )
}

export default App
