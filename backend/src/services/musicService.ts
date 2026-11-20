import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const API_BASE = process.env.NCM_API_URL || 'http://localhost:3000'

export interface Track {
  id: string
  name: string
  artist: string
  album: string
  duration: number
  url: string
  coverUrl?: string
}

interface RawSong {
  song: string
  artist: string
  rank?: string
  score?: string
}

interface MusicData {
  all_time_top: RawSong[]
  recent_top: RawSong[]
  playlists: Record<string, { platform: string; count: number; sample: RawSong[] }>
}

let trackIndex: Map<string, Track> = new Map()
let allTracks: Track[] = []
let loaded = false

function makeId(name: string, artist: string): string {
  return crypto.createHash('md5').update(`${name}||${artist}`).digest('hex').slice(0, 12)
}

function songToTrack(song: RawSong): Track {
  const id = makeId(song.song, song.artist)
  return {
    id,
    name: song.song,
    artist: song.artist,
    album: '',
    duration: 0,
    url: `${API_BASE}/api/music/${id}/stream`
  }
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  return tracks.filter(t => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
}

export async function loadMusicData(): Promise<void> {
  if (loaded) return

  const dataPath = path.join(process.cwd(), '../../music_data.json')
  let data: MusicData

  try {
    const raw = await fs.readFile(dataPath, 'utf-8')
    data = JSON.parse(raw)
  } catch {
    console.warn('music_data.json not found, using empty library')
    loaded = true
    return
  }

  const tracks: Track[] = []

  // Index all_time_top
  if (data.all_time_top) {
    for (const song of data.all_time_top) {
      tracks.push(songToTrack(song))
    }
  }

  // Index recent_top
  if (data.recent_top) {
    for (const song of data.recent_top) {
      tracks.push(songToTrack(song))
    }
  }

  // Index playlist samples
  if (data.playlists) {
    for (const playlist of Object.values(data.playlists)) {
      if (playlist.sample) {
        for (const song of playlist.sample) {
          tracks.push(songToTrack(song))
        }
      }
    }
  }

  allTracks = dedupe(tracks)
  for (const track of allTracks) {
    trackIndex.set(track.id, track)
    // Also index by name for search
    trackIndex.set(`${track.name}||${track.artist}`, track)
  }

  console.log(`Music library loaded: ${allTracks.length} tracks`)
  loaded = true
}

export async function searchMusic(query: string): Promise<Track[]> {
  await loadMusicData()
  const lowerQuery = query.toLowerCase()
  const terms = lowerQuery.split(/\s+/).filter(Boolean)

  return allTracks.filter(track => {
    const haystack = `${track.name} ${track.artist}`.toLowerCase()
    return terms.every(term => haystack.includes(term))
  })
}

export async function getTrackUrl(id: string): Promise<string | null> {
  await loadMusicData()
  const track = trackIndex.get(id)
  return track?.url || null
}

export async function getTrackById(id: string): Promise<Track | null> {
  await loadMusicData()
  return trackIndex.get(id) || null
}

export async function getLyrics(_id: string): Promise<string | null> {
  return null
}

export async function getRecommendations(mood?: string): Promise<Track[]> {
  await loadMusicData()
  // Simple mood-based recommendations
  if (mood === 'focus') {
    return allTracks.slice(0, 5)
  }
  if (mood === 'relax') {
    return allTracks.slice(5, 10)
  }
  return allTracks.slice(0, 10)
}

export async function getAllTracks(): Promise<Track[]> {
  await loadMusicData()
  return allTracks
}
