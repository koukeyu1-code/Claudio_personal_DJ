import { Router } from 'express'
import { handleChat } from '../services/aiService'
import { searchMusic, Track } from '../services/musicService'
import { addMessage, addPlay } from '../db'

interface PlayEntry {
  name: string
  artist: string
}

interface AIResponse {
  say: string
  play: PlayEntry[]
  reason?: string
  segue?: string
}

function parseAIResponse(raw: string): AIResponse | null {
  // Try to extract JSON from the response (may be wrapped in markdown code block)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[1])
    if (parsed.say && Array.isArray(parsed.play)) {
      return parsed as AIResponse
    }
    return null
  } catch {
    return null
  }
}

const router = Router()

// POST /api/chat - Send message to AI
router.post('/', async (req, res) => {
  try {
    const { message } = req.body
    const { response: rawResponse } = await handleChat(message)

    // Save user message
    addMessage('user', message)

    // Try to parse structured response
    const parsed = parseAIResponse(rawResponse)

    if (parsed && parsed.play.length > 0) {
      // Resolve each song to a playable track
      const resolvedTracks: Track[] = []
      const unresolved: PlayEntry[] = []

      for (const entry of parsed.play) {
        const results = await searchMusic(`${entry.name} ${entry.artist}`)
        const match = results.find(
          t => t.name === entry.name && t.artist === entry.artist
        ) || results[0]

        if (match) {
          resolvedTracks.push(match)
          addPlay(match.id, match.name, match.artist)
        } else {
          unresolved.push(entry)
        }
      }

      // Save assistant message
      addMessage('assistant', parsed.say)

      res.json({
        response: parsed.say,
        tracks: resolvedTracks,
        unresolved: unresolved.length > 0 ? unresolved : undefined,
        reason: parsed.reason,
        segue: parsed.segue
      })
    } else {
      // Non-structured response (plain text)
      addMessage('assistant', rawResponse)

      res.json({
        response: rawResponse,
        tracks: []
      })
    }
  } catch (error) {
    console.error('[chat error]', error)
    res.status(500).json({ error: String(error instanceof Error ? error.message : error) })
  }
})

export default router
