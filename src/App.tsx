import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

const CAMERA_CONFIG = {
  facingMode: 'environment' as const,
  overlayLabel: 'Tap to capture',
}

const floatingBubbles = [
  { id: 1, text: 'Fresh', top: '10%', left: '8%', delay: '0s' },
  { id: 2, text: 'Snap', top: '22%', right: '10%', delay: '0.6s' },
  { id: 3, text: 'Analyze', top: '58%', left: '6%', delay: '1.2s' },
]

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isCameraActive, setIsCameraActive] = useState(false)
  const [latestImage, setLatestImage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsCameraActive(false)
  }

  const startCamera = async () => {
    const video = videoRef.current

    if (!video) {
      return
    }

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

    return () => {
      stopCamera()
    }
  }, [])

  const applyPreviewUrl = (nextUrl: string) => {
    setLatestImage((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }

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

    canvas.toBlob((blob) => {
      if (!blob) {
        setErrorMessage('Could not save the captured photo.')
        return
      }

      applyPreviewUrl(URL.createObjectURL(blob))
      setErrorMessage('')
    }, 'image/jpeg', 0.92)
  }

  const handleFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    applyPreviewUrl(URL.createObjectURL(file))
    setErrorMessage('')
    event.target.value = ''
  }

  return (
    <main className="camera-app" aria-label="Food camera app">
      <section className="camera-stage" aria-label="Camera preview">
        <video ref={videoRef} className="camera-video" muted autoPlay playsInline />

        <div className="floating-bubbles" aria-hidden="true">
          {floatingBubbles.map((bubble) => (
            <span
              key={bubble.id}
              className="floating-bubble"
              style={{
                top: bubble.top,
                left: bubble.left,
                right: bubble.right,
                animationDelay: bubble.delay,
              }}
            >
              {bubble.text}
            </span>
          ))}
        </div>

        {!isCameraActive ? (
          <div className="camera-overlay">
            <p>{CAMERA_CONFIG.overlayLabel}</p>
          </div>
        ) : null}

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

        <button
          type="button"
          className="gallery-button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Open photos"
        >
          {latestImage ? (
            <img className="gallery-thumb" src={latestImage} alt="Latest selected image" />
          ) : (
            <span className="gallery-fallback" aria-hidden="true">
              ▣
            </span>
          )}
        </button>

        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

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
  )
}

export default App
