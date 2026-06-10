import { MapPin, ChevronRight } from 'lucide-react'
import { useBranch } from '../context/BranchContext'

export default function BranchSelector() {
  const { branches, showSelector, selectBranch, currentBranch } = useBranch()

  if (!showSelector) return null

  return (
    <div className="fixed inset-0 z-[60] bg-brand-dark flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg bg-brand-cream rounded-t-3xl sm:rounded-3xl animate-slide-up sm:animate-fade-in">

        {/* Header */}
        <div className="px-6 pt-8 pb-5 text-center">
          <div className="w-14 h-14 bg-brand-orange rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-extrabold text-2xl leading-none">U</span>
          </div>
          <h1 className="text-2xl font-extrabold text-brand-dark leading-tight">
            Welcome to UGs Kitchen!
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Select your nearest branch to see the menu and place your order.
          </p>
        </div>

        {/* Branch list */}
        <div className="px-5 pb-8 space-y-3">
          {branches.map(branch => (
            <button
              key={branch.id}
              onClick={() => selectBranch(branch)}
              className="w-full flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm border-2 border-transparent active:border-brand-orange transition-all text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                <MapPin size={20} className="text-brand-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-brand-dark text-base leading-tight">
                  {branch.name}
                </p>
                {branch.address && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{branch.address}</p>
                )}
              </div>
              <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}

          <p className="text-center text-xs text-gray-400 pt-2">
            More branches coming soon 🚀
          </p>
        </div>
      </div>
    </div>
  )
}
