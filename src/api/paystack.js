// Client-side utility — safe helpers only (no secret key here)

export const PAYSTACK_CHANNELS = {
  MTN:       'mobile_money',
  VODAFONE:  'mobile_money',
  AIRTELTIGO: 'mobile_money',
}

// Detect network from phone prefix
export function detectNetwork(phone) {
  const prefix = phone.replace(/\s/g, '').slice(0, 3)
  const mtn        = ['024','054','055','059','025']
  const vodafone   = ['020','050']
  const airteltigo = ['027','057','026','056','023','028']

  if (mtn.includes(prefix))        return 'mtn'
  if (vodafone.includes(prefix))   return 'vod'
  if (airteltigo.includes(prefix)) return 'tgo'
  return 'mtn' // default
}

// Convert GHS to Paystack pesewas (1 GHS = 100 pesewas)
export function toPaystackAmount(ghsAmount) {
  return Math.round(parseFloat(ghsAmount) * 100)
}
