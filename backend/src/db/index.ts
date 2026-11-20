import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import path from 'path'
import fs from 'fs/promises'

const DB_DIR = path.join(process.cwd(), '../data')
const DB_PATH = path.join(DB_DIR, 'db.json')

interface Data {
  messages: Array<{ id: number; role: string; content: string; timestamp: number }>
  plays: Array<{ id: number; trackId: string; trackName: string; artist: string; timestamp: number }>
  prefs: Record<string, string>
}

const defaultData: Data = {
  messages: [],
  plays: [],
  prefs: {}
}

let db: Low<Data> | null = null

export async function initDatabase() {
  // Ensure data directory exists
  await fs.mkdir(DB_DIR, { recursive: true })

  // Initialize lowdb
  const adapter = new JSONFile<Data>(DB_PATH)
  db = new Low(adapter, defaultData)

  await db.read()
  await db.write()

  console.log('Database initialized at', DB_PATH)
  return db
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

// Message operations
export async function addMessage(role: string, content: string) {
  const database = getDatabase()
  const id = database.data.messages.length + 1
  database.data.messages.push({
    id,
    role,
    content,
    timestamp: Date.now()
  })
  await database.write()
  return id
}

export function getRecentMessages(limit = 50) {
  const database = getDatabase()
  return database.data.messages
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .reverse()
}

// Play operations
export async function addPlay(trackId: string, trackName: string, artist: string) {
  const database = getDatabase()
  const id = database.data.plays.length + 1
  database.data.plays.push({
    id,
    trackId,
    trackName,
    artist,
    timestamp: Date.now()
  })
  await database.write()
  return id
}

export function getRecentPlays(limit = 20) {
  const database = getDatabase()
  return database.data.plays
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
}

// Pref operations
export async function setPref(key: string, value: string) {
  const database = getDatabase()
  database.data.prefs[key] = value
  await database.write()
}

export function getPref(key: string): string | undefined {
  const database = getDatabase()
  return database.data.prefs[key]
}
