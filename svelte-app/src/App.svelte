<script>
  import { onMount } from 'svelte'

  // ── State ──────────────────────────────────────────────────────────────────
  let videoEl = null
  let canvasEl = null
  let fileInput = null

  /** 'idle' | 'scanning' | 'analyzing' | 'result' */
  let view = 'idle'

  let capturedUrl = ''
  let stream = null
  let errorMsg = ''

  /** Shown once on first visit */
  let showOnboarding = true

  /** Nutrition result object — populated after ONNX inference */
  let result = null

  // ── Camera helpers ─────────────────────────────────────────────────────────
  async function startCamera() {
    errorMsg = ''
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      if (videoEl) videoEl.srcObject = stream
      view = 'scanning'
    } catch (e) {
      errorMsg = 'Could not access camera: ' + e.message
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      stream = null
    }
  }

  function capturePhoto() {
    if (!videoEl || !canvasEl) return
    canvasEl.width = videoEl.videoWidth
    canvasEl.height = videoEl.videoHeight
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height)
    capturedUrl = canvasEl.toDataURL('image/jpeg', 0.92)
    stopCamera()
    runInference()
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      capturedUrl = ev.target.result
      // Draw uploaded image onto canvas so ONNX can read pixel data
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (!canvasEl) return
        canvasEl.width = img.naturalWidth
        canvasEl.height = img.naturalHeight
        canvasEl.getContext('2d').drawImage(img, 0, 0)
        runInference()
      }
      img.src = capturedUrl
    }
    reader.readAsDataURL(file)
    // Reset so the same file can be re-selected
    if (fileInput) fileInput.value = ''
  }

  // ── ONNX Inference ─────────────────────────────────────────────────────────
  /**
   * HOW TO INTEGRATE YOUR ONNX MODEL
   * ──────────────────────────────────────────────────────────────────────────
   * 1. Install the runtime:
   *      pnpm add onnxruntime-web
   *
   * 2. Place your model file at:
   *      svelte-app/public/models/food_classifier.onnx
   *    (The public/ folder is served as-is by Vite.)
   *
   * 3. Load the session once (e.g. in onMount or a Svelte store):
   *      import * as ort from 'onnxruntime-web'
   *      const session = await ort.InferenceSession.create('/models/food_classifier.onnx')
   *
   * 4. Pre-process the canvas pixel data into a Float32 tensor:
   *      const imageData = canvasEl.getContext('2d').getImageData(0, 0, 224, 224)
   *      // Normalize [0,255] → [0,1] and arrange as CHW (channels-first):
   *      const tensor = new ort.Tensor('float32', float32Data, [1, 3, 224, 224])
   *
   * 5. Run inference and read the top-1 class + score:
   *      const { output } = await session.run({ input: tensor })
   *      const scores = Array.from(output.data)
   *      const topIdx = scores.indexOf(Math.max(...scores))
   *      const label = LABELS[topIdx]        // your label map array
   *      const confidence = scores[topIdx]   // 0–1
   *
   * 6. Map the top class to its nutrition data (calories, protein, carbs, fat)
   *    using a local JSON lookup table or a small fetch to an edge function.
   *
   * The stub below simulates steps 5–6 so the UI flows end-to-end right now.
   * Replace the body of runInference() with the real implementation above.
   */
  async function runInference() {
    view = 'analyzing'
    result = null
    errorMsg = ''

    try {
      // ── STUB: replace this block with real onnxruntime-web inference ──────
      await new Promise(r => setTimeout(r, 1800))
      result = {
        label: 'Green Apple',
        confidence: 0.91,
        calories: 95,
        protein: 0.5,
        carbs: 25,
        fat: 0.3,
      }
      // ── END STUB ──────────────────────────────────────────────────────────

      view = 'result'
    } catch (e) {
      errorMsg = 'Analysis failed: ' + e.message
      view = 'scanning'
    }
  }

  function reset() {
    capturedUrl = ''
    result = null
    errorMsg = ''
    view = 'idle'
  }

  function dismissOnboarding() {
    showOnboarding = false
    // Persist so it only shows once per device
    try { localStorage.setItem('nutriscan_onboarded', '1') } catch (_) {}
  }

  onMount(() => {
    try {
      if (localStorage.getItem('nutriscan_onboarded')) showOnboarding = false
    } catch (_) {}
  })
</script>

<!-- ── Markup ──────────────────────────────────────────────────────────────── -->

<!-- Hidden canvas for pixel capture -->
<canvas bind:this={canvasEl} class="hidden-canvas" aria-hidden="true"></canvas>

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept="image/*"
  class="hidden-canvas"
  aria-hidden="true"
  on:change={handleFileUpload}
/>

<!-- ── Onboarding Modal ──────────────────────────────────────────────────────── -->
{#if showOnboarding}
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-icon">
          <!-- Lens icon -->
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/>
            <line x1="16.5" y1="16.5" x2="22" y2="22"/>
          </svg>
        </span>
        <h2 id="onboard-title">Welcome to NutriScan</h2>
      </div>

      <p class="modal-subtitle">Identify any food and get instant nutrition info — entirely on-device.</p>

      <ol class="steps">
        <li>
          <div class="step-img step-img--cam">
            <!-- Placeholder: replace with a real photo of the camera viewfinder UI -->
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span class="step-img__label">Add screenshot here</span>
          </div>
          <div class="step-text">
            <strong>Open the camera</strong>
            <span>Tap <em>Scan Food</em> to launch your rear camera. Hold it steady above the dish.</span>
          </div>
        </li>
        <li>
          <div class="step-img step-img--frame">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
              <polyline points="3 7 3 3 7 3"/>
              <polyline points="17 3 21 3 21 7"/>
              <polyline points="21 17 21 21 17 21"/>
              <polyline points="7 21 3 21 3 17"/>
            </svg>
            <span class="step-img__label">Add screenshot here</span>
          </div>
          <div class="step-text">
            <strong>Frame the food</strong>
            <span>Fit the main item inside the bracket guides. Good lighting gives better results.</span>
          </div>
        </li>
        <li>
          <div class="step-img step-img--shutter">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="4" fill="currentColor"/>
            </svg>
            <span class="step-img__label">Add screenshot here</span>
          </div>
          <div class="step-text">
            <strong>Tap the shutter</strong>
            <span>Press the large button to capture. The on-device ONNX model analyses the image in seconds — no internet needed.</span>
          </div>
        </li>
        <li>
          <div class="step-img step-img--upload">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
              <polyline points="16 16 12 12 8 16"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
            <span class="step-img__label">Add screenshot here</span>
          </div>
          <div class="step-text">
            <strong>Or upload a photo</strong>
            <span>Tap <em>Upload Image</em> to pick a photo from your gallery instead.</span>
          </div>
        </li>
      </ol>

      <button class="btn btn--primary btn--full" on:click={dismissOnboarding}>
        Get Started
      </button>
    </div>
  </div>
{/if}

<!-- ── App Shell ─────────────────────────────────────────────────────────────── -->
<main class="shell">
  <header class="app-header">
    <span class="wordmark">NutriScan</span>
    {#if view !== 'idle'}
      <button class="btn btn--ghost btn--sm" on:click={reset}>Reset</button>
    {/if}
  </header>

  <!-- ── Idle / Home ──────────────────────────────────────────────────────── -->
  {#if view === 'idle'}
    <section class="home">
      <div class="hero-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </div>
      <h1 class="home-title">What are you eating?</h1>
      <p class="home-sub">Point your camera at any food and get instant nutrition breakdown — processed entirely on your device.</p>

      <div class="home-actions">
        <button class="btn btn--primary btn--full" on:click={startCamera}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Scan Food
        </button>
        <button class="btn btn--secondary btn--full" on:click={() => fileInput?.click()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
          Upload Image
        </button>
      </div>

      {#if errorMsg}
        <p class="error-msg" role="alert">{errorMsg}</p>
      {/if}
    </section>
  {/if}

  <!-- ── Scanning / Viewfinder ─────────────────────────────────────────────── -->
  {#if view === 'scanning'}
    <section class="viewfinder-wrap">
      <!-- Live feed -->
      <!-- svelte-ignore a11y-media-has-caption -->
      <video bind:this={videoEl} class="viewfinder-video" autoplay playsinline></video>

      <!-- Corner bracket overlay -->
      <div class="vf-overlay" aria-hidden="true">
        <div class="vf-bracket vf-bracket--tl"></div>
        <div class="vf-bracket vf-bracket--tr"></div>
        <div class="vf-bracket vf-bracket--bl"></div>
        <div class="vf-bracket vf-bracket--br"></div>
        <div class="vf-scanline"></div>
      </div>

      <div class="vf-hint">Center the food within the frame</div>

      <!-- Controls bar -->
      <div class="vf-controls">
        <button class="btn btn--ghost btn--sm" on:click={() => { stopCamera(); view = 'idle' }}>Cancel</button>
        <button class="shutter-btn" on:click={capturePhoto} aria-label="Capture photo">
          <span class="shutter-inner"></span>
        </button>
        <button class="btn btn--ghost btn--sm" on:click={() => fileInput?.click()}>Upload</button>
      </div>
    </section>
  {/if}

  <!-- ── Analyzing ─────────────────────────────────────────────────────────── -->
  {#if view === 'analyzing'}
    <section class="analyzing">
      {#if capturedUrl}
        <img class="thumb" src={capturedUrl} alt="Captured food" />
      {/if}
      <div class="spinner" aria-label="Analysing image…">
        <div class="spinner-ring"></div>
      </div>
      <p class="analyzing-label">Running on-device model…</p>
      <p class="analyzing-sub">No data leaves your device</p>
    </section>
  {/if}

  <!-- ── Result ─────────────────────────────────────────────────────────────── -->
  {#if view === 'result' && result}
    <section class="result">
      {#if capturedUrl}
        <img class="result-thumb" src={capturedUrl} alt="Scanned food" />
      {/if}

      <div class="result-card">
        <div class="result-header">
          <h2 class="result-label">{result.label}</h2>
          <span class="confidence-chip">{Math.round(result.confidence * 100)}% match</span>
        </div>

        <div class="nutrient-grid">
          <div class="nutrient-cell">
            <span class="nutrient-value">{result.calories}</span>
            <span class="nutrient-name">kcal</span>
          </div>
          <div class="nutrient-cell">
            <span class="nutrient-value">{result.protein}g</span>
            <span class="nutrient-name">Protein</span>
          </div>
          <div class="nutrient-cell">
            <span class="nutrient-value">{result.carbs}g</span>
            <span class="nutrient-name">Carbs</span>
          </div>
          <div class="nutrient-cell">
            <span class="nutrient-value">{result.fat}g</span>
            <span class="nutrient-name">Fat</span>
          </div>
        </div>
      </div>

      <div class="result-actions">
        <button class="btn btn--primary btn--full" on:click={startCamera}>Scan Again</button>
        <button class="btn btn--secondary btn--full" on:click={reset}>Back to Home</button>
      </div>
    </section>
  {/if}
</main>

<style>
  /* ── Design tokens ─────────────────────────────────────────────────────── */
  :root {
    --bg:         #0e0f0e;
    --surface:    #1a1c1a;
    --border:     #2c2e2c;
    --accent:     #7ebe4e;
    --accent-dim: #5a9a35;
    --warm:       #e07c3a;
    --text:       #f0f0ee;
    --text-muted: #8a8e88;
    --radius:     0.75rem;
    font-family: 'Inter', system-ui, sans-serif;
    color-scheme: dark;
  }

  /* ── Base ──────────────────────────────────────────────────────────────── */
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) {
    background: var(--bg);
    color: var(--text);
    height: 100%;
    overscroll-behavior: none;
  }

  .hidden-canvas { display: none; }

  /* ── Shell ─────────────────────────────────────────────────────────────── */
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    max-width: 480px;
    margin: 0 auto;
  }

  /* ── Header ────────────────────────────────────────────────────────────── */
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  .wordmark {
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--accent);
  }

  /* ── Buttons ───────────────────────────────────────────────────────────── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.95rem;
    font-weight: 600;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    padding: 0.7rem 1.25rem;
    transition: opacity 0.15s, background 0.15s;
  }
  .btn:active { opacity: 0.8; }
  .btn--primary  { background: var(--accent); color: #0e0f0e; }
  .btn--secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
  .btn--ghost    { background: transparent; color: var(--text-muted); font-size: 0.85rem; padding: 0.4rem 0.75rem; }
  .btn--sm       { padding: 0.4rem 0.75rem; font-size: 0.85rem; }
  .btn--full     { width: 100%; justify-content: center; }

  /* ── Home ──────────────────────────────────────────────────────────────── */
  .home {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.5rem;
    gap: 1rem;
    text-align: center;
  }
  .hero-icon { color: var(--accent); opacity: 0.7; }
  .home-title { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; }
  .home-sub   { color: var(--text-muted); font-size: 0.9rem; line-height: 1.55; max-width: 300px; }
  .home-actions { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; max-width: 320px; margin-top: 0.5rem; }
  .error-msg { color: var(--warm); font-size: 0.85rem; margin-top: 0.5rem; }

  /* ── Viewfinder ─────────────────────────────────────────────────────────── */
  .viewfinder-wrap {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    background: #000;
    overflow: hidden;
  }
  .viewfinder-video {
    width: 100%;
    flex: 1;
    object-fit: cover;
  }
  .vf-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* Bracket corners */
  .vf-bracket {
    position: absolute;
    width: 36px;
    height: 36px;
    border-color: var(--accent);
    border-style: solid;
    border-width: 0;
  }
  .vf-bracket--tl { top: 15%; left: 10%; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 4px; }
  .vf-bracket--tr { top: 15%; right: 10%; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 4px; }
  .vf-bracket--bl { bottom: 25%; left: 10%; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 4px; }
  .vf-bracket--br { bottom: 25%; right: 10%; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 4px; }

  /* Scan line */
  .vf-scanline {
    position: absolute;
    left: 10%; right: 10%;
    top: 15%;
    height: 2px;
    background: var(--accent);
    opacity: 0.55;
    animation: scanline 2s ease-in-out infinite;
  }
  @keyframes scanline {
    0%   { top: 15%; }
    50%  { top: calc(75% - 2px); }
    100% { top: 15%; }
  }

  .vf-hint {
    position: absolute;
    top: calc(75% + 8px);
    left: 0; right: 0;
    text-align: center;
    font-size: 0.78rem;
    color: var(--text-muted);
    letter-spacing: 0.03em;
  }

  .vf-controls {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem 2rem;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
  }

  /* Shutter */
  .shutter-btn {
    width: 68px; height: 68px;
    border-radius: 50%;
    border: 3px solid #fff;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.12s;
  }
  .shutter-btn:active { transform: scale(0.93); }
  .shutter-inner {
    width: 54px; height: 54px;
    border-radius: 50%;
    background: #fff;
  }

  /* ── Analyzing ─────────────────────────────────────────────────────────── */
  .analyzing {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 2rem 1.5rem;
  }
  .thumb {
    width: 180px; height: 180px;
    object-fit: cover;
    border-radius: var(--radius);
    opacity: 0.6;
  }
  .spinner { position: relative; width: 56px; height: 56px; }
  .spinner-ring {
    width: 100%; height: 100%;
    border-radius: 50%;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .analyzing-label { font-weight: 600; font-size: 1rem; }
  .analyzing-sub   { color: var(--text-muted); font-size: 0.82rem; }

  /* ── Result ─────────────────────────────────────────────────────────────── */
  .result {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem 1.25rem 2rem;
  }
  .result-thumb {
    width: 100%;
    max-height: 240px;
    object-fit: cover;
    border-radius: var(--radius);
  }
  .result-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .result-label { font-size: 1.3rem; font-weight: 700; }
  .confidence-chip {
    font-size: 0.78rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
    border-radius: 999px;
    padding: 0.2rem 0.65rem;
    white-space: nowrap;
  }
  .nutrient-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  .nutrient-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--bg);
    border-radius: 0.5rem;
    padding: 0.75rem 0.25rem;
    gap: 0.15rem;
  }
  .nutrient-value { font-size: 1.05rem; font-weight: 700; color: var(--text); }
  .nutrient-name  { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .result-actions { display: flex; flex-direction: column; gap: 0.75rem; }

  /* ── Onboarding Modal ───────────────────────────────────────────────────── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.72);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 100;
    padding: 0;
  }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius) var(--radius) 0 0;
    padding: 1.75rem 1.5rem 2.5rem;
    width: 100%;
    max-width: 480px;
    max-height: 88dvh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .modal-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .modal-icon { color: var(--accent); }
  .modal-header h2 { font-size: 1.25rem; font-weight: 700; }
  .modal-subtitle { color: var(--text-muted); font-size: 0.88rem; line-height: 1.55; }

  /* Steps list */
  .steps {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    margin: 0.25rem 0;
    counter-reset: steps;
  }
  .steps li {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    counter-increment: steps;
  }

  /* Placeholder image box */
  .step-img {
    flex-shrink: 0;
    width: 88px;
    height: 72px;
    border-radius: 0.5rem;
    border: 1.5px dashed var(--border);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    color: var(--text-muted);
    text-align: center;
  }
  .step-img--cam     { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .step-img--frame   { border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
  .step-img--shutter { border-color: color-mix(in srgb, var(--warm)   35%, transparent); }
  .step-img--upload  { border-color: color-mix(in srgb, var(--text-muted) 40%, transparent); }
  .step-img__label {
    font-size: 0.58rem;
    color: var(--text-muted);
    opacity: 0.6;
    line-height: 1.2;
    padding: 0 0.25rem;
  }

  .step-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding-top: 0.1rem;
  }
  .step-text strong { font-size: 0.92rem; font-weight: 700; }
  .step-text span   { font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; }
  .step-text em     { font-style: normal; color: var(--accent); }
</style>
