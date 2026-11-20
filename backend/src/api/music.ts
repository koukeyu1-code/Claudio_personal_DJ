import { Router } from 'express'
import * as musicService from '../services/musicService'

const router = Router()

// GET /api/music/search - Search music
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query
    const results = await musicService.searchMusic(q as string || '')
    res.json({ songs: results })
  } catch (error) {
    res.status(500).json({ error: 'Search failed' })
  }
})

// GET /api/music/tracks - Get all tracks
router.get('/tracks', async (req, res) => {
  try {
    const tracks = await musicService.getAllTracks()
    res.json(tracks)
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tracks' })
  }
})

// GET /api/music/:id/url - Get playback URL
router.get('/:id/url', async (req, res) => {
  try {
    const url = await musicService.getTrackUrl(req.params.id)
    res.json({ data: [{ url }] })
  } catch (error) {
    res.status(500).json({ error: 'Failed to get URL' })
  }
})

// GET /api/music/:id/lyric - Get lyrics
router.get('/:id/lyric', async (req, res) => {
  try {
    const lyric = await musicService.getLyrics(req.params.id)
    res.json({ lrc: { lyric } })
  } catch (error) {
    res.status(500).json({ error: 'Failed to get lyrics' })
  }
})

// GET /api/music/recommend - Get recommendations
router.get('/recommend', async (req, res) => {
  try {
    const { mood } = req.query
    const tracks = await musicService.getRecommendations(mood as string)
    res.json({ data: { songs: tracks } })
  } catch (error) {
    res.status(500).json({ error: 'Recommendation failed' })
  }
})

export default router
