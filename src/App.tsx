import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

// ── ONNX Integration Guide ─────────────────────────────────────────────────────
//
// 1. Install the runtime (inside svelte-app or the root — wherever you bundle):
//      pnpm add onnxruntime-web
//
// 2. Drop your model at:
//      public/models/food_classifier.onnx
//    Vite / the dev server will serve public/ as the web root.
//
// 3. Create the session once (e.g. top-level module scope so it only loads once):
//      import * as ort from 'onnxruntime-web'
//      const sessionPromise = ort.InferenceSession.create('/models/food_classifier.onnx')
//
// 4. Pre-process: draw the captured image onto a 224×224 canvas, read pixels:
//      const { data } = ctx.getImageData(0, 0, 224, 224)  // Uint8ClampedArray RGBA
//      const float32 = new Float32Array(3 * 224 * 224)
//      for (let i = 0; i < 224 * 224; i++) {
//        float32[i]               = data[i * 4]     / 255  // R channel
//        float32[i + 224 * 224]   = data[i * 4 + 1] / 255  // G channel
//        float32[i + 224 * 224*2] = data[i * 4 + 2] / 255  // B channel
//      }
//      const tensor = new ort.Tensor('float32', float32, [1, 3, 224, 224])
//
// 5. Run inference and find the top class:
//      const session = await sessionPromise
//      const { output } = await session.run({ input: tensor })
//      const scores = Array.from(output.data as Float32Array)
//      const topIdx = scores.indexOf(Math.max(...scores))
//      const label  = LABELS[topIdx]      // your label string array
//      const conf   = scores[topIdx]      // 0–1 confidence
//
// 6. Map topIdx → nutrition data using a local JSON lookup table or an
//    edge function call. Pass { label, conf, ...nutrition } to your result UI.
//
// The capturePhoto() function below already draws to a canvas and creates the
// blob URL — extend it to also run inference immediately after the draw step.
// ──────────────────────────────────────────────────────────────────────────────

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
    body: 'Press the large white button to capture. The on-device ONNX model runs instantly — no internet needed.',
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
            Identify any food and get instant nutrition info — entirely on-device.
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
  const [latestImage, setLatestImage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)

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

    // ── TODO: run ONNX inference here (see guide at the top of this file) ──
    // Scale canvas to 224×224, extract Float32Array CHW tensor, call session.run()

    canvas.toBlob(
      (blob) => {
        if (!blob) { setErrorMessage('Could not save the captured photo.'); return }
        applyPreviewUrl(URL.createObjectURL(blob))
        setErrorMessage('')
      },
      'image/jpeg',
      0.92,
    )
  }

  const handleFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
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

          {/* Bottom controls row */}
          <div className="controls-row">
            <button
              type="button"
              className="gallery-button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Open photos"
            >
              {latestImage ? (
                <img className="gallery-thumb" src={latestImage} alt="Latest selected image" />
              ) : (
                <span className="gallery-fallback" aria-hidden="true" />
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

            {/* Spacer to balance gallery button on the right */}
            <div className="controls-spacer" aria-hidden="true" />
          </div>

          {errorMessage && <p className="error-message">{errorMessage}</p>}

          <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden-input"
            onChange={handleFilePick}
          />
        </section>
      </main>
    </>
  )
}

export default App
