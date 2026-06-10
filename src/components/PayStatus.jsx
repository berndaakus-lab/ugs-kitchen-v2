import { CheckCircle2, UtensilsCrossed, MessageCircle } from 'lucide-react'

function formatGHS(amount) {
  return `GH₵ ${Number(amount).toFixed(2)}`
}

function buildWhatsAppMessage(order) {
  const orderNum = `#${String(order.id).slice(-6).toUpperCase()}`
  const itemLines = order.items
    ?.map(i => `  • ${i.quantity}× ${i.name} — GH₵${(i.price * i.quantity).toFixed(2)}`)
    .join('\n') ?? ''

  return encodeURIComponent(
    `🔔 *NEW ORDER ${orderNum}*\n\n` +
    `👤 *Customer:* ${order.customer_name}\n` +
    `📍 *Location:* ${order.delivery_location}\n` +
    `📱 *MoMo:* ${order.momo_number}\n\n` +
    `🍽️ *Items:*\n${itemLines}\n\n` +
    `💰 *Total Paid: GH₵${Number(order.total_amount).toFixed(2)}*\n\n` +
    `✅ Payment confirmed via MoMo. Please prepare order!`
  )
}

export default function PayStatus({ order, onDismiss }) {
  if (!order) return null

  function handleNotifyOwner() {
    const owner = process.env.NEXT_PUBLIC_OWNER_WHATSAPP
    if (!owner) return
    const msg = buildWhatsAppMessage(order)
    window.open(`https://wa.me/${owner}?text=${msg}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/95 px-6 animate-fade-in overflow-y-auto py-6">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 size={44} className="text-green-500" strokeWidth={2} />
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-2xl font-extrabold text-brand-dark mb-1">
          Order Confirmed! 🎉
        </h1>
        <p className="text-gray-500 text-sm mb-5">
          Payment received. We&apos;re preparing your food now.
        </p>

        {/* Order summary */}
        <div className="bg-brand-cream rounded-2xl p-4 text-left space-y-2 mb-4">
          <Row label="Name"     value={order.customer_name} />
          <Row label="Location" value={order.delivery_location} />
          <Row label="Total"    value={formatGHS(order.total_amount)} highlight />
          <Row label="Order #"  value={`#${String(order.id).slice(-6).toUpperCase()}`} />
        </div>

        {/* Items list */}
        <div className="text-left mb-4 space-y-2 bg-white border border-brand-muted rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Your Items
          </p>
          {order.items?.map((item, i) => (
            <div key={i} className="flex justify-between items-start gap-2">
              <div className="flex-1">
                <span className="text-sm font-semibold text-brand-dark">
                  {item.quantity}× {item.name}
                </span>
                {item.description && (
                  <p className="text-[11px] text-gray-400 leading-snug">{item.description}</p>
                )}
              </div>
              <span className="text-sm font-bold text-brand-dark whitespace-nowrap">
                {formatGHS(item.price * item.quantity)}
              </span>
            </div>
          ))}
        </div>

        {/* ETA notice */}
        <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-4 py-3 mb-5">
          <UtensilsCrossed size={18} className="text-brand-orange flex-shrink-0" />
          <p className="text-xs text-brand-dark font-semibold text-left">
            Estimated wait: <strong>20–35 mins</strong>. We&apos;ll call you when it&apos;s ready!
          </p>
        </div>

        {/* WhatsApp owner button (backup manual trigger) */}
        <button
          onClick={handleNotifyOwner}
          className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold rounded-2xl py-3.5 text-sm mb-3 active:opacity-80 transition-opacity"
        >
          <MessageCircle size={18} />
          Send Order to Kitchen via WhatsApp
        </button>

        <button
          onClick={onDismiss}
          className="w-full bg-brand-orange text-white font-extrabold rounded-2xl py-4 text-base active:bg-orange-700 transition-colors"
        >
          Order More Food
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <span className={`text-sm font-bold ${highlight ? 'text-brand-orange text-base' : 'text-brand-dark'}`}>
        {value}
      </span>
    </div>
  )
}
