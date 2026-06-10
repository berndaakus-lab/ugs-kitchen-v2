import Head from 'next/head'
import { useState, useEffect } from 'react'
import { ShoppingBag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import MenuGrid from '../components/MenuGrid'
import OrderDrawer from '../components/OrderDrawer'
import PayStatus from '../components/PayStatus'
import { useCart } from '../context/CartContext'

export default function Home() {
  const [menuItems,   setMenuItems]   = useState([])
  const [categories,  setCategories]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [paidOrder,   setPaidOrder]   = useState(null)
  const { totalItems, openDrawer }    = useCart()

  useEffect(() => {
    async function loadMenu() {
      const [{ data: cats }, { data: items }] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('menu_items').select('*').eq('is_available', true).order('sort_order'),
      ])
      setCategories(cats ?? [])
      setMenuItems(items ?? [])
      setLoading(false)
    }
    loadMenu()
  }, [])

  function handlePaymentSuccess(order) {
    setPaidOrder(order)
  }

  function handleDismissSuccess() {
    setPaidOrder(null)
  }

  return (
    <>
      <Head>
        <title>UGs Kitchen — Order Now</title>
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
              {/* Logo */}
              <div className="w-9 h-9 bg-brand-orange rounded-xl flex items-center justify-center">
                <span className="text-white font-extrabold text-lg leading-none">U</span>
              </div>
              <div>
                <p className="font-extrabold text-brand-dark text-base leading-tight">UGs Kitchen</p>
                <p className="text-[10px] text-gray-400 leading-tight">Homemade Ghanaian Food</p>
              </div>
            </div>

            {totalItems > 0 && (
              <button
                onClick={openDrawer}
                className="relative flex items-center gap-1.5 bg-brand-dark text-white px-3 py-2 rounded-xl font-bold text-sm"
              >
                <ShoppingBag size={16} />
                <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
              </button>
            )}
          </div>
        </header>

        {/* Hero banner */}
        <div className="max-w-lg mx-auto px-4 pt-4 pb-2">
          <div className="bg-gradient-to-r from-brand-orange to-orange-400 rounded-2xl px-5 py-4 text-white">
            <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-0.5">Order Now</p>
            <h1 className="text-2xl font-extrabold leading-tight">
              Freshly Cooked,<br />Fast Delivered
            </h1>
            <p className="text-sm opacity-90 mt-1">
              Pick your food, pay with MoMo, done in 3 taps.
            </p>
          </div>
        </div>

        {/* Menu */}
        <main className="max-w-lg mx-auto">
          <MenuGrid menuItems={menuItems} categories={categories} loading={loading} />
        </main>
      </div>

      {/* Checkout drawer */}
      <OrderDrawer onPaymentSuccess={handlePaymentSuccess} />

      {/* Success overlay */}
      {paidOrder && (
        <PayStatus order={paidOrder} onDismiss={handleDismissSuccess} />
      )}
    </>
  )
}
