// ─── SHARED CHECK-IN DATE KEY ────────────────────────────────────────────────
// coach_responses rows are keyed on (client_id, checkin_date), where
// checkin_date is a formatted date string derived from the check-in's
// submitted_at timestamp. BOTH surfaces that read/write coach feedback —
// the Clients tab (DietBuilder) and the Home-page client popup
// (ClientDetailModal in App.tsx) — must derive this key identically, or
// feedback saved in one place stops appearing in the other.
//
// Never change this format without migrating existing coach_responses rows.
export const checkinDateKey = (submittedAt: string | number | Date): string =>
  new Date(submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
