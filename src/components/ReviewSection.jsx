import { useState, useEffect } from 'react'
import { Star, Send, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Star Rating Input ─────────────────────────────────────────
function StarInput({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform active:scale-90"
        >
          <Star
            size={32}
            className="transition-colors"
            fill={(hovered || value) >= star ? '#E85D04' : 'none'}
            stroke={(hovered || value) >= star ? '#E85D04' : '#D1D5DB'}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  )
}

// ── Star Display (read-only) ──────────────────────────────────
function StarDisplay({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          size={14}
          fill={value >= star ? '#E85D04' : 'none'}
          stroke={value >= star ? '#E85D04' : '#D1D5DB'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  )
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)           return 'Just now'
  if (diff < 3600)         return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)        return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7)   return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' })
}

// ── Review Card ───────────────────────────────────────────────
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

function formatMoMo(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0,3)} ${digits.slice(3)}`
  return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
}

// ── Review Form ───────────────────────────────────────────────
function ReviewForm({ onSubmitted }) {
  const [name,    setName]    = useState('')
  const [momo,    setMomo]    = useState('')
  const [rating,  setRating]  = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const phone = momo.replace(/\s/g, '')
    if (!name.trim())        return setError('Please enter your name.')
    if (phone.length !== 10) return setError('Enter your 10-digit MoMo number to verify.')
    if (rating === 0)        return setError('Please select a star rating.')

    setLoading(true)

    // Upsert — insert new or update existing review for this number
    const { error: dbErr } = await supabase
      .from('reviews')
      .upsert(
        { customer_name: name.trim(), momo_number: phone, rating, comment: comment.trim() || null, is_approved: true },
        { onConflict: 'momo_number' }
      )

    if (dbErr) {
      setError('Could not submit review. Please try again.')
      setLoading(false)
      return
    }

    setName('')
    setMomo('')
    setRating(0)
    setComment('')
    setLoading(false)
    onSubmitted()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 border border-brand-muted shadow-sm space-y-4">
      <h3 className="font-extrabold text-brand-dark text-base">Leave a Review</h3>

      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
          Your Name
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Ama Owusu"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
          MoMo Number <span className="normal-case font-normal text-gray-400">(to verify, not shown publicly)</span>
        </label>
        <input
          type="tel"
          inputMode="numeric"
          value={momo}
          onChange={e => setMomo(formatMoMo(e.target.value))}
          placeholder="024 XXX XXXX"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold tracking-widest outline-none focus:border-brand-orange transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          Rating
        </label>
        <StarInput value={rating} onChange={setRating} />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
          Comment <span className="normal-case font-normal">(optional)</span>
        </label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="How was your experience?"
          rows={3}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-orange transition-colors resize-none"
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-brand-orange text-white font-extrabold rounded-xl py-3 text-sm active:bg-orange-700 transition-colors disabled:opacity-60"
      >
        <Send size={15} />
        {loading ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  )
}

// ── Main ReviewSection ────────────────────────────────────────
export default function ReviewSection() {
  const [reviews,    setReviews]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [submitted,  setSubmitted]  = useState(false)
  const [showForm,   setShowForm]   = useState(false)

  async function fetchReviews() {
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(20)
    setReviews(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchReviews() }, [])

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null

  function handleSubmitted() {
    setSubmitted(true)
    setShowForm(false)
    fetchReviews()
  }

  return (
    <section className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
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
        {!showForm && !submitted && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-brand-orange text-white text-xs font-bold px-3 py-2 rounded-xl active:bg-orange-700 transition-colors"
          >
            + Write Review
          </button>
        )}
      </div>

      {/* Success message after submitting */}
      {submitted && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-4 text-sm font-semibold text-green-700 animate-fade-in">
          🙏 Thank you for your review! We appreciate your feedback.
        </div>
      )}

      {/* Review form */}
      {showForm && (
        <div className="mb-4 animate-fade-in">
          <ReviewForm onSubmitted={handleSubmitted} />
        </div>
      )}

      {/* Reviews list — horizontal scroll on mobile */}
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-72 h-32 flex-shrink-0 bg-brand-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-2xl border border-brand-muted">
          <Star size={32} className="text-gray-200 mx-auto mb-2" />
          <p className="text-gray-400 text-sm font-semibold">No reviews yet.</p>
          <p className="text-gray-400 text-xs mt-1">Be the first to leave one!</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar">
          {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}
    </section>
  )
}
