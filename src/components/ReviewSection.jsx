import { useState, useEffect } from 'react'
import { Star, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'

function StarDisplay({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          size={14}
          fill={value >= star ? '#F38F1D' : 'none'}
          stroke={value >= star ? '#F38F1D' : '#D1D5DB'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  )
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)         return 'Just now'
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' })
}

function ReviewCard({ review }) {
  const initials = review.customer_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand-muted flex-shrink-0 w-72 snap-start">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-full bg-brand-orange flex items-center justify-center flex-shrink-0">
          <span className="text-white font-extrabold text-xs">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-brand-dark text-sm truncate">{review.customer_name}</p>
          <p className="text-[11px] text-gray-400">{timeAgo(review.created_at)}</p>
        </div>
        <StarDisplay value={review.rating} />
      </div>
      {review.comment && (
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{review.comment}</p>
      )}
    </div>
  )
}

export default function ReviewSection() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('reviews')
      .select('id, customer_name, rating, comment, created_at')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setReviews(data ?? []); setLoading(false) })
  }, [])

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null

  if (!loading && reviews.length === 0) return null

  return (
    <section className="max-w-lg mx-auto px-4 py-6">
      <div className="mb-4">
        <h2 className="text-lg font-extrabold text-brand-dark flex items-center gap-2">
          <MessageSquare size={18} className="text-brand-orange" />
          Customer Reviews
        </h2>
        {avgRating && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <StarDisplay value={Math.round(avgRating)} />
            <span className="text-sm font-bold text-brand-dark">{avgRating}</span>
            <span className="text-xs text-gray-400">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-72 h-32 flex-shrink-0 bg-brand-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar">
          {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}
    </section>
  )
}
