import { withAuth } from '@/lib/session'
import { storeFor, storeSummary, storesFor } from '@/lib/store'

// GET ?location= — the warehouse or a kitchen: stock, incoming deliveries,
// where it can send to, recent sends. Plus the places this person can open.
export default withAuth(async (req, res) => {
  const stores = await storesFor(req.user)
  const { loc, error } = await storeFor(req)
  if (error) return res.status(200).json({ stores, error })
  return res.status(200).json({ stores, ...(await storeSummary(loc, req.user)) })
}, { perms: ['stock_send', 'stock_receive', 'stock_count', 'production', 'purchases', 'activity'], store: true })
