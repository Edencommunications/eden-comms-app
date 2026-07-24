// broadcastScheduler.ts
// Runs every 60 s. Finds broadcast_messages where status='scheduled'
// and scheduled_for <= now(), then flips them to status='sent'.

import { logger } from './logger'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const H = {
  'apikey':        SUPABASE_ANON,
  'Authorization': `Bearer ${SUPABASE_ANON}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=minimal',
}

async function processDue() {
  try {
    const now = new Date().toISOString()

    // Fetch IDs of due scheduled broadcasts
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/broadcast_messages?status=eq.scheduled&scheduled_for=lte.${encodeURIComponent(now)}&select=id`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
    )
    if (!res.ok) return

    const rows: { id: string }[] = await res.json()
    if (!rows?.length) return

    // Mark each one as sent
    for (const row of rows) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/broadcast_messages?id=eq.${row.id}`,
        { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'sent', sent_at: now }) }
      )
    }

    logger.info({ count: rows.length }, '[BroadcastScheduler] processed scheduled broadcasts')
  } catch (err) {
    logger.warn({ err }, '[BroadcastScheduler] check failed — table may not exist yet')
  }
}

export function startBroadcastScheduler() {
  processDue()                          // run once immediately on startup
  setInterval(processDue, 60_000)       // then every 60 seconds
}
