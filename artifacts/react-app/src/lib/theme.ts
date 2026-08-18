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

export type ThemeMode = 'dark' | 'light';

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
};

const LIGHT = {
  gold:    '#b07500',   // deeper gold — readable as text/borders on white
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
  goldDim: '#b0750018',
  goldMid: '#b0750040',
  onAccent:'#000000',
};

export const T: any = { ...DARK };

let mode: ThemeMode = 'dark';
const listeners = new Set<() => void>();

export const themeMode = (): ThemeMode => mode;
export const onThemeChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function applyTheme(m: ThemeMode) {
  mode = m === 'light' ? 'light' : 'dark';
  Object.assign(T, mode === 'light' ? LIGHT : DARK);
  try {
    document.body.style.background = T.black;
    document.body.style.color = T.text;
    document.documentElement.style.colorScheme = mode;
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
      const m = d?.mode === 'light' ? 'light' : d?.mode === 'dark' ? 'dark' : null;
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
