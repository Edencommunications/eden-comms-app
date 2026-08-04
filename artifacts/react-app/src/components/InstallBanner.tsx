// InstallBanner.tsx
// Shows a persistent "Add to Home Screen" prompt on mobile until the app
// is detected as installed (running in standalone / fullscreen mode).
//
// Android/Chrome — uses the native beforeinstallprompt event so a single
//                  tap triggers the OS install sheet.
// iOS/Safari     — shows step-by-step instructions since iOS doesn't fire
//                  beforeinstallprompt.
//
// The banner hides permanently only when the app is detected as installed
// (window.matchMedia standalone OR navigator.standalone). Tapping "Later"
// collapses it to a small pill for the current session only — it comes
// back next visit so the reminder stays until they actually install.

import { useEffect, useState, useRef } from 'react'

const GOLD    = '#ffa600'
const BLACK   = '#000'
const SURFACE = '#111'
const WHITE   = '#fff'
const MUTED   = '#888'
const BORDER  = '#2a2a2a'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    !!(navigator as any).standalone === true
  )
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/crios|fxios/i.test(navigator.userAgent)          // exclude Chrome/Firefox on iOS
}

function isMobile(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
}

const INSTALLED_KEY = 'eden-pwa-installed'

function markInstalled() {
  try { localStorage.setItem(INSTALLED_KEY, '1') } catch {}
}
function wasInstalled() {
  try { return localStorage.getItem(INSTALLED_KEY) === '1' } catch { return false }
}

export default function InstallBanner() {
  const [visible,   setVisible]   = useState(false)   // show full banner
  const [collapsed, setCollapsed] = useState(false)   // show mini pill
  const [ios,       setIos]       = useState(false)
  const [androidSteps, setAndroidSteps] = useState(false)  // manual fallback when Chrome gives us no prompt
  const deferredRef = useRef<any>(null)

  useEffect(() => {
    // Never show if already installed (standalone mode OR user previously confirmed)
    if (isStandalone() || wasInstalled() || !isMobile()) return

    setIos(isIOS())
    setVisible(true)

    // Chrome usually fires beforeinstallprompt BEFORE this component mounts —
    // main.tsx catches it early and stashes it here.
    if ((window as any).__edenInstallPrompt) {
      deferredRef.current = (window as any).__edenInstallPrompt
    }

    // Android — also capture the browser's install prompt if it fires later
    const onPrompt = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // Hide permanently if the user installs via the browser's own UI
    const onInstalled = () => {
      markInstalled()
      setVisible(false)
      setCollapsed(false)
    }
    window.addEventListener('appinstalled', onInstalled)

    // Also watch for standalone mode kicking in (e.g. after install on Android)
    const mq = window.matchMedia('(display-mode: standalone)')
    const onMqChange = (e: MediaQueryListEvent) => {
      if (e.matches) { setVisible(false); setCollapsed(false) }
    }
    mq.addEventListener('change', onMqChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      mq.removeEventListener('change', onMqChange)
    }
  }, [])

  async function handleInstall() {
    const prompt = deferredRef.current || (window as any).__edenInstallPrompt
    if (prompt) {
      try {
        prompt.prompt()
        const { outcome } = await prompt.userChoice
        if (outcome === 'accepted') {
          markInstalled()
          setVisible(false)
          setCollapsed(false)
        }
      } catch {
        // Prompt was already used or rejected by the browser — fall back to steps
        setAndroidSteps(true)
      }
      deferredRef.current = null
      ;(window as any).__edenInstallPrompt = null
    } else {
      // No native prompt available (non-Chrome browser, already prompted this
      // session, etc.) — never fail silently: show manual instructions instead.
      setAndroidSteps(true)
    }
  }

  // Nothing to show — already installed or desktop
  if (!visible && !collapsed) return null

  // ── Mini pill (session-collapsed state) ──────────────────
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: GOLD, border: 'none', borderRadius: 24,
          padding: '8px 20px', color: BLACK, fontSize: 12, fontWeight: 800,
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,166,0,.45)',
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
        aria-label="Show install prompt"
      >
        📲 Add to Home Screen
      </button>
    )
  }

  // ── Full banner ───────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: SURFACE, borderTop: `2px solid ${GOLD}`,
      boxShadow: '0 -4px 32px rgba(255,166,0,.25)',
    }}>
      {/* Gold accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg,${GOLD},#ffcc55,${GOLD})` }}/>

      <div style={{ padding: '16px 18px 20px' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>📲</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: WHITE, letterSpacing: .2 }}>
                Add Eden to Your Home Screen
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                One tap access — works like a native app
              </div>
            </div>
          </div>
          {/* Collapse to pill — comes back next session */}
          <button
            onClick={() => { setVisible(false); setCollapsed(true) }}
            style={{ background: 'none', border: 'none', color: MUTED, fontSize: 22,
              cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
            aria-label="Remind me later"
          >×</button>
        </div>

        {ios ? (
          // ── iOS instructions ─────────────────────────────
          <>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
              Safari doesn't show an install button — use these two steps:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                { n: 1, icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
                { n: 2, icon: '➕', text: 'Scroll down and tap "Add to Home Screen"' },
                { n: 3, icon: '✅', text: 'Tap "Add" — Eden will appear on your home screen' },
              ].map(s => (
                <div key={s.n} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: '#1a1a1a', border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: '10px 12px',
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, background: GOLD, color: BLACK,
                    borderRadius: '50%', width: 18, height: 18, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                  }}>{s.n}</span>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>
                    <span style={{ marginRight: 6 }}>{s.icon}</span>
                    <span style={{ color: WHITE }}>{s.text}</span>
                  </span>
                </div>
              ))}
            </div>
            {/* Dismiss once-installed — user taps after doing it */}
            <button
              onClick={() => { markInstalled(); setVisible(false); setCollapsed(false) }}
              style={{
                width: '100%', background: `${GOLD}22`, border: `1px solid ${GOLD}55`,
                borderRadius: 10, padding: '11px', color: GOLD, fontSize: 13,
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              ✅ Done — I added it to my home screen
            </button>
          </>
        ) : androidSteps ? (
          // ── Android manual instructions (fallback when the one-tap prompt isn't available) ──
          <>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
              Add Eden from your browser's menu — takes two taps:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                { n: 1, icon: '⋮', text: 'Tap the menu button (three dots) in the top-right of your browser' },
                { n: 2, icon: '📲', text: 'Tap "Add to Home screen" or "Install app"' },
                { n: 3, icon: '✅', text: 'Confirm — Eden will appear on your home screen' },
              ].map(s => (
                <div key={s.n} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: '#1a1a1a', border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: '10px 12px',
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, background: GOLD, color: BLACK,
                    borderRadius: '50%', width: 18, height: 18, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                  }}>{s.n}</span>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>
                    <span style={{ marginRight: 6 }}>{s.icon}</span>
                    <span style={{ color: WHITE }}>{s.text}</span>
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { markInstalled(); setVisible(false); setCollapsed(false) }}
              style={{
                width: '100%', background: `${GOLD}22`, border: `1px solid ${GOLD}55`,
                borderRadius: 10, padding: '11px', color: GOLD, fontSize: 13,
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              ✅ Done — I added it to my home screen
            </button>
          </>
        ) : (
          // ── Android / Chrome one-tap install ─────────────
          <>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
              Install Eden as an app — no App Store needed. Loads instantly, works offline.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleInstall}
                style={{
                  flex: 1, background: GOLD, border: 'none', borderRadius: 10,
                  padding: '13px', fontWeight: 800, color: BLACK, fontSize: 14,
                  cursor: 'pointer', boxShadow: `0 2px 16px ${GOLD}55`,
                }}
              >
                📲 Add to Home Screen
              </button>
              <button
                onClick={() => { setVisible(false); setCollapsed(true) }}
                style={{
                  background: '#1a1a1a', border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: '13px 16px', color: MUTED,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                Later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
