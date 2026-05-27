import './App.css'

function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="status-row">
          <span className="pill">PWA starter</span>
          <span className="status-dot">Offline-ready foundation</span>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">Progressive web app checklist</p>
          <h1>Build an app that installs like native and works when the network does not.</h1>
          <p className="lede">
            This starter gives you a React shell, a manifest, a service worker, and a
            clean launch screen so you can focus on product behavior instead of setup.
          </p>
        </div>

        <div className="hero-actions">
          <a className="primary-action" href="#basics">
            See the essentials
          </a>
          <a
            className="secondary-action"
            href="https://web.dev/explore/progressive-web-apps"
            target="_blank"
            rel="noreferrer"
          >
            Read the PWA guide
          </a>
        </div>

        <ul className="feature-strip" aria-label="PWA capabilities">
          <li>
            <strong>Installable</strong>
            <span>Manifest + icon</span>
          </li>
          <li>
            <strong>Cached</strong>
            <span>Offline shell</span>
          </li>
          <li>
            <strong>Responsive</strong>
            <span>Mobile-first layout</span>
          </li>
        </ul>
      </section>

      <section className="content-grid" id="basics">
        <article className="panel">
          <p className="panel-label">Step 1</p>
          <h2>Define the product surface</h2>
          <p>
            Start with one clear workflow, one dashboard, or one daily task. PWA features
            work best when the app has a focused core purpose.
          </p>
        </article>

        <article className="panel">
          <p className="panel-label">Step 2</p>
          <h2>Decide what should work offline</h2>
          <p>
            Pick the minimum screens and data that should remain usable if connectivity is
            poor or unavailable.
          </p>
        </article>

        <article className="panel panel-wide">
          <p className="panel-label">Step 3</p>
          <h2>Ship the install experience</h2>
          <p>
            Add a manifest, a service worker, an app icon, and a theme color. Then test the
            app from the browser menu or install prompt.
          </p>
          <div className="checklist">
            <span>App manifest</span>
            <span>Service worker</span>
            <span>Cached assets</span>
            <span>Standalone display</span>
          </div>
        </article>
      </section>
    </main>
  )
}

export default App
