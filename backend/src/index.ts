import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import path from 'path'
import apiRouter from './api'
import { initDatabase } from './db'
import { loadMusicData } from './services/musicService'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
})

// Middleware
app.use(cors())
app.use(express.json())

// Static files for audio (using absolute path from project root)
const publicPath = path.join(process.cwd(), '../public')
app.use('/audio', express.static(path.join(publicPath, 'audio'), {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*')
  }
}))
app.use('/tts', express.static(path.join(publicPath, 'tts')))

// API Routes
app.use('/api', apiRouter)

// Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  socket.on('chat', async (message) => {
    // Handle chat messages
    io.emit('chat-message', { message })
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

// Initialize database and start server
async function startServer() {
  await initDatabase()
  await loadMusicData()

  const PORT = process.env.PORT || 3000
  httpServer.listen(PORT, () => {
    console.log(`Claudio server running on port ${PORT}`)
  })
}

startServer().catch(console.error)

// Export io for use in other modules
export { io }
