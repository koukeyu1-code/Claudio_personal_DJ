interface NavbarProps {
  currentView: 'HOME' | 'XHS' | 'MUSIC'
  onViewChange: (view: 'HOME' | 'XHS' | 'MUSIC') => void
}

const views: Array<'HOME' | 'XHS' | 'MUSIC'> = ['HOME', 'XHS', 'MUSIC']

export default function Navbar({ currentView, onViewChange }: NavbarProps) {
  return (
    <nav className="bg-black h-12 flex items-center justify-center">
      {views.map((view, index) => (
        <div key={view} className="flex items-center">
          <button
            onClick={() => onViewChange(view)}
            className={`text-xs font-medium px-2 ${
              currentView === view ? 'text-white' : 'text-gray-600'
            } hover:text-white transition-colors`}
          >
            {view}
          </button>
          {index < views.length - 1 && <span className="text-white/30 mx-1">/</span>}
        </div>
      ))}
    </nav>
  )
}
