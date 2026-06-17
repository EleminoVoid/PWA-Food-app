import cors from 'cors'
import express from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(cors())
app.use(express.json())

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10_000_000 } })

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'pwa-backend',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/todos', (_request, response) => {
  response.json([
    {
      id: 1,
      title: 'Show an offline dashboard',
      done: false,
    },
    {
      id: 2,
      title: 'Sync data when connectivity returns',
      done: false,
    },
    {
      id: 3,
      title: 'Let users install the app',
      done: true,
    },
  ])
})

app.post('/api/echo', (request, response) => {
  response.json({
    received: request.body,
  })
})

app.post('/api/identify-food', upload.single('image'), (request, response) => {
  const file = request.file
  if (!file) return response.status(400).json({ error: 'No image uploaded' })

  // Placeholder processing: in a real app send `file.buffer` to a vision model or cloud API
  const result = {
    foodName: 'Placeholder Food',
    confidence: 0.72,
    size: file.size,
    mimeType: file.mimetype,
  }

  response.json(result)
})

// Serve built web assets if present (supports root `dist` or svelte-app build)
const distPath = path.join(__dirname, '..', '..', 'dist')
app.use(express.static(distPath))
// SPA fallback: serve index.html for any non-API request
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`)
})
