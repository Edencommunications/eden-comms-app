// ContentSchedulerAdmin — Eden-only social content scheduler (Phase 1: IG + FB).
// Lives in the owner's admin settings, styled like the Meta Ads / GHL cards.
// Upload media + caption, pick platforms + time → the api-server posts it,
// pulls analytics 24h later, and drops a weekly recap into a chosen community.
import { useState, useEffect } from 'react'
import { sbBearer } from '../lib/sbAuth'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MAX_MB = 18

export default function ContentSchedulerAdmin({ B, Card, Btn, communities }: any) {
  const [status, setStatus] = useState<any>(null)     // null loading · {connected,...}
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [token, setToken] = useState('')
  const [pages, setPages] = useState<any[]>([])       // page-picker step
  const [posts, setPosts] = useState<any[]>([])
  // new post form
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [platIG, setPlatIG] = useState(true)
  const [platFB, setPlatFB] = useState(true)
  const [when, setWhen] = useState('')

  const jhdr = { 'Content-Type': 'application/json', Authorization: sbBearer() }
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(x => x === m ? '' : x), 6000) }

  const load = async () => {
    try {
      const r = await fetch('/api/content-sched/status', { headers: { Authorization: sbBearer() } })
      const d = await r.json().catch(() => null)
      setStatus(r.ok ? d : { connected: false })
      if (r.ok && d?.connected) {
        const pr = await fetch('/api/content-sched/posts', { headers: { Authorization: sbBearer() } })
        const pd = await pr.json().catch(() => null)
        if (pr.ok) setPosts(pd?.posts || [])
      }
    } catch { setStatus({ connected: false }) }
  }
  useEffect(() => { load() }, [])

  const connect = async (pageId?: string) => {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/content-sched/connect', {
        method: 'POST', headers: jhdr,
        body: JSON.stringify(pageId ? { token, page_id: pageId } : { token }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) flash(`⚠️ ${d?.error || 'Could not connect'}`)
      else if (d?.pages) {
        if (!d.pages.length) flash('⚠️ That token has no Facebook Pages on it')
        else setPages(d.pages)
      } else {
        flash(`✅ Connected to ${d?.page_name}${d?.ig_username ? ` + @${d.ig_username}` : ''}`)
        setToken(''); setPages([]); load()
      }
    } catch { flash('⚠️ Could not connect') }
    setBusy(false)
  }

  const saveSettings = async (patch: any) => {
    setBusy(true)
    try {
      const r = await fetch('/api/content-sched/settings', { method: 'POST', headers: jhdr, body: JSON.stringify(patch) })
      const d = await r.json().catch(() => null)
      if (r.ok) { flash('✅ Saved'); load() } else flash(`⚠️ ${d?.error || 'Could not save'}`)
    } catch { flash('⚠️ Could not save') }
    setBusy(false)
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect? Scheduled posts will stop publishing.')) return
    await fetch('/api/content-sched/disconnect', { method: 'POST', headers: { Authorization: sbBearer() } })
    setMsg(''); load()
  }

  const schedule = async () => {
    if (!file) return flash('⚠️ Pick a photo or video first')
    if (file.size > MAX_MB * 1024 * 1024) return flash(`⚠️ File too big — ${MAX_MB} MB max for now`)
    if (!platIG && !platFB) return flash('⚠️ Pick at least one platform')
    if (!when) return flash('⚠️ Pick a date & time')
    const isVideo = /^video\//.test(file.type)
    if (!isVideo && !/^image\//.test(file.type)) return flash('⚠️ Only photos and videos are supported')
    setBusy(true); setMsg('Uploading…')
    try {
      const b64: string = await new Promise((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result).split(',')[1] || '')
        fr.onerror = rej
        fr.readAsDataURL(file)
      })
      const ur = await fetch('/api/content-sched/upload', {
        method: 'POST', headers: jhdr,
        body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64: b64 }),
      })
      const ud = await ur.json().catch(() => null)
      if (!ur.ok) { flash(`⚠️ ${ud?.error || 'Upload failed'}`); setBusy(false); return }
      const platforms = [...(platIG ? ['ig'] : []), ...(platFB ? ['fb'] : [])]
      const pr = await fetch('/api/content-sched/posts', {
        method: 'POST', headers: jhdr,
        body: JSON.stringify({
          media_url: ud.url, media_type: isVideo ? 'video' : 'image', caption,
          platforms, scheduled_at: new Date(when).toISOString(),
        }),
      })
      const pd = await pr.json().catch(() => null)
      if (pr.ok) { flash('✅ Scheduled!'); setFile(null); setCaption(''); setWhen(''); load() }
      else flash(`⚠️ ${pd?.error || 'Could not schedule'}`)
    } catch { flash('⚠️ Could not schedule') }
    setBusy(false)
  }

  const cancelPost = async (id: string) => {
    if (!window.confirm('Cancel this scheduled post?')) return
    const r = await fetch(`/api/content-sched/posts/${id}/cancel`, { method: 'POST', headers: { Authorization: sbBearer() } })
    if (!r.ok) flash('⚠️ Could not cancel')
    load()
  }
  const deletePost = async (id: string) => {
    if (!window.confirm('Remove this post from the list? (Does not delete it from IG/FB.)')) return
    await fetch(`/api/content-sched/posts/${id}`, { method: 'DELETE', headers: { Authorization: sbBearer() } })
    load()
  }

  const n = (v: any) => (typeof v === 'number' ? v.toLocaleString() : '—')
  const statusColor: any = { scheduled: '#6FB8E8', publishing: '#ffa600', published: '#4FD89A', failed: '#ff6a6a', canceled: B.muted }

  return (
    <Card style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: B.gold, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 4px' }}>📱 Content Scheduler (IG + FB)</p>
      {status === null ? (
        <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>Checking connection…</p>
      ) : !status.connected ? (
        <>
          <p style={{ fontSize: 12, color: B.muted, margin: '0 0 10px', lineHeight: 1.6 }}>
            Auto-post your content to Instagram + Facebook on a schedule, get each post's numbers 24h later, and a weekly recap in a community — like your ads recaps.
            <br />1. Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{ color: B.gold }}>Meta's Graph API Explorer</a> (same app you used for Ads Recaps)
            <br />2. Add permissions: <strong>pages_show_list, pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish, instagram_manage_insights, business_management</strong>
            <br />3. Generate the token, extend it to long-lived, and paste it here:
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your Meta access token"
              style={{ flex: 1, minWidth: 200, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '9px 12px', color: B.text, fontSize: 12, outline: 'none' }} />
            <Btn onClick={() => connect()} disabled={busy || !token.trim()}>{busy ? 'Checking…' : 'Connect'}</Btn>
          </div>
          {pages.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12, color: B.text, margin: '0 0 6px' }}>Which Facebook Page (with its Instagram) should posts go to?</p>
              {pages.map((p: any) => (
                <button key={p.page_id} onClick={() => connect(p.page_id)} disabled={busy || !p.ig_user_id}
                  style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '8px 12px', color: p.ig_user_id ? B.text : B.muted, fontSize: 12, cursor: p.ig_user_id ? 'pointer' : 'not-allowed' }}>
                  <strong>{p.page_name}</strong>{p.ig_username ? ` — @${p.ig_username}` : ' — ⚠️ no Instagram linked'}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: 12, color: '#4FD89A', margin: '0 0 10px' }}>
            ✅ Posting to <strong>{status.page_name}</strong>{status.ig_username ? <> + IG <strong>@{status.ig_username}</strong></> : null}.
          </p>

          {/* Weekly recap settings */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: B.muted }}>Weekly recap →</span>
            <select value={status.community_id || ''} disabled={busy} onChange={e => saveSettings({ community_id: e.target.value || null })}
              style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '7px 10px', color: status.community_id ? B.gold : B.text, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              <option value="">— pick a community —</option>
              {communities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={status.weekly_day ?? 1} disabled={busy} onChange={e => saveSettings({ weekly_day: Number(e.target.value) })}
              style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '7px 10px', color: B.text, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}s</option>)}
            </select>
            <select value={status.hour_local ?? 8} disabled={busy} onChange={e => saveSettings({ hour_local: Number(e.target.value) })}
              style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '7px 10px', color: B.text, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</option>)}
            </select>
          </div>

          {/* Schedule a post */}
          <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: B.text, margin: '0 0 8px' }}>Schedule a post</p>
            <input type="file" accept="image/*,video/mp4,video/quicktime" onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ fontSize: 12, color: B.muted, marginBottom: 8, display: 'block' }} />
            {file && <p style={{ fontSize: 11, color: B.muted, margin: '0 0 8px' }}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB · {/^video\//.test(file.type) ? 'video (posts as a Reel on IG)' : 'photo'}</p>}
            <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption (hashtags welcome)…" rows={3}
              style={{ width: '100%', boxSizing: 'border-box', background: B.bg || '#111', border: `1px solid ${B.border}`, borderRadius: 8, padding: '8px 10px', color: B.text, fontSize: 12, outline: 'none', resize: 'vertical', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: platIG ? '#E1306C' : B.muted, fontWeight: 700 }}>
                <input type="checkbox" checked={platIG} onChange={e => setPlatIG(e.target.checked)} /> Instagram
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: platFB ? '#4A90D9' : B.muted, fontWeight: 700 }}>
                <input type="checkbox" checked={platFB} onChange={e => setPlatFB(e.target.checked)} /> Facebook
              </label>
              <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
                style={{ background: B.bg || '#111', border: `1px solid ${B.border}`, borderRadius: 8, padding: '7px 10px', color: B.text, fontSize: 12, outline: 'none' }} />
              <Btn onClick={schedule} disabled={busy}>{busy ? 'Working…' : 'Schedule'}</Btn>
            </div>
          </div>

          {/* Posts list */}
          {posts.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {posts.map((p: any) => (
                <div key={p.id} style={{ borderBottom: `1px solid ${B.border}`, padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: B.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.media_type === 'video' ? '🎬' : '🖼'} {(p.caption || '(no caption)').slice(0, 50)}
                      <span style={{ color: B.muted }}> · {p.platforms?.map((x: string) => x.toUpperCase()).join('+')} · {new Date(p.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[p.status] || B.muted }}>{p.status}</span>
                      {(p.status === 'scheduled' || p.status === 'failed') && (
                        <button onClick={() => cancelPost(p.id)} style={{ background: 'none', border: 'none', color: B.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>cancel</button>
                      )}
                      {(p.status === 'canceled' || p.status === 'failed') && (
                        <button onClick={() => deletePost(p.id)} style={{ background: 'none', border: 'none', color: B.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>remove</button>
                      )}
                    </div>
                  </div>
                  {p.error && <p style={{ fontSize: 11, color: '#ff6a6a', margin: '4px 0 0' }}>⚠️ {p.error}</p>}
                  {p.stats?.ig && (
                    <p style={{ fontSize: 11, color: B.muted, margin: '4px 0 0' }}>
                      IG: {n(p.stats.ig.views)} views · {n(p.stats.ig.reach)} reach · {n(p.stats.ig.likes)} likes · {n(p.stats.ig.comments)} comments · {n(p.stats.ig.shares)} shares · {n(p.stats.ig.saved)} saves
                      {typeof p.stats.ig.avg_watch_sec === 'number' ? ` · avg watch ${p.stats.ig.avg_watch_sec}s` : ''}
                    </p>
                  )}
                  {p.stats?.fb && (
                    <p style={{ fontSize: 11, color: B.muted, margin: '2px 0 0' }}>
                      FB: {n(p.stats.fb.views ?? p.stats.fb.impressions)} {p.stats.fb.views != null ? 'views' : 'impressions'} · {n(p.stats.fb.likes)} likes · {n(p.stats.fb.comments)} comments
                    </p>
                  )}
                  {p.status === 'published' && !p.stats && <p style={{ fontSize: 11, color: B.muted, margin: '4px 0 0' }}>Numbers arrive ~24h after posting.</p>}
                </div>
              ))}
            </div>
          )}

          <Btn variant="secondary" onClick={disconnect}>Disconnect</Btn>
        </>
      )}
      {msg && <p style={{ fontSize: 12, color: msg.startsWith('✅') ? '#4FD89A' : '#ffa600', margin: '10px 0 0' }}>{msg}</p>}
    </Card>
  )
}
