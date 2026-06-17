import Head from 'next/head'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { ShoppingBag, MapPin, ChevronDown, User, LogOut, History, UserCircle2 } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import MenuGrid from '../components/MenuGrid'
import OrderDrawer from '../components/OrderDrawer'
import PayStatus from '../components/PayStatus'
import ReviewSection from '../components/ReviewSection'
import BranchSelector from '../components/BranchSelector'
import AuthModal from '../components/AuthModal'
import Footer from '../components/Footer'
import { useCart } from '../context/CartContext'
import { useBranch } from '../context/BranchContext'
import { useAuth } from '../context/AuthContext'

export default function Home() {
  const [menuItems,   setMenuItems]   = useState([])
  const [categories,  setCategories]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [paidOrder,   setPaidOrder]   = useState(null)
  const [showAuth,    setShowAuth]    = useState(false)
  const [showAccMenu, setShowAccMenu] = useState(false)
  const router = useRouter()
  const prevBranchId = useRef(null)
  const accMenuRef   = useRef(null)

  // Close account menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (accMenuRef.current && !accMenuRef.current.contains(e.target)) {
        setShowAccMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const { totalItems, openDrawer, clearCart } = useCart()
  const { currentBranch, switchBranch, loading: branchLoading } = useBranch()
  const { customer, isLoggedIn, signOut } = useAuth()

  // Auto-open sign-in modal when redirected from /orders as a guest
  useEffect(() => {
    if (router.query.signin === '1') {
      setShowAuth(true)
      router.replace('/', undefined, { shallow: true })
    }
  }, [router.query.signin])

  // Auto-open cart drawer when redirected back from reorder
  useEffect(() => {
    if (router.query.opencart === '1') {
      openDrawer()
      router.replace('/', undefined, { shallow: true })
    }
  }, [router.query.opencart])

  // Reload menu whenever branch changes
  useEffect(() => {
    if (!currentBranch) return
    setLoading(true)

    // Only clear cart when branch actually switches — NOT on initial mount
    // (reorder adds items before navigating back, we must not wipe them)
    if (prevBranchId.current && prevBranchId.current !== currentBranch.id) {
      clearCart()
    }
    prevBranchId.current = currentBranch.id

    async function loadMenu() {
      const [{ data: cats }, { data: items }] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('branch_id', currentBranch.id)
          .order('sort_order'),
        supabase
          .from('menu_items')
          .select('*')
          .eq('branch_id', currentBranch.id)
          .order('sort_order'),
      ])
      setCategories(cats ?? [])
      setMenuItems(items ?? [])
      setLoading(false)
    }

    loadMenu()
  }, [currentBranch])

  function handlePaymentSuccess(order) {
    setPaidOrder(order)
  }

  return (
    <>
      <Head>
        <title>{currentBranch ? `${currentBranch.name} · UGs Kitchen` : 'UGs Kitchen'}</title>
        <meta name="description" content="Fresh Ghanaian food, delivered fast. Order in 3 taps." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#F38F1D" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-brand-cream">
        {/* Top nav */}
        <header className="sticky top-0 z-30 bg-brand-cream/95 backdrop-blur border-b border-brand-muted">
          <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-[60px]">
            <div className="flex items-center gap-2">
              <img src="/logo-ugs.jpeg" alt="UGs Kitchen" className="w-9 h-9 object-contain rounded-xl flex-shrink-0" />
              <div>
                <p className="font-extrabold text-brand-dark text-base leading-tight">UGs Kitchen</p>
                {/* Branch switcher */}
                {currentBranch && (
                  <button
                    onClick={switchBranch}
                    className="flex items-center gap-1 text-[11px] text-brand-orange font-semibold leading-tight"
                  >
                    <MapPin size={10} />
                    {currentBranch.name}
                    <ChevronDown size={10} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isLoggedIn ? (
                <div className="relative" ref={accMenuRef}>
                  {/* Account trigger */}
                  <button
                    onClick={() => setShowAccMenu(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-brand-muted"
                  >
                    {customer.avatar_url ? (
                      <img
                        src={customer.avatar_url}
                        alt={customer.name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <UserCircle2 size={20} className="text-brand-dark" />
                    )}
                    <span className="text-xs font-bold text-brand-dark max-w-[60px] truncate hidden sm:block">
                      {customer.name.split(' ')[0]}
                    </span>
                    <ChevronDown size={13} className="text-gray-400" />
                  </button>

                  {/* Dropdown */}
                  {showAccMenu && (
                    <div className="absolute right-0 top-[calc(100%+6px)] w-44 bg-white rounded-2xl shadow-lg border border-brand-muted overflow-hidden z-50">
                      <Link
                        href="/profile"
                        onClick={() => setShowAccMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-brand-dark hover:bg-brand-muted transition-colors"
                      >
                        <User size={15} className="text-brand-orange" />
                        My Profile
                      </Link>
                      <Link
                        href="/orders"
                        onClick={() => setShowAccMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-brand-dark hover:bg-brand-muted transition-colors border-t border-gray-100"
                      >
                        <History size={15} className="text-brand-orange" />
                        My Orders
                      </Link>
                      <button
                        onClick={() => { signOut(); setShowAccMenu(false) }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors border-t border-gray-100"
                      >
                        <LogOut size={15} />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  className="flex items-center gap-1 text-brand-orange font-bold text-sm px-2.5 py-1.5 rounded-xl bg-brand-muted"
                >
                  <User size={15} />
                  Sign In
                </button>
              )}

              {/* Cart */}
              {totalItems > 0 && (
                <button
                  onClick={openDrawer}
                  className="flex items-center gap-1.5 bg-brand-dark text-white px-3 py-2 rounded-xl font-bold text-sm"
                >
                  <ShoppingBag size={16} />
                  <span>{totalItems}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Hero banner */}
        <div className="max-w-lg mx-auto px-4 pt-4 pb-2">
          <div className="bg-gradient-to-r from-brand-orange to-brand-brown rounded-2xl px-5 py-4 text-white">
            <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-0.5">
              {currentBranch?.name ?? 'Order Now'}
            </p>
            <h1 className="text-2xl font-extrabold leading-tight">
              Freshly Cooked,<br />Fast Delivered
            </h1>
            <p className="text-sm opacity-90 mt-1">
              {currentBranch?.address
                ? `📍 ${currentBranch.address}`
                : 'Pick your food, pay with MoMo, done in 3 taps.'}
            </p>
          </div>
        </div>

        {/* Menu */}
        <main className="max-w-lg mx-auto">
          <MenuGrid
            menuItems={menuItems}
            categories={categories}
            loading={loading || branchLoading}
          />
        </main>

        {/* Reviews */}
        <ReviewSection />

        <Footer />
      </div>

      {/* Branch selector overlay */}
      <BranchSelector />

      {/* Checkout drawer */}
      <OrderDrawer onPaymentSuccess={handlePaymentSuccess} />

      {/* Success overlay */}
      {paidOrder && (
        <PayStatus order={paidOrder} onDismiss={() => setPaidOrder(null)} />
      )}

      {/* Auth modal */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
