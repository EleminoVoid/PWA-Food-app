<script>
  import { onMount } from 'svelte'
  let videoEl = null
  let canvasEl = null
  let capturedUrl = ''
  let stream = null
  let message = ''

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoEl) videoEl.srcObject = stream
      message = 'Camera started'
    } catch (e) {
      message = 'Camera error: ' + e.message
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      stream = null
      message = 'Camera stopped'
    }
  }

  function capturePhoto() {
    if (!videoEl || !canvasEl) return
    const w = videoEl.videoWidth
    const h = videoEl.videoHeight
    canvasEl.width = w
    canvasEl.height = h
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return
    ctx.drawImage(videoEl, 0, 0, w, h)
    capturedUrl = canvasEl.toDataURL('image/jpeg')
  }

  async function analyzeFood() {
    if (!canvasEl) return
    canvasEl.toBlob(async (blob) => {
      if (!blob) return
      const fd = new FormData()
      fd.append('image', blob, 'photo.jpg')
      try {
        const res = await fetch('/api/identify-food', { method: 'POST', body: fd })
        const json = await res.json()
        message = 'Result: ' + JSON.stringify(json)
      } catch (e) {
        message = 'Upload error: ' + e.message
      }
    }, 'image/jpeg', 0.9)
  }

  onMount(() => {})
</script>

<style>
  .camera { display:flex; flex-direction:column; gap:8px; align-items:center; padding:16px }
  video { width:100%; max-width:400px; background:#000 }
  canvas { display:none }
  img.preview { max-width:320px; border:1px solid #ccc }
  .controls { display:flex; gap:8px }
</style>

<div class="camera">
  <h1>Camera (Svelte Vite)</h1>
  <video bind:this={videoEl} autoplay playsinline></video>
  <canvas bind:this={canvasEl}></canvas>
  {#if capturedUrl}
    <img class="preview" src={capturedUrl} alt="capture preview" />
  {/if}
  <div class="controls">
    <button on:click={startCamera}>Start Camera</button>
    <button on:click={capturePhoto}>Capture</button>
    <button on:click={analyzeFood}>Analyze</button>
    <button on:click={stopCamera}>Stop</button>
  </div>
  <div>{message}</div>
</div>
