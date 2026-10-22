// Notify POS screens of a branch that something changed. Payload is kept minimal
// (ids/ticket numbers only); screens re-fetch details through the API.
// Uses Supabase Realtime's HTTP broadcast endpoint so serverless routes don't
// need to hold a websocket open.

export function branchChannel(branchId) {
  return `pos-${branchId}`
}

export async function broadcast(branchId, event, payload = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: branchChannel(branchId), event, payload }] }),
    })
  } catch (err) {
    // Screens also poll, so a missed broadcast only delays the update.
    console.warn('[pos broadcast]', err.message)
  }
}
