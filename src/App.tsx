import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

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

type Screen = 'home' | 'scan' | 'history'

const HISTORY_KEY = 'nutriscan_history'
const ONBOARDING_KEY = 'nutriscan_onboarded'

const foodProfiles: FoodProfile[] = [
  {
    name: 'Garden salad bowl',
    category: 'Vegetable meal',
    calories: 260,
    protein: 8,
    carbs: 28,
    fat: 13,
    fiber: 9,
    confidence: 91,
    tip: 'Add beans, egg, tofu, or grilled chicken if this is your main meal.',
  },
  {
    name: 'Chicken rice plate',
    category: 'Balanced meal',
    calories: 520,
    protein: 34,
    carbs: 58,
    fat: 17,
    fiber: 5,
    confidence: 87,
    tip: 'Pair it with greens or soup to make the plate more filling.',
  },
  {
    name: 'Fruit snack',
    category: 'Fresh snack',
    calories: 180,
    protein: 2,
    carbs: 44,
    fat: 1,
    fiber: 7,
    confidence: 84,
    tip: 'Great for quick energy. Add yogurt or nuts for longer satiety.',
  },
  {
    name: 'Pasta serving',
    category: 'Carb-forward meal',
    calories: 610,
    protein: 18,
    carbs: 82,
    fat: 23,
    fiber: 6,
    confidence: 79,
    tip: 'A smaller portion plus vegetables keeps the meal lighter.',
  },
]

const emptyStats = {
  scans: 0,
  averageCalories: 0,
  protein: 0,
}

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
        item.id &&
        item.name &&
        item.category &&
        item.createdAt &&
        item.imageDataUrl,
      ))
  } catch {
    return []
  }
}

function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return false
  }
}

function pickProfile(seed: number) {
  return foodProfiles[Math.abs(seed) % foodProfiles.length]
}

function createRecord(imageDataUrl: string, source: ScanRecord['source'], seed: number): ScanRecord {
  return {
    ...pickProfile(seed),
    id: crypto.randomUUID(),
    source,
    imageDataUrl,
    createdAt: new Date().toISOString(),
  }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read the selected image.'))
    image.src = URL.createObjectURL(file)
  })
}

function imageToDataUrl(image: HTMLImageElement, maxSize = 900) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to prepare the photo buffer.')

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(image.src)
  return canvas.toDataURL('image/jpeg', 0.72)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
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

  const stats = useMemo(() => {
    if (!history.length) return emptyStats
    const calories = Math.round(history.reduce((sum, item) => sum + item.calories, 0) / history.length)
    const protein = Math.round(history.reduce((sum, item) => sum + item.protein, 0))
    return { scans: history.length, averageCalories: calories, protein }
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
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)))
    } catch {
      console.warn('NutriScan history could not be persisted.')
    }
  }, [history])

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
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.72)
    saveResult(createRecord(imageDataUrl, 'camera', Date.now()))
  }

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const image = await loadImage(file)
      const imageDataUrl = imageToDataUrl(image)
      saveResult(createRecord(imageDataUrl, 'upload', file.size + file.name.length))
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
        ? 'Install started. Offline shell is available after first load.'
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
            <p className="eyebrow">Offline-ready food companion</p>
            <h1 id="welcome-title">Meet NutriScan</h1>
            <p>
              Capture or upload a meal, get an instant nutrition estimate, and keep
              a private scan history on this device.
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

      {screen === 'home' && (
        <section className="home-grid" aria-label="NutriScan dashboard">
          <div className="hero-panel">
            <p className="eyebrow">Smart meal check</p>
            <h2>Scan food, understand the plate, keep moving.</h2>
            <p>
              This version uses local demo estimates until the ONNX model is connected,
              so the flow is ready without needing a server or Wi-Fi.
            </p>
            <div className="hero-actions">
              <button type="button" className="primary-action" onClick={() => setScreen('scan')}>
                Scan food
              </button>
              <button type="button" className="secondary-action" onClick={() => fileInputRef.current?.click()}>
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
              <strong>{stats.averageCalories}</strong>
              <span>Avg calories</span>
            </article>
            <article>
              <strong>{stats.protein}g</strong>
              <span>Total protein</span>
            </article>
          </div>

          {displayedResult ? (
            <ResultCard result={displayedResult} />
          ) : (
            <section className="empty-result">
              <h3>No meal scanned yet</h3>
              <p>Take a photo or upload one to see calories, macros, confidence, and a practical eating tip.</p>
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
                  <button type="button" className="primary-action" onClick={startCamera}>
                    Start camera
                  </button>
                  <button type="button" className="secondary-action" onClick={() => fileInputRef.current?.click()}>
                    Take or upload photo
                  </button>
                </div>
              </div>
            )}
            <div className="viewfinder" aria-hidden="true" />
          </div>

          {errorMessage && <p className="error-message">{errorMessage}</p>}

          <div className="scan-actions">
            <button type="button" className="secondary-action" onClick={() => fileInputRef.current?.click()}>
              Upload
            </button>
            <button type="button" className="capture-action" onClick={capturePhoto}>
              Scan
            </button>
            <button type="button" className="secondary-action" onClick={stopCamera}>
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
              <h2>Recent scans</h2>
            </div>
            <button type="button" className="text-action" onClick={clearHistory}>
              Clear
            </button>
          </div>

          {history.length ? (
            <div className="history-list">
              {history.map((item) => (
                <article className="history-item" key={item.id}>
                  <img src={item.imageDataUrl} alt="" />
                  <div>
                    <strong>{item.name}</strong>
                    <span>{formatTime(item.createdAt)} · {item.calories} kcal · {item.protein}g protein</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="empty-result">
              <h3>No saved scans</h3>
              <p>Your latest scans will appear here and remain stored locally on this device.</p>
            </section>
          )}
        </section>
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

function ResultCard({ result }: { result: ScanRecord }) {
  return (
    <section className="result-card" aria-label="Latest scan result">
      <img src={result.imageDataUrl} alt="" />
      <div className="result-content">
        <div>
          <p className="eyebrow">{result.category}</p>
          <h2>{result.name}</h2>
          <span className="confidence">{result.confidence}% match</span>
        </div>

        <div className="macro-grid">
          <span><strong>{result.calories}</strong> kcal</span>
          <span><strong>{result.protein}g</strong> protein</span>
          <span><strong>{result.carbs}g</strong> carbs</span>
          <span><strong>{result.fat}g</strong> fat</span>
        </div>

        <p className="tip">{result.tip}</p>
      </div>
    </section>
  )
}

export default App
