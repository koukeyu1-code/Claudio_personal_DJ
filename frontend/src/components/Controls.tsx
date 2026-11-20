import { Play } from 'lucide-react'

interface ControlsProps {
  isPlaying: boolean
  onPlayPause: () => void
  currentTime: number
  duration: number
  onTimeChange: (time: number) => void
}

const WAVE_HEIGHTS = Array.from({ length: 40 }, () =>
  Math.floor(Math.random() * 80 + 20)
)

export default function Controls({ isPlaying, onPlayPause, currentTime, duration }: ControlsProps) {
  const remainingTime = Math.max(0, duration - currentTime)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-white border-t border-gray-100 p-4">
      <div className="flex items-center space-x-4">
        <span className="text-black font-mono text-sm">
          {formatTime(currentTime)}
        </span>

        <div className="flex-1 flex items-end space-x-px h-8">
          {WAVE_HEIGHTS.map((height, i) => {
            const progress = i / 40
            const isActive = progress < (duration - currentTime) / duration
            return (
              <div
                key={i}
                className="w-0.5 rounded-t"
                style={{
                  height: `${height}%`,
                  backgroundColor: isActive ? '#000000' : '#e5e5e5'
                }}
              />
            )
          })}
        </div>

        <button
          onClick={onPlayPause}
          className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <Play size={16} fill={isPlaying ? 'white' : 'none'} />
        </button>
      </div>
    </div>
  )
}
