import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. Messaging will not work until these are added.')
}

export const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '')

// ── Admin audit helper ────────────────────────────────────────────────────────
export async function logAdminAction(
  adminId: string,
  action: string,
  details: Record<string, unknown> | null,
  tableName: string,
  recordId: string
) {
  const { error } = await supabase.from('admin_audit_log').insert({
    admin_id:   adminId,
    action,
    details,
    table_name: tableName,
    record_id:  recordId,
  })
  if (error) console.error('[logAdminAction]', error)
}
