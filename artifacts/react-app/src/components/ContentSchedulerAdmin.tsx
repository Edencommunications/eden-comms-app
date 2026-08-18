// ContentSchedulerAdmin — Eden-only social content scheduler (Phase 1: IG + FB).
// Lives in the owner's admin settings, styled like the Meta Ads / GHL cards.
// Build a batch of posts (reels w/ cover photos, single photos, carousels),
// each with caption + time, then schedule them all at once. The api-server
// posts them, pulls analytics 24h later, and drops a weekly recap into a
// chosen community.
import { useState, useEffect, useRef } from 'react'
import { sbBearer } from '../lib/sbAuth'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MAX_IMG_MB = 25       // photos
const MAX_VID_MB = 512      // videos go straight to storage now — no more 18 MB cap

type Draft = {
  key: string            // stable — doubles as the server idempotency key
  type: 'image' | 'video' | 'carousel'
  files: File[]          // 1 photo, 1 video, or 2-10 carousel photos
  cover: File | null     // optional reel cover photo
  caption: string
  platIG: boolean
  platFB: boolean
  platTT: boolean        // TikTok (videos, photos & carousels)
  platYT: boolean        // YouTube Shorts (videos only)
  when: string           // datetime-local
  uploaded?: string[]    // cached upload URLs so a retry doesn't re-upload
  uploadedCover?: string
}

// Connect card for an OAuth platform (TikTok / YouTube): save the developer
// app's credentials once, then a one-click browser handshake links the account.
function PlatformCard({ platform, label, connected, who, appSaved, appFromEnv, B, Btn, inp, jhdr, flash, reload, help }: any) {
  const [open, setOpen] = useState(false)
  const [cid, setCid] = useState('')
  const [csec, setCsec] = useState('')
  const [redirect, setRedirect] = useState('')
  const [mediaPrefix, setMediaPrefix] = useState('')
  const [vName, setVName] = useState('')
  const [vContent, setVContent] = useState('')
  const [busy, setBusy] = useState(false)

  const start = async (save: boolean) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/content-sched/oauth/${platform}/app`, {
        method: 'POST', headers: jhdr,
        body: JSON.stringify(save
          ? { client_id: cid.trim(), client_secret: csec.trim(), verify_name: vName.trim(), verify_content: vContent.trim() }
          : { verify_name: vName.trim(), verify_content: vContent.trim() }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) flash(`⚠️ ${d?.error || 'Could not save'}`)
      else {
        setRedirect(d.redirect_uri)
        if (d.media_prefix) setMediaPrefix(d.media_prefix)
        if (save) { flash('✅ App saved — register the redirect URL, then click Connect'); setCsec('') }
        else if (d.authorize_url) window.open(d.authorize_url, '_blank', 'noopener')
      }
    } catch { flash('⚠️ Could not reach the server') }
    setBusy(false)
  }
  const disconnect = async () => {
    if (!window.confirm(`Disconnect ${label}? Scheduled ${label} posts will fail.`)) return
    await fetch(`/api/content-sched/oauth/${platform}/disconnect`, { method: 'POST', headers: jhdr })
    reload()
  }

  return (
    <div style={{ flex: 1, minWidth: 260, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: B.text }}>
          {platform === 'tiktok' ? '🎵' : '▶️'} {label}
          {connected ? <span style={{ color: '#4FD89A', fontWeight: 400 }}> — connected ({who})</span>
            : <span style={{ color: B.muted, fontWeight: 400 }}> — not connected</span>}
        </span>
        <span style={{ display: 'flex', gap: 10 }}>
          {(!connected || platform === 'tiktok') && (
            <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: B.gold, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
              {open ? 'hide setup' : connected ? 'photo post setup' : 'set up'}
            </button>
          )}
          {connected && <button onClick={disconnect} style={{ background: 'none', border: 'none', color: B.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>disconnect</button>}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {!connected && <>
          {appFromEnv
            ? <p style={{ fontSize: 11, color: B.muted, margin: '0 0 8px', lineHeight: 1.6 }}>
                ✅ App credentials are pre-configured via server environment variables — no need to paste them here. Click <strong>Connect {label}</strong> below to link your account.
              </p>
            : <>
              <p style={{ fontSize: 11, color: B.muted, margin: '0 0 8px', lineHeight: 1.6 }}>{help}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <input value={cid} onChange={e => setCid(e.target.value)} placeholder={platform === 'tiktok' ? 'Client key' : 'Client ID'} style={{ ...inp, flex: 1, minWidth: 140 }} />
                <input type="password" value={csec} onChange={e => setCsec(e.target.value)} placeholder="Client secret" style={{ ...inp, flex: 1, minWidth: 140 }} />
                <Btn onClick={() => start(true)} disabled={busy || !cid.trim() || !csec.trim()}>Save app</Btn>
              </div>
            </>
          }
          {redirect && (
            <p style={{ fontSize: 11, color: B.text, margin: '0 0 8px', wordBreak: 'break-all' }}>
              Register this redirect URL in the app's settings:<br /><code style={{ color: B.gold }}>{redirect}</code>
            </p>
          )}
          </>}
          {platform === 'tiktok' && (
            <div style={{ margin: '0 0 8px' }}>
              <p style={{ fontSize: 11, color: B.muted, margin: '0 0 6px', lineHeight: 1.6 }}>
                <strong>For photo & carousel posts:</strong> TikTok fetches images from your app's address, so it must be verified. In the TikTok app go to <strong>URL properties → Add property → URL prefix</strong>{mediaPrefix ? <>, enter <code style={{ color: B.gold, wordBreak: 'break-all' }}>{mediaPrefix}</code></> : ' (save the app first to see the exact address)'}, pick <strong>file verification</strong>, and paste the file name and contents TikTok gives you here:
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input value={vName} onChange={e => setVName(e.target.value)} placeholder="Verification file name (tiktok….txt)" style={{ ...inp, flex: 1, minWidth: 160 }} />
                <input value={vContent} onChange={e => setVContent(e.target.value)} placeholder="File contents" style={{ ...inp, flex: 1, minWidth: 160 }} />
                <Btn onClick={() => start(true)} disabled={busy || !vName.trim() || !vContent.trim()}>Save file</Btn>
              </div>
            </div>
          )}
          {!connected && (appSaved || redirect) && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn onClick={() => start(false)} disabled={busy}>🔗 Connect {label}</Btn>
              <button onClick={reload} style={{ background: 'none', border: 'none', color: B.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>I finished connecting — refresh</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ContentSchedulerAdmin({ B, Card, Btn, communities }: any) {
  const [status, setStatus] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [token, setToken] = useState('')
  const [pages, setPages] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [progress, setProgress] = useState('')     // "Scheduling 3 of 14…"
  const fileRef = useRef<HTMLInputElement>(null)

  const jhdr = { 'Content-Type': 'application/json', Authorization: sbBearer() }
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(x => x === m ? '' : x), 7000) }

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

  // ── Batch builder ────────────────────────────────────────────
  const addFiles = (list: FileList | null) => {
    if (busy) return
    const files = Array.from(list || [])
    if (!files.length) return
    const videos = files.filter(f => /^video\//.test(f.type))
    const images = files.filter(f => /^image\//.test(f.type))
    if (videos.length + images.length !== files.length) return flash('⚠️ Only photos and videos are supported')
    const tooBig = files.find(f => f.size > (/^video\//.test(f.type) ? MAX_VID_MB : MAX_IMG_MB) * 1024 * 1024)
    if (tooBig) return flash(`⚠️ ${tooBig.name} is over ${/^video\//.test(tooBig.type) ? MAX_VID_MB : MAX_IMG_MB} MB`)

    const mk = (type: Draft['type'], fs: File[]): Draft => ({
      key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      type, files: fs, cover: null, caption: '', platIG: !!status?.connected, platFB: !!status?.connected,
      platTT: !!status?.tt_connected,
      platYT: type === 'video' && !!status?.yt_connected,
      when: '',
    })
    const next: Draft[] = []
    if (videos.length && images.length) {
      // Mixed selection: each video becomes its own reel; images become one post
      videos.forEach(v => next.push(mk('video', [v])))
      next.push(images.length > 1 ? mk('carousel', images.slice(0, 10)) : mk('image', images))
    } else if (videos.length) {
      videos.forEach(v => next.push(mk('video', [v])))          // one reel per video
    } else if (images.length > 1) {
      next.push(mk('carousel', images.slice(0, 10)))            // carousel
      if (images.length > 10) flash('⚠️ Carousels max out at 10 photos — extras were dropped')
    } else {
      next.push(mk('image', images))                            // single photo
    }
    setDrafts(d => [...d, ...next])
    if (fileRef.current) fileRef.current.value = ''
  }

  // Queue is frozen while a batch is running — edits mid-run would be lost
  // or could schedule something the user just removed.
  const patchDraft = (key: string, patch: Partial<Draft>) => {
    if (busy) return
    setDrafts(ds => ds.map(d => d.key === key ? { ...d, ...patch, uploaded: undefined, uploadedCover: undefined } : d))
  }
  const removeDraft = (key: string) => { if (!busy) setDrafts(ds => ds.filter(d => d.key !== key)) }

  // Direct-to-storage upload: get a signed link, then PUT the raw file —
  // the server never touches the bytes, so big videos are fine.
  const upload = async (f: File): Promise<string> => {
    const r = await fetch('/api/content-sched/upload-url', {
      method: 'POST', headers: jhdr,
      body: JSON.stringify({ filename: f.name, contentType: f.type }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok) throw new Error(d?.error || `Upload of ${f.name} failed`)
    const put = await fetch(d.upload_url, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f })
    if (!put.ok) {
      const pd = await put.json().catch(() => null)
      throw new Error(pd?.message || pd?.error || `Upload of ${f.name} failed — if it's a big video, your storage plan may cap file size`)
    }
    return d.public_url
  }

  const scheduleAll = async () => {
    const missing = drafts.find(d => !d.when)
    if (missing) return flash('⚠️ Every post needs a date & time')
    const noPlat = drafts.find(d => !d.platIG && !d.platFB && !d.platTT && !d.platYT)
    if (noPlat) return flash('⚠️ Every post needs at least one platform')
    setBusy(true)
    let done = 0
    const failed: Draft[] = []
    for (const d of drafts) {
      setProgress(`Scheduling ${done + failed.length + 1} of ${drafts.length}…`)
      try {
        // Reuse cached upload URLs on retry so a failed batch doesn't re-upload.
        const urls: string[] = d.uploaded && d.uploaded.length === d.files.length ? [...d.uploaded] : []
        if (!urls.length) for (const f of d.files) urls.push(await upload(f))
        const coverUrl = d.cover ? (d.uploadedCover || await upload(d.cover)) : ''
        d.uploaded = urls; d.uploadedCover = coverUrl || undefined
        const body: any = {
          media_type: d.type, caption: d.caption, client_key: d.key,
          platforms: [
            ...(d.platIG ? ['ig'] : []), ...(d.platFB ? ['fb'] : []),
            ...(d.platTT ? ['tt'] : []),
            ...(d.platYT && d.type === 'video' ? ['yt'] : []),
          ],
          scheduled_at: new Date(d.when).toISOString(),
        }
        if (d.type === 'carousel') body.media_urls = urls
        else body.media_url = urls[0]
        if (coverUrl) body.cover_url = coverUrl
        const pr = await fetch('/api/content-sched/posts', { method: 'POST', headers: jhdr, body: JSON.stringify(body) })
        const pd = await pr.json().catch(() => null)
        if (!pr.ok) throw new Error(pd?.error || 'Could not schedule')
        done++
      } catch (e: any) {
        failed.push(d)
        flash(`⚠️ ${(d.caption || d.files[0]?.name || 'post').slice(0, 30)}: ${e?.message || 'failed'}`)
      }
    }
    setProgress('')
    // Keep only drafts that failed AND weren't removed/changed elsewhere.
    setDrafts(ds => ds.filter(d => failed.some(f => f.key === d.key)))
    if (done) flash(failed.length ? `✅ Scheduled ${done} — ${failed.length} failed (still in the batch below)` : `✅ All ${done} post${done === 1 ? '' : 's'} scheduled!`)
    setBusy(false)
    load()
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
  const anyOn = !!(status?.connected || status?.tt_connected || status?.yt_connected)
  const statusColor: any = { scheduled: '#6FB8E8', publishing: '#ffa600', published: '#4FD89A', failed: '#ff6a6a', canceled: B.muted }
  const typeLabel: any = { image: '🖼 Photo', video: '🎬 Reel', carousel: '🎠 Carousel' }
  const typeIcon = (t: string) => t === 'video' ? '🎬' : t === 'carousel' ? '🎠' : '🖼'
  const inp = { background: B.bg || '#111', border: `1px solid ${B.border}`, borderRadius: 8, padding: '7px 10px', color: B.text, fontSize: 12, outline: 'none' } as any
  const sel = { background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '7px 10px', color: B.text, fontSize: 12, outline: 'none', cursor: 'pointer' } as any

  return (
    <Card style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: B.gold, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 4px' }}>📱 Content Scheduler (IG · FB · TikTok · YouTube)</p>
      {status === null ? (
        <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>Checking connection…</p>
      ) : (
        <>
          {!status.connected && <>
          <p style={{ fontSize: 12, color: B.muted, margin: '0 0 10px', lineHeight: 1.6 }}>
            Auto-post your content to Instagram + Facebook on a schedule, get each post's numbers 24h later, and a weekly recap in a community — like your ads recaps.
            <br />1. Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{ color: B.gold }}>Meta's Graph API Explorer</a> (same app you used for Ads Recaps)
            <br />2. Add permissions: <strong>pages_show_list, pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish, instagram_manage_insights, business_management</strong>
            <br />3. Generate the token, extend it to long-lived, and paste it here:
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your Meta access token"
              style={{ ...inp, flex: 1, minWidth: 200, background: B.surface, padding: '9px 12px' }} />
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
          <div style={{ marginBottom: 14 }} />
          </>}
          {status.connected && (
          <p style={{ fontSize: 12, color: '#4FD89A', margin: '0 0 10px' }}>
            ✅ Posting to <strong>{status.page_name}</strong>{status.ig_username ? <> + IG <strong>@{status.ig_username}</strong></> : null}.
          </p>
          )}

          {/* Weekly recap settings */}
          {anyOn && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: B.muted }}>Weekly recap →</span>
            <select value={status.community_id || ''} disabled={busy} onChange={e => saveSettings({ community_id: e.target.value || null })}
              style={{ ...sel, color: status.community_id ? B.gold : B.text }}>
              <option value="">— pick a community —</option>
              {communities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={status.weekly_day ?? 1} disabled={busy} onChange={e => saveSettings({ weekly_day: Number(e.target.value) })} style={sel}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}s</option>)}
            </select>
            <select value={status.hour_local ?? 8} disabled={busy} onChange={e => saveSettings({ hour_local: Number(e.target.value) })} style={sel}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</option>)}
            </select>
          </div>
          )}

          {/* TikTok + YouTube connections */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <PlatformCard platform="tiktok" label="TikTok" connected={!!status.tt_connected} who={status.tt_username ? `@${status.tt_username}` : 'your TikTok'}
              appSaved={!!status.tt_app_saved} appFromEnv={!!status.tt_app_from_env} B={B} Btn={Btn} inp={inp} jhdr={jhdr} flash={flash} reload={load}
              help={<>Create a free app at <a href="https://developers.tiktok.com/" target="_blank" rel="noopener noreferrer" style={{ color: B.gold }}>developers.tiktok.com</a> → Manage apps → add the <strong>Content Posting API</strong> product with Direct Post, and <strong>Login Kit</strong>. Paste the app's <strong>Client key</strong> and <strong>Client secret</strong> below, register the redirect URL it gives you, then connect.<br/>⚠️ Until TikTok approves your app (their audit), posts land as <strong>private (only you)</strong> — flip them public in the TikTok app, or wait for approval.</>} />
            <PlatformCard platform="youtube" label="YouTube Shorts" connected={!!status.yt_connected} who={status.yt_channel_title || 'your channel'}
              appSaved={!!status.yt_app_saved} B={B} Btn={Btn} inp={inp} jhdr={jhdr} flash={flash} reload={load}
              help={<>In <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: B.gold }}>Google Cloud Console</a>: create a project → enable the <strong>YouTube Data API v3</strong> → OAuth consent screen (External, add yourself as a test user) → Credentials → <strong>OAuth client ID (Web application)</strong>. Paste the Client ID and secret below, add the redirect URL it gives you, then connect.<br/>⚠️ Until Google verifies the app, uploads are locked <strong>private</strong> — you can flip each one public in YouTube Studio, or complete verification.</>} />
          </div>

          {anyOn && <>
          {/* Batch builder */}
          <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: B.text, margin: '0 0 4px' }}>Build your batch</p>
            <p style={{ fontSize: 11, color: B.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
              Add as much as you want — two weeks of content at once is fine. One video = a Reel (add a cover photo on its card).
              Several photos picked together = one carousel. Then give each post its caption + date and hit <strong>Schedule all</strong>.
            </p>
            <div style={{ marginBottom: drafts.length ? 12 : 0 }}>
              <label style={{ display: 'inline-block', background: B.bg || '#111', border: `1px dashed ${B.gold}`, borderRadius: 8, padding: '10px 16px', fontSize: 12, color: B.gold, cursor: 'pointer', fontWeight: 700 }}>
                ➕ Add reels / photos / carousel
                <input ref={fileRef} type="file" multiple accept="image/*,video/mp4,video/quicktime" onChange={e => addFiles(e.target.files)} style={{ display: 'none' }} />
              </label>
            </div>

            {drafts.map((d, i) => (
              <div key={d.key} style={{ background: B.bg || '#111', border: `1px solid ${B.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: B.text }}>
                    {i + 1}. {typeLabel[d.type]}
                    <span style={{ color: B.muted, fontWeight: 400 }}> — {d.type === 'carousel' ? `${d.files.length} photos` : d.files[0]?.name} · {(d.files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB</span>
                  </span>
                  <button onClick={() => removeDraft(d.key)} style={{ background: 'none', border: 'none', color: B.muted, fontSize: 12, cursor: 'pointer' }}>✕</button>
                </div>
                {/* thumbnails */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {d.files.map((f, fi) => /^image\//.test(f.type)
                    ? <img key={fi} src={URL.createObjectURL(f)} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, border: `1px solid ${B.border}` }} />
                    : <div key={fi} style={{ width: 52, height: 52, borderRadius: 6, border: `1px solid ${B.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎬</div>)}
                  {d.cover && <div style={{ position: 'relative' }}>
                    <img src={URL.createObjectURL(d.cover)} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, border: `1px solid ${B.gold}` }} />
                    <span style={{ position: 'absolute', bottom: -2, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: B.gold, fontWeight: 700 }}>COVER</span>
                  </div>}
                </div>
                {d.type === 'video' && (
                  <label style={{ display: 'inline-block', fontSize: 11, color: d.cover ? B.muted : B.gold, cursor: 'pointer', marginBottom: 8, textDecoration: 'underline' }}>
                    {d.cover ? 'Change cover photo' : '🖼 Add the cover photo for this Reel'}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > MAX_IMG_MB * 1024 * 1024) flash(`⚠️ Cover too big (${MAX_IMG_MB} MB max)`); else patchDraft(d.key, { cover: f }) } }} />
                  </label>
                )}
                <textarea value={d.caption} onChange={e => patchDraft(d.key, { caption: e.target.value })} placeholder="Caption (hashtags welcome)…" rows={2}
                  style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8, display: 'block' }} />
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: d.platIG ? '#E1306C' : B.muted, fontWeight: 700 }}>
                    <input type="checkbox" checked={d.platIG} onChange={e => patchDraft(d.key, { platIG: e.target.checked })} disabled={!status?.connected} /> IG
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: d.platFB ? '#4A90D9' : B.muted, fontWeight: 700 }}>
                    <input type="checkbox" checked={d.platFB} onChange={e => patchDraft(d.key, { platFB: e.target.checked })} disabled={!status?.connected} /> FB
                  </label>
                  {status?.tt_connected && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: d.platTT ? '#25F4EE' : B.muted, fontWeight: 700 }}>
                      <input type="checkbox" checked={d.platTT} onChange={e => patchDraft(d.key, { platTT: e.target.checked })} /> TikTok
                    </label>
                  )}
                  {d.type === 'video' && status?.yt_connected && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: d.platYT ? '#FF4444' : B.muted, fontWeight: 700 }}>
                      <input type="checkbox" checked={d.platYT} onChange={e => patchDraft(d.key, { platYT: e.target.checked })} /> YouTube
                    </label>
                  )}
                  <input type="datetime-local" value={d.when} onChange={e => patchDraft(d.key, { when: e.target.value })} style={inp} />
                  {!d.when && <span style={{ fontSize: 11, color: '#ffa600' }}>← pick when this posts</span>}
                </div>
              </div>
            ))}

            {drafts.length > 0 && (
              <Btn onClick={scheduleAll} disabled={busy}>
                {progress || `🚀 Schedule all (${drafts.length} post${drafts.length === 1 ? '' : 's'})`}
              </Btn>
            )}
          </div>

          {/* Scheduled / published posts */}
          {posts.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: B.text, margin: '0 0 4px' }}>Your posts</p>
              {posts.map((p: any) => (
                <div key={p.id} style={{ borderBottom: `1px solid ${B.border}`, padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: B.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeIcon(p.media_type)} {(p.caption || '(no caption)').slice(0, 50)}
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
                  {p.stats?.tt && !p.stats.tt.error && (
                    <p style={{ fontSize: 11, color: B.muted, margin: '2px 0 0' }}>
                      {p.stats.tt.note ? `TikTok: ${p.stats.tt.note}` : <>TikTok: {n(p.stats.tt.views)} views · {n(p.stats.tt.likes)} likes · {n(p.stats.tt.comments)} comments · {n(p.stats.tt.shares)} shares</>}
                    </p>
                  )}
                  {p.stats?.yt && !p.stats.yt.error && (
                    <p style={{ fontSize: 11, color: B.muted, margin: '2px 0 0' }}>
                      YouTube: {n(p.stats.yt.views)} views · {n(p.stats.yt.likes)} likes · {n(p.stats.yt.comments)} comments
                    </p>
                  )}
                  {p.status === 'published' && !p.stats && <p style={{ fontSize: 11, color: B.muted, margin: '4px 0 0' }}>Numbers arrive ~24h after posting.</p>}
                </div>
              ))}
            </div>
          )}

          </>}

          {status.connected && <Btn variant="secondary" onClick={disconnect}>Disconnect Meta</Btn>}
        </>
      )}
      {msg && <p style={{ fontSize: 12, color: msg.startsWith('✅') ? '#4FD89A' : '#ffa600', margin: '10px 0 0' }}>{msg}</p>}
    </Card>
  )
}
