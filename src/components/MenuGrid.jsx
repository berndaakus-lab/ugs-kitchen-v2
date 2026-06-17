import Image from 'next/image'
import { useState } from 'react'
import { Plus, Minus, UtensilsCrossed, Clock } from 'lucide-react'
import { useCart } from '../context/CartContext'

function formatGHS(amount) {
  return `GH₵ ${Number(amount).toFixed(2)}`
}

// Styled placeholder shown when no image is set or image fails to load
function ImagePlaceholder({ name }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-brand-muted to-orange-100 gap-1">
      <UtensilsCrossed size={28} className="text-brand-orange opacity-50" />
      <span className="text-[10px] text-brand-orange/60 font-semibold text-center px-2 leading-tight">
        {name}
      </span>
    </div>
  )
}

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
          <ImagePlaceholder name={item.name} />
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
        <h3 className="font-bold text-brand-dark text-sm leading-tight">
          {item.name}
        </h3>
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
            <span className="font-extrabold text-brand-dark text-base w-6 text-center">
              {qty}
            </span>
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

export default function MenuGrid({ menuItems, categories, loading }) {
  const { totalItems, totalAmount, openDrawer } = useCart()

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-brand-muted rounded-2xl animate-pulse aspect-[3/4]" />
        ))}
      </div>
    )
  }

  const grouped = categories.map(cat => ({
    ...cat,
    items: menuItems.filter(item => item.category_id === cat.id),
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="pb-32">
      {grouped.map(cat => (
        <section key={cat.id} className="mb-6">
          <h2 className="text-lg font-extrabold text-brand-dark px-4 py-2 sticky top-[60px] bg-brand-cream z-10">
            {cat.name}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
            {cat.items.map(item => (
              <MenuCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}

      {totalItems > 0 && (
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
      )}
    </div>
  )
}
