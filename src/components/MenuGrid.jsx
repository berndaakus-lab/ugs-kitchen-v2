import Image from 'next/image'
import { useState } from 'react'
import { Plus, Minus, UtensilsCrossed, Clock, ArrowLeft, ChevronRight } from 'lucide-react'
import { useCart } from '../context/CartContext'

function formatGHS(amount) {
  return `GH₵ ${Number(amount).toFixed(2)}`
}

// ── Image placeholder for menu items ────────────────────────────
function ItemImagePlaceholder({ name }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-brand-muted to-orange-100 gap-1">
      <UtensilsCrossed size={28} className="text-brand-orange opacity-50" />
      <span className="text-[10px] text-brand-orange/60 font-semibold text-center px-2 leading-tight">
        {name}
      </span>
    </div>
  )
}

// ── Category card ────────────────────────────────────────────────
function CategoryCard({ cat, itemCount, onClick }) {
  const [imgError, setImgError] = useState(false)
  const hasImage = cat.image && !imgError

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-brand-muted flex flex-col active:scale-95 transition-transform text-left"
    >
      {/* Image area */}
      <div className="relative w-full aspect-[4/3] bg-brand-muted">
        {hasImage ? (
          <Image
            src={cat.image}
            alt={cat.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 33vw"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-brand-orange/10 to-brand-brown/20 gap-2">
            <UtensilsCrossed size={32} className="text-brand-orange opacity-40" />
          </div>
        )}
        {/* Item count badge */}
        <span className="absolute top-2 right-2 bg-brand-dark/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Name + arrow */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2 flex-1">
        <p className="font-bold text-brand-dark text-sm leading-tight">{cat.name}</p>
        <ChevronRight size={14} className="text-brand-orange flex-shrink-0" />
      </div>
    </button>
  )
}

// ── Individual menu item card (unchanged from before) ────────────
function MenuCard({ item }) {
  const { addItem, decrement, items } = useCart()
  const cartItem = items.find(i => i.id === item.id)
  const qty = cartItem?.quantity ?? 0
  const [imgError, setImgError] = useState(false)

  const hasImage = item.image && !imgError
  const unavailable = !item.is_available

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-brand-muted flex flex-col transition-transform ${unavailable ? 'opacity-70' : 'active:scale-95'}`}>
      <div className="relative w-full aspect-[4/3] bg-brand-muted">
        {hasImage ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            className={`object-cover ${unavailable ? 'grayscale' : ''}`}
            sizes="(max-width: 640px) 50vw, 33vw"
            onError={() => setImgError(true)}
          />
        ) : (
          <ItemImagePlaceholder name={item.name} />
        )}
        {unavailable ? (
          <span className="absolute top-2 left-2 bg-gray-800/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Out of Stock
          </span>
        ) : item.is_popular && (
          <span className="absolute top-2 left-2 bg-brand-orange text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Popular
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1 flex-1">
        <h3 className="font-bold text-brand-dark text-sm leading-tight">{item.name}</h3>
        {item.description && (
          <p className="text-xs text-gray-500 leading-snug">{item.description}</p>
        )}
        {item.wait_time_minutes && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 mt-0.5">
            <Clock size={10} />
            ~{item.wait_time_minutes} min
          </span>
        )}
        <p className={`font-extrabold text-base mt-auto pt-1 ${unavailable ? 'text-gray-400' : 'text-brand-orange'}`}>
          {formatGHS(item.price)}
        </p>
      </div>

      <div className="px-3 pb-3">
        {unavailable ? (
          <div className="w-full flex items-center justify-center bg-gray-100 text-gray-400 font-bold rounded-xl py-2.5 text-xs">
            Not Available
          </div>
        ) : qty === 0 ? (
          <button
            onClick={() => addItem(item)}
            className="w-full flex items-center justify-center gap-1 bg-brand-brown text-white font-bold rounded-xl py-2.5 text-sm active:bg-brand-dark transition-colors"
          >
            <Plus size={16} strokeWidth={3} />
            Add
          </button>
        ) : (
          <div className="flex items-center justify-between bg-brand-muted rounded-xl px-2 py-1">
            <button
              onClick={() => decrement(item.id)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-sm active:bg-gray-100"
            >
              <Minus size={14} strokeWidth={3} />
            </button>
            <span className="font-extrabold text-brand-dark text-base w-6 text-center">{qty}</span>
            <button
              onClick={() => addItem(item)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-brown text-white shadow-sm active:bg-brand-dark"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Cart floating button (shared between both views) ─────────────
function CartBar({ totalItems, totalAmount, openDrawer }) {
  if (totalItems === 0) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none z-40">
      <button
        onClick={openDrawer}
        className="pointer-events-auto w-full max-w-lg mx-auto flex items-center justify-between bg-brand-dark text-white font-bold rounded-2xl px-5 py-4 shadow-drawer active:bg-gray-900 transition-colors"
      >
        <span className="bg-brand-orange rounded-lg px-2.5 py-0.5 text-sm font-extrabold">
          {totalItems}
        </span>
        <span className="text-base">View Order</span>
        <span className="text-brand-orange font-extrabold">
          {`GH₵ ${totalAmount.toFixed(2)}`}
        </span>
      </button>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────
export default function MenuGrid({ menuItems, categories, loading }) {
  const { totalItems, totalAmount, openDrawer } = useCart()
  const [selectedCat, setSelectedCat] = useState(null)

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-brand-muted rounded-2xl animate-pulse aspect-[3/4]" />
        ))}
      </div>
    )
  }

  // Build category list with item counts (only show cats that have items)
  const grouped = categories.map(cat => ({
    ...cat,
    items: menuItems.filter(item => item.category_id === cat.id),
  })).filter(cat => cat.items.length > 0)

  // ── Items view (when a category is selected) ─────────────────
  if (selectedCat) {
    const cat   = grouped.find(c => c.id === selectedCat)
    const items = cat?.items ?? []

    return (
      <div className="pb-32">
        {/* Category header + back */}
        <div className="flex items-center gap-3 px-4 py-3 sticky top-[60px] bg-brand-cream z-10 border-b border-brand-muted">
          <button
            onClick={() => setSelectedCat(null)}
            className="w-9 h-9 rounded-full bg-brand-muted flex items-center justify-center flex-shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="font-extrabold text-brand-dark text-base leading-tight">{cat?.name}</h2>
            <p className="text-[11px] text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Items grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4 pt-3">
          {items.map(item => (
            <MenuCard key={item.id} item={item} />
          ))}
        </div>

        <CartBar totalItems={totalItems} totalAmount={totalAmount} openDrawer={openDrawer} />
      </div>
    )
  }

  // ── Category grid view (default) ─────────────────────────────
  return (
    <div className="pb-32">
      <div className="px-4 pt-3 pb-2">
        <h2 className="font-extrabold text-brand-dark text-base">What would you like?</h2>
        <p className="text-xs text-gray-400 mt-0.5">Pick a category to see the full menu</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
        {grouped.map(cat => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            itemCount={cat.items.length}
            onClick={() => setSelectedCat(cat.id)}
          />
        ))}
      </div>

      <CartBar totalItems={totalItems} totalAmount={totalAmount} openDrawer={openDrawer} />
    </div>
  )
}
