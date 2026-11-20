import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface NowPlayingData {
  title: string
  artist: string
  isPlaying: boolean
  currentTime: number
  duration: number
}

export function useSocket(url: string) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null)

  useEffect(() => {
    const socketInstance = io(url, {
      transports: ['websocket']
    })

    socketInstance.on('connect', () => {
      console.log('Connected to server')
    })

    socketInstance.on('now-playing', (data: NowPlayingData) => {
      setNowPlaying(data)
    })

    socketInstance.on('chat-message', (message) => {
      console.log('Chat message:', message)
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [url])

  return { socket, nowPlaying }
}
