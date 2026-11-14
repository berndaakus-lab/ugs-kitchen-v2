import { sendPendingAlerts, sendDailySummary } from '@/lib/alerts'

// GET — run by Vercel Cron once a day (pos/vercel.json, 20:00 GMT = Ghana time):
// sends alerts not sent yet (e.g. from online orders) and the evening
// low-stock summary. Vercel sends "Authorization: Bearer <CRON_SECRET>".
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ message: 'Unauthorized' })
  const alerts = await sendPendingAlerts()
  const summary = await sendDailySummary()
  return res.status(200).json({ alerts, ...summary })
}
