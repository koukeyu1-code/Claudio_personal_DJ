import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

const FISH_API_KEY = process.env.FISH_API_KEY
const FISH_API_URL = 'https://api.fish.audio'
const TTS_DIR = path.join(process.cwd(), '../public/tts')

export async function textToSpeech(text: string): Promise<string> {
  if (!FISH_API_KEY) {
    throw new Error('FISH_API_KEY not configured')
  }

  // Generate hash for caching
  const hash = crypto.createHash('md5').update(text).digest('hex')
  const filename = `${hash}.mp3`
  const filepath = path.join(TTS_DIR, filename)

  // Check cache
  try {
    await fs.access(filepath)
    return `/tts/${filename}`
  } catch {
    // Not cached, generate
  }

  try {
    const response = await axios.post(
      `${FISH_API_URL}/v1/tts`,
      {
        text,
        format: 'mp3',
        sample_rate: 24000
      },
      {
        headers: {
          'Authorization': `Bearer ${FISH_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    )

    // Ensure TTS directory exists
    await fs.mkdir(TTS_DIR, { recursive: true })

    // Save audio file
    await fs.writeFile(filepath, response.data)

    return `/tts/${filename}`
  } catch (error) {
    console.error('TTS failed:', error)
    throw error
  }
}
