import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'

const router = Router()

const USER_DIR = path.join(process.cwd(), '../user')

// GET /api/taste - Get user taste profile
router.get('/', async (req, res) => {
  try {
    const tastePath = path.join(USER_DIR, 'taste.md')
    const taste = await fs.readFile(tastePath, 'utf-8')
    res.json({ taste })
  } catch (error) {
    res.json({ taste: '' })
  }
})

// PUT /api/taste - Update user taste
router.put('/', async (req, res) => {
  try {
    const { taste } = req.body
    const tastePath = path.join(USER_DIR, 'taste.md')
    await fs.writeFile(tastePath, taste)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to save taste' })
  }
})

export default router
