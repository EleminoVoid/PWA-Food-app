# SvelteKit prototype (Uplifting)

This is a small SvelteKit prototype placed in `svelte-app/` to validate migrating the UI.

Quick start:

```bash
cd svelte-app
npm install
npm run dev
```

Notes:
- Dev server proxies `/api` to `http://localhost:3001` (see `vite.config.ts`).
- The page `src/routes/+page.svelte` contains a camera capture workflow and a POST to `/api/identify-food`.
- To build for static hosting (and Capacitor) use `npm run build` and then copy the `build` output to your native project. Use `@sveltejs/adapter-static` in `svelte.config.js`.
