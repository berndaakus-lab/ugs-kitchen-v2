import Head from 'next/head'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft, Camera, Check, Loader2, Phone, User, ShoppingBag, LogOut } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function Avatar({ src, name, size = 80 }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover border-4 border-white shadow-md"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className="rounded-full flex items-center justify-center border-4 border-white shadow-md font-extrabold text-white text-2xl"
      style={{ width: size, height: size, background: 'linear-gradient(135deg, #ff9900, #663300)' }}
    >
      {initials}
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const { customer, isLoggedIn, loading: authLoading, updateProfile, signOut } = useAuth()

  const [name,        setName]        = useState('')
  const [avatarUrl,   setAvatarUrl]   = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')
  const [orderCount,  setOrderCount]  = useState(null)

  const fileRef = useRef(null)

  useEffect(() => {
    if (authLoading) return
    if (!isLoggedIn) { router.replace('/?signin=1'); return }
    setName(customer.name ?? '')
    setAvatarUrl(customer.avatar_url ?? null)
    loadOrderCount()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn])

  async function loadOrderCount() {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('momo_number', customer.phone)
    setOrderCount(count ?? 0)
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2 MB'); return }

    setUploading(true)
    setError('')

    const ext  = file.name.split('.').pop()
    const path = `avatars/${customer.id}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('customer-avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) {
      setError('Upload failed. Please try again.')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('customer-avatars')
      .getPublicUrl(path)

    const { error: profileErr } = await updateProfile({ avatar_url: publicUrl })
    if (profileErr) setError(profileErr)
    else setAvatarUrl(publicUrl)

    setUploading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name cannot be empty'); return }
    setSaving(true)
    setError('')

    const { error: err } = await updateProfile({ name })
    if (err) setError(err)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }

    setSaving(false)
  }

  function handleSignOut() {
    signOut()
    router.replace('/')
  }

  if (authLoading || (!isLoggedIn && !authLoading)) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-brand-orange" />
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>My Profile · UGs Kitchen</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <div className="min-h-screen bg-brand-cream">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-brand-cream/95 backdrop-blur border-b border-brand-muted">
          <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-[60px]">
            <Link href="/" className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-muted">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="font-extrabold text-brand-dark text-base leading-tight">My Profile</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

          {/* Avatar section */}
          <div className="bg-white rounded-2xl shadow-sm border border-brand-muted p-6 flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar src={avatarUrl} name={customer?.name} size={88} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand-orange text-white flex items-center justify-center shadow-md border-2 border-white"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="text-center">
              <p className="font-extrabold text-brand-dark text-lg">{customer?.name}</p>
              <p className="text-sm text-gray-400 mt-0.5">{customer?.phone}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-brand-muted p-4 flex flex-col items-center gap-1">
              <ShoppingBag size={22} className="text-brand-orange" />
              <p className="text-2xl font-extrabold text-brand-dark">
                {orderCount === null ? '—' : orderCount}
              </p>
              <p className="text-xs text-gray-400 font-semibold">Total Orders</p>
            </div>
            <Link
              href="/orders"
              className="bg-white rounded-2xl border border-brand-muted p-4 flex flex-col items-center gap-1 active:bg-gray-50"
            >
              <ShoppingBag size={22} className="text-brand-brown" />
              <p className="text-sm font-extrabold text-brand-dark mt-1">View History</p>
              <p className="text-xs text-gray-400 font-semibold">All orders</p>
            </Link>
          </div>

          {/* Edit name form */}
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-brand-muted p-5 space-y-4">
            <h2 className="font-extrabold text-brand-dark text-base">Edit Profile</h2>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                Full Name
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full pl-9 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-brand-orange transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                Phone Number
              </label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={customer?.phone ?? ''}
                  disabled
                  className="w-full pl-9 pr-4 py-3 border-2 border-gray-100 rounded-xl text-sm font-semibold text-gray-400 bg-gray-50 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Phone number cannot be changed</p>
            </div>

            {error && (
              <p className="text-sm text-red-500 font-semibold">{error}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-brand-brown text-white font-extrabold rounded-2xl py-3 text-sm disabled:opacity-60 transition-opacity"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : saved ? (
                <><Check size={16} /> Saved!</>
              ) : (
                'Save Changes'
              )}
            </button>
          </form>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 bg-white border-2 border-red-100 text-red-500 font-extrabold rounded-2xl py-3 text-sm active:bg-red-50 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>

        </main>
      </div>
    </>
  )
}
