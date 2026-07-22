import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Register service worker (required for PWA installability on Android/Chrome)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failure is non-fatal — app still works
    })
  })
}

createRoot(document.getElementById('root')!).render(<App />);
