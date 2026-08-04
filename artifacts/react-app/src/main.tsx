import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Capture Chrome's install prompt as early as possible — it often fires
// before the React app (and InstallBanner) has mounted. Stash it globally
// so the banner can trigger the native install sheet on demand.
window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault()
  ;(window as any).__edenInstallPrompt = e
})

// Register service worker (required for PWA installability on Android/Chrome)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failure is non-fatal — app still works
    })
  })
}

createRoot(document.getElementById('root')!).render(<App />);
