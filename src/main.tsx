import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

async function registerOfflineApp() {
  if (!('serviceWorker' in navigator)) return

  let reloadedForController = false
  let onlineRefreshInProgress = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForController) return
    reloadedForController = true
    window.location.reload()
  })

  const refreshWhenOnline = async () => {
    if (!navigator.onLine || onlineRefreshInProgress) return

    onlineRefreshInProgress = true
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      await registration?.update()

      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        return
      }

      window.location.reload()
    } catch (error) {
      onlineRefreshInProgress = false
      console.warn('NutriScan could not refresh after reconnecting.', error)
    }
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    const readyRegistration = await navigator.serviceWorker.ready
    readyRegistration.active?.postMessage({ type: 'WARM_CACHE' })
    window.addEventListener('online', () => {
      void refreshWhenOnline()
      readyRegistration.active?.postMessage({ type: 'WARM_CACHE' })
    })

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      if (!worker) return

      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' })
        }
      })
    })
  } catch (error) {
    console.warn('NutriScan service worker registration failed.', error)
  }
}

void registerOfflineApp()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
