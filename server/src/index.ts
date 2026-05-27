import cors from 'cors'
import express from 'express'

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(cors())
app.use(express.json())

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

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`)
})