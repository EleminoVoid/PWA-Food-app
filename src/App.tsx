/**
 * ===========================================
 * DOCUMENT SCANNER APP
 * ===========================================
 * Main application component that combines:
 * - Camera feed (video element)
 * - Scanner frame overlay (yellow corners)
 * - Top toolbar (utilities menu)
 * - Bottom bar (gallery, scan, presets)
 * 
 * CUSTOMIZATION GUIDE:
 * - Each component is in its own file in /components
 * - Colors and sizes use CSS variables for easy editing
 * - Camera settings are in CAMERA_CONFIG below
 * ===========================================
 */

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { TopToolbar } from './components/toolbar/TopToolbar'
import { ScannerFrame } from './components/scanner/ScannerFrame'
import { BottomBar } from './components/bottom/BottomBar'
import './App.css'

/**
 * CAMERA CONFIGURATION
 * Change these settings to customize camera behavior
 */
const CAMERA_CONFIG = {
  /** 'environment' = back camera, 'user' = front camera */
  facingMode: 'environment' as const,
  /** Message shown when camera is loading */
  loadingMessage: 'Initializing camera...',
}

function App() {
  // =========================================
  // STATE & REFS
  // =========================================
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isCameraActive, setIsCameraActive] = useState(false)
  const [scannedPages, setScannedPages] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  // =========================================
  // CAMERA FUNCTIONS
  // =========================================
  
  /** Stop the camera stream */
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsCameraActive(false)
  }

  /** Start the camera stream */
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

  // Start camera on mount, stop on unmount
  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  // =========================================
  // CAPTURE FUNCTIONS
  // =========================================
  
  /** Capture a photo from the video feed */
  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) {
      setErrorMessage('Camera not ready.')
      return
    }

    if (!video.videoWidth || !video.videoHeight) {
      setErrorMessage('Wait for the camera to load.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    if (!context) {
      setErrorMessage('Unable to capture.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob((blob) => {
      if (!blob) {
        setErrorMessage('Could not save the photo.')
        return
      }

      // Increment scanned pages count
      setScannedPages((prev) => prev + 1)
      setErrorMessage('')
      
      // Here you could save the blob or send it to a server
      // For now, we just count the pages
    }, 'image/jpeg', 0.92)
  }

  /** Handle file selection from gallery */
  const handleFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setScannedPages((prev) => prev + 1)
    setErrorMessage('')
    event.target.value = ''
  }

  // =========================================
  // EVENT HANDLERS
  // =========================================
  
  const handleToolClick = (toolId: string) => {
    // Handle tool clicks - implement as needed
    console.log('Tool clicked:', toolId)
  }

  const handleGalleryClick = () => {
    fileInputRef.current?.click()
  }

  const handleScanClick = () => {
    capturePhoto()
  }

  const handlePresetsClick = () => {
    // Handle presets menu - implement as needed
    console.log('Presets clicked')
  }

  // =========================================
  // RENDER
  // =========================================
  return (
    <main className="scanner-app" aria-label="Document Scanner">
      {/* CAMERA FEED */}
      <section className="camera-container" aria-label="Camera preview">
        <video
          ref={videoRef}
          className="camera-video"
          muted
          autoPlay
          playsInline
        />
        
        {/* Loading overlay when camera isn't active */}
        {!isCameraActive && !errorMessage && (
          <div className="camera-overlay">
            <p>{CAMERA_CONFIG.loadingMessage}</p>
          </div>
        )}
      </section>

      {/* SCANNER FRAME - Yellow corner brackets */}
      <ScannerFrame />

      {/* TOP TOOLBAR - Utilities menu */}
      <TopToolbar onToolClick={handleToolClick} />

      {/* BOTTOM BAR - Gallery, Scan, Presets */}
      <BottomBar
        scannedCount={scannedPages}
        onGalleryClick={handleGalleryClick}
        onScanClick={handleScanClick}
        onPresetsClick={handlePresetsClick}
        scanDisabled={!isCameraActive}
      />

      {/* ERROR MESSAGE */}
      {errorMessage && (
        <div className="error-toast" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Hidden elements for capturing */}
      <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFilePick}
        aria-label="Select image from gallery"
      />
    </main>
  )
}

export default App
