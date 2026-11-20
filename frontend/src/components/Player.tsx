import { useMemo } from 'react'

interface PlayerProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}

// 生成固定波形高度
const WAVE_HEIGHTS = Array.from({ length: 50 }, () =>
  Math.floor(Math.random() * 60 + 20)
)

export default function Player({ isPlaying, currentTime, duration, onSeek }: PlayerProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="bg-black text-white p-4">
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium">
          C
        </div>
        <div className="flex-1">
          <div className="font-medium text-base">Claudio</div>
          <div className={`text-sm ${isPlaying ? 'text-white' : 'text-green-400'}`}>
            {isPlaying ? 'Playing' : 'Paused'}
          </div>
        </div>
        <div className="text-white/80 font-mono text-sm">
          {formatTime(currentTime)}
        </div>
      </div>

      {/* 进度条 */}
      <div className="mb-3">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-end justify-center space-x-px h-10">
        {WAVE_HEIGHTS.map((height, i) => {
          const isActive = i / 50 < currentTime / duration
          return (
            <div
              key={i}
              className="w-0.5 rounded-t"
              style={{
                height: `${height}%`,
                backgroundColor: isActive ? '#ffffff' : '#404040'
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
