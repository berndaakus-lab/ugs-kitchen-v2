// POST /api/submit-otp
// Submits the OTP the customer received via SMS to Paystack to complete MoMo payment.

import axios from 'axios'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { otp, reference } = req.body ?? {}
  if (!otp || !reference) return res.status(400).json({ message: 'Missing otp or reference' })

  try {
    const { data } = await axios.post(
      'https://api.paystack.co/charge/submit_otp',
      { otp, reference },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    return res.status(200).json({ status: data?.data?.status ?? 'unknown' })
  } catch (err) {
    const msg = err.response?.data?.message || err.message || 'OTP submission failed.'
    console.error('[submit-otp]', msg)
    return res.status(500).json({ message: msg })
  }
}
