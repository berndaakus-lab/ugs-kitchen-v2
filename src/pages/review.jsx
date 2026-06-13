import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import { Star, Send, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

function formatMoMo(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0,3)} ${digits.slice(3)}`
  return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
}

function StarInput({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!']
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
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
              size={44}
              fill={(hovered || value) >= star ? '#F38F1D' : 'none'}
              stroke={(hovered || value) >= star ? '#F38F1D' : '#D1D5DB'}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
      <span className="text-sm font-bold text-brand-orange h-5">
        {labels[hovered || value] || ''}
      </span>
    </div>
  )
}

export default function ReviewPage() {
  const [name,      setName]      = useState('')
  const [momo,      setMomo]      = useState('')
  const [rating,    setRating]    = useState(0)
  const [comment,   setComment]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const phone = momo.replace(/\s/g, '')
    if (!name.trim())        return setError('Please enter your name.')
    if (phone.length !== 10) return setError('Enter your 10-digit MoMo number.')
    if (rating === 0)        return setError('Please choose a star rating.')

    setLoading(true)

    // Upsert — updates existing review if same number, inserts if new
    const { error: dbErr } = await supabase
      .from('reviews')
      .upsert(
        { customer_name: name.trim(), momo_number: phone, rating, comment: comment.trim() || null, is_approved: true },
        { onConflict: 'momo_number' }
      )

    if (dbErr) {
      setError('Could not submit. Please try again.')
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <>
        <Head>
          <title>Thank You · UGs Kitchen</title>
        </Head>
        <div className="min-h-screen bg-brand-cream flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-xl animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={44} className="text-green-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-brand-dark mb-2">
              Thank You! 🙏
            </h1>
            <p className="text-gray-500 text-sm mb-6">
              Your review has been saved. We truly appreciate your feedback — it helps us serve you better!
            </p>
            <div className="flex gap-1 justify-center mb-6">
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={20}
                  fill={rating >= s ? '#F38F1D' : 'none'}
                  stroke={rating >= s ? '#F38F1D' : '#D1D5DB'}
                  strokeWidth={1.5}
                />
              ))}
            </div>
            <Link
              href="/"
              className="block w-full bg-brand-brown text-white font-extrabold rounded-2xl py-4 text-base active:bg-brand-dark transition-colors text-center"
            >
              Order Again 🍽️
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>Leave a Review · UGs Kitchen</title>
        <meta name="description" content="How was your UGs Kitchen experience? Leave us a review." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-brand-cream">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-brand-cream/95 backdrop-blur border-b border-brand-muted">
          <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-[60px]">
            <Link href="/" className="w-9 h-9 rounded-xl bg-brand-muted flex items-center justify-center">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="font-extrabold text-brand-dark text-base leading-tight">UGs Kitchen</p>
              <p className="text-[10px] text-gray-400">Share your experience</p>
            </div>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-8">
          {/* Top message */}
          <div className="text-center mb-8">
            <div className="flex justify-center mx-auto mb-4">
              <img src="/logo-ugs.jpeg" alt="UGs Kitchen" className="w-16 h-16 object-contain" />
            </div>
            <h1 className="text-2xl font-extrabold text-brand-dark mb-1">
              How was your meal? 😋
            </h1>
            <p className="text-gray-500 text-sm">
              Your honest review helps us improve and helps other customers too.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 shadow-sm border border-brand-muted space-y-5">

            {/* Stars — most prominent element */}
            <div className="flex flex-col items-center py-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Your Rating
              </label>
              <StarInput value={rating} onChange={setRating} />
            </div>

            <div className="border-t border-gray-100" />

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Ama Owusu"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold outline-none focus:border-brand-orange transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                MoMo Number
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={momo}
                onChange={e => setMomo(formatMoMo(e.target.value))}
                placeholder="024 XXX XXXX"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold tracking-widest outline-none focus:border-brand-orange transition-colors"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Used to verify one review per customer — not shown publicly.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                Comment <span className="normal-case font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Tell us about your experience…"
                rows={4}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold outline-none focus:border-brand-orange transition-colors resize-none"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-3 animate-fade-in">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-brown text-white font-extrabold rounded-2xl py-4 text-base active:bg-brand-dark transition-colors disabled:opacity-60"
            >
              <Send size={18} />
              {loading ? 'Submitting…' : 'Submit Review'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
