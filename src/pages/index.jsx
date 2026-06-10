import Head from 'next/head'
import { useState, useEffect } from 'react'
import { ShoppingBag, MapPin, ChevronDown, User, LogOut, History } from 'lucide-react'
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
  const [showUserMenu, setShowUserMenu] = useState(false)

  const { totalItems, openDrawer, clearCart } = useCart()
  const { currentBranch, switchBranch, loading: branchLoading } = useBranch()
  const { customer, isLoggedIn, signOut } = useAuth()

  // Reload menu whenever branch changes
  useEffect(() => {
    if (!currentBranch) return
    setLoading(true)

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
          .eq('is_available', true)
          .order('sort_order'),
      ])
      setCategories(cats ?? [])
      setMenuItems(items ?? [])
      setLoading(false)
    }

    loadMenu()
    clearCart() // clear cart when switching branches
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
        <meta name="theme-color" content="#E85D04" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-brand-cream">
        {/* Top nav */}
        <header className="sticky top-0 z-30 bg-brand-cream/95 backdrop-blur border-b border-brand-muted">
          <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-[60px]">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-brand-orange rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-white font-extrabold text-lg leading-none">U</span>
              </div>
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

            <div className="flex items-center gap-2">
              {/* Auth button */}
              {isLoggedIn ? (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(v => !v)}
                    className="flex items-center gap-1.5 bg-brand-muted text-brand-dark px-3 py-2 rounded-xl font-bold text-sm"
                  >
                    <User size={15} />
                    <span className="max-w-[80px] truncate">{customer.name.split(' ')[0]}</span>
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-brand-muted overflow-hidden z-50 w-44">
                      <Link
                        href="/orders"
                        className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-brand-dark hover:bg-brand-muted"
                        onClick={() => setShowUserMenu(false)}
                      >
                        <History size={15} />
                        My Orders
                      </Link>
                      <button
                        onClick={() => { signOut(); setShowUserMenu(false) }}
                        className="flex items-center gap-2 w-full px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 border-t border-brand-muted"
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
                  className="flex items-center gap-1 text-brand-orange font-bold text-sm px-2 py-1.5 rounded-xl hover:bg-brand-muted transition-colors"
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
                  <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Hero banner */}
        <div className="max-w-lg mx-auto px-4 pt-4 pb-2">
          <div className="bg-gradient-to-r from-brand-orange to-orange-400 rounded-2xl px-5 py-4 text-white">
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

      {/* Close user dropdown when clicking outside */}
      {showUserMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
      )}
    </>
  )
}
