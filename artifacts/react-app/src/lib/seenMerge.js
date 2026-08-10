// seenMerge.js — merge the server's /team/seen map (numeric ms stamps under
// namespaced keys like `comm:<communityId>` or `dba:<dbaId>:<communityId>`)
// into a local last-seen cache ({ communityId: ISO string }). Per-key max:
// a stale device can never roll a newer device's read state backwards.
export function mergeRemoteSeen(localMap, remoteSeen, prefix) {
  const map = { ...(localMap || {}) }
  let changed = false
  if (remoteSeen && typeof remoteSeen === 'object') {
    for (const [k, v] of Object.entries(remoteSeen)) {
      if (!k.startsWith(prefix)) continue
      const cid = k.slice(prefix.length)
      if (!cid) continue
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) continue
      const cur = map[cid] ? Date.parse(map[cid]) || 0 : 0
      if (n > cur) { map[cid] = new Date(n).toISOString(); changed = true }
    }
  }
  return { map, changed }
}

// True when a message created at `createdAtIso` is already covered by the
// seen map (i.e. it should NOT count as unread).
export function isSeen(seenMap, communityId, createdAtIso) {
  const since = (seenMap || {})[communityId]
  if (!since) return false
  const s = Date.parse(since)
  const c = Date.parse(createdAtIso)
  return Number.isFinite(s) && Number.isFinite(c) && c <= s
}
