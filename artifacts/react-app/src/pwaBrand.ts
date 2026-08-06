// pwaBrand.ts
// Rebrand the PWA install target at runtime for DBA (sub-brand) spaces.
//
// The static /manifest.json is Eden-branded with start_url "/". When a user
// is inside a DBA space we point <link rel="manifest"> at the API's real,
// same-origin per-DBA manifest (/api/dba/manifest?slug=<slug>) whose
// start_url is the DBA's link — so an Android/Chrome install saves an icon
// that reopens their space. (An inline script in index.html does the same
// swap at document-parse time for direct /<slug> visits, before Chrome
// evaluates installability.) iOS ignores the manifest, so we also update the
// apple-touch meta tags and document.title — Safari pre-fills the
// home-screen name from apple-mobile-web-app-title / title.
//
// Best-effort by design: default Eden icons stay as fallback when a DBA has
// no usable logo (iOS needs a PNG; arbitrary logo URLs may not qualify).

type PwaBrand = {
  name: string
  slug: string          // path segment the saved app should reopen
  logoUrl?: string | null
  themeColor?: string | null
}

let currentSlug: string | null = null

function base(): string {
  return (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
}

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.appendChild(el)
  }
  el.content = content
}

// Drop any captured install prompt everywhere it may be stashed — the global
// from main.tsx AND any component-held copy (InstallBanner listens for the
// event and clears its ref). A prompt is bound to the manifest at capture
// time, so it must never survive a manifest change.
function invalidatePrompt() {
  ;(window as any).__edenInstallPrompt = null
  try { window.dispatchEvent(new Event('eden-pwa-brand-changed')) } catch {}
}

function setManifestHref(href: string) {
  let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.rel = 'manifest'
    document.head.appendChild(link)
  }
  link.href = href
}

export function applyPwaBrand(brand: PwaBrand) {
  if (typeof document === 'undefined') return
  if (currentSlug === brand.slug) return // already applied
  currentSlug = brand.slug

  // Android/Chrome — real same-origin manifest served by the API. The API
  // is mounted at the site root (/api), independent of the app's Vite base;
  // the app base is only passed along so start_url/scope/icons stay inside
  // the deployed app path.
  setManifestHref(`/api/dba/manifest?slug=${encodeURIComponent(brand.slug)}&base=${encodeURIComponent(base() || '/')}`)
  // A prompt Chrome captured against a DIFFERENT manifest would install the
  // wrong app — drop it so the banner falls back to manual steps instead.
  // Only direct /<slug> document loads (index.html swapped the manifest at
  // parse time, recorded in __edenManifestSlug) keep the native prompt.
  if ((window as any).__edenManifestSlug !== brand.slug) invalidatePrompt()

  // iOS — Safari uses these (and the page title) for "Add to Home Screen"
  setMeta('apple-mobile-web-app-title', brand.name)
  setMeta('theme-color', brand.themeColor || '#ffa600')
  if (brand.logoUrl && /^https?:\/\//i.test(brand.logoUrl)) {
    const touch = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
    if (touch) touch.href = brand.logoUrl
  }
  document.title = brand.name
}

// Restore the default Eden install target (used when staff exit a DBA back
// into the main app so a later install doesn't save the DBA's link).
export function resetPwaBrand() {
  if (typeof document === 'undefined' || currentSlug === null) return
  currentSlug = null
  setManifestHref(`${base()}/manifest.json`)
  // Any prompt captured against a DBA manifest must not install as Eden —
  // clear unconditionally (a prompt may have been captured after runtime
  // branding, long after the direct-load slug marker was set).
  invalidatePrompt()
  setMeta('apple-mobile-web-app-title', 'Eden Comms')
  setMeta('theme-color', '#ffa600')
  const touch = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
  if (touch) touch.href = `${base()}/apple-touch-icon.png`
  document.title = 'Eden Communications'
}
