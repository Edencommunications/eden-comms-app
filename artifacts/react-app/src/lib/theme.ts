// theme.ts — shared, switchable color palette (Dark / Light).
//
// Every screen reads its colors from the mutable `T` object (App.tsx's `B`
// and each component's `C` alias it). applyTheme() swaps the token values in
// place and notifies listeners; the App root subscribes and re-renders the
// whole tree, so components pick up the new values on the next render.
//
// Token semantics (same names in both themes):
//   black   — page background            white — primary text (alias of text)
//   surface — cards/panels               card  — elevated cards
//   border/dim/muted — chrome            gold  — brand accent
//   onAccent — text drawn ON gold/brand-colored fills (dark in both themes)
import { sbBearer } from './sbAuth';

export type ThemeMode = 'dark' | 'light' | 'brand';

// Mix two hex colors: t=1 → pure a, t=0 → pure b.
const mix = (a: string, b: string, t: number) => {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v * t + pb[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
};

const DARK = {
  gold:    '#ffa600',
  black:   '#000000',
  white:   '#ffffff',
  surface: '#111111',
  bg:      '#111111',
  card:    '#1a1a1a',
  border:  '#2a2a2a',
  muted:   '#888888',
  dim:     '#333333',
  danger:  '#ff4444',
  success: '#4FD89A',
  text:    '#ffffff',
  goldDim: '#ffa60022',
  goldMid: '#ffa60044',
  onAccent:'#000000',
  // "Chrome" = top bar / side menu / app headers. Same family as surface in
  // dark/light; Brand mode paints it with the true brand color.
  chrome:      '#111111',
  onChrome:    '#ffffff',
  chromeMuted: '#888888',
  chromeBorder:'#2a2a2a',
};

const LIGHT = {
  gold:    '#ffa600',   // TRUE brand gold (user choice — accepts lower text contrast on white)
  black:   '#f2f2f4',   // page background flips to light gray
  white:   '#17171a',   // "white" is the text alias → near-black in light mode
  surface: '#ffffff',
  bg:      '#ffffff',
  card:    '#f6f6f8',
  border:  '#d8d8de',
  muted:   '#6d6d76',
  dim:     '#e7e7ec',
  danger:  '#c93a3a',
  success: '#178a55',
  text:    '#17171a',
  goldDim: '#ffa60022',
  goldMid: '#ffa60055',
  onAccent:'#000000',
  chrome:      '#ffffff',
  onChrome:    '#17171a',
  chromeMuted: '#6d6d76',
  chromeBorder:'#d8d8de',
};

// Darken a hex color while KEEPING its hue and saturation (no black mud):
// converts to HSL and pins lightness at the requested level.
const shade = (hex: string, lightness: number, satCap = 0.85) => {
  const [r, g, b] = hex.match(/\w\w/g)!.map((h) => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  s = Math.min(s, satCap);
  const L = lightness;
  const q = L < 0.5 ? L * (1 + s) : L + s - L * s, p = 2 * L - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = (v: number) => Math.round(f(v) * 255).toString(16).padStart(2, '0');
  return '#' + to(h + 1 / 3) + to(h) + to(h - 1 / 3);
};

// Brand-heavy: the whole chrome is washed in a deep shade of the org's brand
// color (dark-based so text stays readable), with the bright brand color as
// the accent. The accent comes from the active org/DBA via setBrandAccent().
// GOLD FRAME variant: pages stay dark like the normal theme, but the app
// "chrome" (top bar, side menu, headers) is painted with the TRUE brand
// color at full strength, with dark text on it (onChrome).
const brandTokens = (accent: string) => ({
  ...DARK,
  gold:    accent,
  goldDim: accent + '22',
  goldMid: accent + '44',
  chrome:       accent,        // header/menu backgrounds = true brand color
  onChrome:     '#000000',     // primary text on the brand chrome
  chromeMuted:  '#000000b0',   // secondary text on the brand chrome
  chromeBorder: '#00000033',   // dividers on the brand chrome
});

export const T: any = { ...DARK };

let mode: ThemeMode = 'dark';
let brandAccent = '#ffa600';

// Called by the org/DBA shells once branding is known, so Brand-heavy uses
// each organization's own color. Re-applies live if Brand mode is active.
export function setBrandAccent(hex: string) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex.trim())) return;
  const v = hex.trim();
  if (v === brandAccent) return;
  brandAccent = v;
  if (mode === 'brand') applyTheme('brand');
}
const listeners = new Set<() => void>();

export const themeMode = (): ThemeMode => mode;
export const onThemeChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function applyTheme(m: ThemeMode) {
  // Brand (gold-frame) mode is shelved for now — any stored 'brand' choice
  // falls back to dark. brandTokens/setBrandAccent are kept for easy revival.
  mode = m === 'light' ? 'light' : 'dark';
  Object.assign(T, mode === 'light' ? LIGHT : (mode as ThemeMode) === 'brand' ? brandTokens(brandAccent) : DARK);
  try {
    document.body.style.background = T.black;
    document.body.style.color = T.text;
    document.documentElement.style.colorScheme = mode === 'light' ? 'light' : 'dark';
  } catch { /* SSR-safe no-op */ }
  listeners.forEach((fn) => { try { fn(); } catch { /* listener errors can't break theming */ } });
}

// ── Persistence ──────────────────────────────────────────────
// Instant: localStorage (device). Cross-device: /api/prefs/theme (per login).
let userKey = '';           // set after login so choices are saved per person

const lsKey = () => (userKey ? `eden_theme:${userKey}` : 'eden_theme');

export function loadLocalTheme(forUser?: string): ThemeMode {
  try {
    const k = forUser ? `eden_theme:${forUser}` : lsKey();
    const v = localStorage.getItem(k) || localStorage.getItem('eden_theme');
    return v === 'light' ? 'light' : 'dark';
  } catch { return 'dark'; }
}

// Called once after login: remember whose preference we're tracking, apply
// the locally cached choice immediately, then ask the server for the synced
// one (it wins if different, so preferences follow the person across devices).
let generation = 0;         // invalidates in-flight preference fetches on logout/user switch
export function initThemeForUser(id: string) {
  userKey = String(id || '');
  const gen = ++generation;
  applyTheme(loadLocalTheme());
  fetch('/api/prefs/theme', { headers: { Authorization: sbBearer() } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (gen !== generation) return;   // logged out / switched accounts meanwhile
      const m = d?.mode === 'light' || d?.mode === 'dark' ? d.mode : null;
      if (m && m !== mode) { try { localStorage.setItem(lsKey(), m); } catch {} applyTheme(m); }
    })
    .catch(() => {});
}

export function resetThemeOnLogout() {
  userKey = '';
  generation++;             // drop any in-flight preference fetch
  applyTheme('dark');
}

// User clicked the toggle: apply, cache locally, sync to the server.
export function chooseTheme(m: ThemeMode) {
  try { localStorage.setItem(lsKey(), m); } catch {}
  applyTheme(m);
  fetch('/api/prefs/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
    body: JSON.stringify({ mode: m }),
  }).catch(() => {});
}
