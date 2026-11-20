import { Play } from 'lucide-react'

interface NowPlayingProps {
  title: string
  artist: string
  isPlaying: boolean
  onPlayPause: () => void
}

export default function NowPlaying({
  title,
  artist,
  isPlaying,
  onPlayPause
}: NowPlayingProps) {
  return (
    <div className="flex-1 bg-white p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-black mb-1">{title}</h1>
          <p className="text-gray-500">{artist}</p>
        </div>
        <button
          onClick={onPlayPause}
          className="w-14 h-14 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <Play size={24} fill={isPlaying ? 'white' : 'none'} />
        </button>
      </div>
    </div>
  )
}
