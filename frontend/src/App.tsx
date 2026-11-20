import { useState, useEffect, useRef } from 'react'
import Player from './components/Player'
import NowPlaying from './components/NowPlaying'
import Lyrics from './components/Lyrics'

const API_BASE = 'http://localhost:3000'

interface Track {
  id: string
  name: string
  artist: string
  album: string
  duration: number
  url: string
}

export default function App() {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [chatInput, setChatInput] = useState('')
  const [djMessage, setDjMessage] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    audioRef.current = new Audio()
    audioRef.current.addEventListener('timeupdate', handleTimeUpdate)
    audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata)
    audioRef.current.addEventListener('ended', handleEnded)

    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate)
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata)
        audioRef.current.removeEventListener('ended', handleEnded)
      }
    }
  }, [])

  // Keep handleEnded updated with current queue state
  const queueRef = useRef(queue)
  queueRef.current = queue

  useEffect(() => {
    fetch(`${API_BASE}/api/music/tracks`)
      .then(res => res.json())
      .then((tracks: Track[]) => {
        if (tracks.length > 0) {
          setCurrentTrack(tracks[0])
        }
      })
      .catch(err => console.error('Failed to load tracks:', err))
  }, [])

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    // Auto-advance to next track in queue
    const currentQueue = queueRef.current
    if (currentQueue.length > 0) {
      const [next, ...rest] = currentQueue
      setQueue(rest)
      playTrack(next)
    } else {
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }

  const playTrack = (track: Track) => {
    if (!audioRef.current) return
    audioRef.current.src = track.url
    audioRef.current.play().catch(err => console.error('Play error:', err))
    setCurrentTrack(track)
    setIsPlaying(true)
    setCurrentTime(0)
  }

  const enqueueAndPlay = (tracks: Track[]) => {
    if (tracks.length === 0) return
    const [first, ...rest] = tracks
    setQueue(rest)
    playTrack(first)
  }

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const togglePlayPause = () => {
    if (!audioRef.current || !currentTrack) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      if (audioRef.current.src !== currentTrack.url) {
        audioRef.current.src = currentTrack.url
      }
      audioRef.current.play().catch(err => console.error('Play error:', err))
    }
    setIsPlaying(!isPlaying)
  }

  const sendChat = async () => {
    if (!chatInput.trim()) return
    const message = chatInput.trim()
    setChatInput('')
    setDjMessage('Thinking...')

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })
      const data = await res.json()

      if (data.response) {
        setDjMessage(data.response)
      }
      if (data.tracks && data.tracks.length > 0) {
        enqueueAndPlay(data.tracks)
      }
    } catch (err) {
      console.error('Chat error:', err)
      setDjMessage('Oops, something went wrong.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-8">
      <div className="w-full max-w-[380px] h-[85vh] max-h-[800px] bg-white rounded-3xl shadow-2xl shadow-purple-500/20 overflow-hidden flex flex-col">
        <audio ref={audioRef} />

        {/* Player header */}
        <Player
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
        />

        {/* Track info */}
        {currentTrack && (
          <NowPlaying
            title={currentTrack.name}
            artist={`${currentTrack.artist}${currentTrack.album ? ` — ${currentTrack.album}` : ''}`}
            isPlaying={isPlaying}
            onPlayPause={togglePlayPause}
          />
        )}

        {/* Queue indicator */}
        {queue.length > 0 && (
          <div className="px-6 py-2 text-xs text-gray-400">
            Up next: {queue.map(t => t.name).join(', ')}
          </div>
        )}

        {/* Lyrics area / DJ message */}
        <Lyrics currentTime={currentTime} djMessage={djMessage} />

        {/* Chat input */}
        <div className="px-4 pb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder="Tell Claudio what you want to hear..."
              className="flex-1 px-4 py-2 rounded-full border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
            />
            <button
              onClick={sendChat}
              className="px-4 py-2 rounded-full bg-black text-white text-sm hover:bg-gray-800"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
