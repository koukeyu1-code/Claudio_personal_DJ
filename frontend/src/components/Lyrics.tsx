interface LyricLine {
  time: number
  text: string
  speaker?: string
}

const defaultLyrics: LyricLine[] = [
  { time: 0, text: 'This is Claudio.', speaker: 'Claudio' },
  { time: 3, text: 'Back in 1971, David Gates wrote this song...', speaker: 'Claudio' },
  { time: 8, text: 'A timeless piece about lost love and memories.', speaker: 'Claudio' },
  { time: 15, text: 'Let the music take you back.', speaker: 'Claudio' },
]

interface LyricsProps {
  currentTime?: number
  djMessage?: string
}

export default function Lyrics({ currentTime = 0, djMessage }: LyricsProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex-1 px-6 pb-4 overflow-y-auto">
      {/* DJ message */}
      {djMessage && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl text-sm text-gray-700">
          {djMessage}
        </div>
      )}

      {/* Lyrics */}
      <div className="space-y-4">
        {defaultLyrics.map((line, index) => {
          const isActive = currentTime >= line.time
          return (
            <div key={index} className="flex items-start space-x-3">
              <span className={`text-xs font-mono whitespace-nowrap ${
                isActive ? 'text-black' : 'text-gray-300'
              }`}>
                {formatTime(line.time)}
              </span>
              <div className={isActive ? 'text-black font-medium' : 'text-gray-400'}>
                <span className="text-base">{line.text}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
