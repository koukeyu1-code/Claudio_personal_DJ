import { Router } from 'express'

const router = Router()

// GET /api/player/now - Get current playing state
router.get('/now', (req, res) => {
  res.json({
    isPlaying: false,
    currentTrack: null,
    currentTime: 0
  })
})

// POST /api/player/play - Play a track
router.post('/play', (req, res) => {
  const { trackId } = req.body
  res.json({ success: true })
})

// POST /api/player/pause - Pause playback
router.post('/pause', (req, res) => {
  res.json({ success: true })
})

// POST /api/player/next - Next track
router.post('/next', (req, res) => {
  res.json({ success: true })
})

export default router
