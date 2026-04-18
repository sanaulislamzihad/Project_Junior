import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import axios from 'axios'
import { AuthProvider } from './context/AuthContext'
import { ModalProvider } from './context/ModalContext'
import { TEXT_PROCESSING_PLAN } from './textProcessingPlan'
import './index.css'
import App from './App.jsx'

// Backend sessions live in memory — a server restart invalidates every
// token still sitting in student localStorage. Clear the stored user on 401
// so the app drops them at the login screen instead of silently failing
// every authed request from then on.
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err?.config?.url || '';
    const isAuthEndpoint = /\/auth\/(login|register)(\b|$)/.test(url);
    if (err?.response?.status === 401 && !isAuthEndpoint) {
      try { localStorage.removeItem('nsu_plagichecker_auth'); } catch {}
      if (!/\/login$/.test(window.location.pathname)) {
        window.location.replace('/login');
      }
    }
    return Promise.reject(err);
  }
);

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost).
// Students accessing the server over LAN via http://192.168.x.x:8000 hit a
// non-secure context where calling it throws "crypto.randomUUID is not a
// function" and breaks every submit/upload click. Polyfill it so the rest
// of the app can call it unconditionally.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = function randomUUID() {
    // RFC 4122 v4 UUID using crypto.getRandomValues (available in any context).
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  };
}

// Show next week text processing plan in console
console.log(TEXT_PROCESSING_PLAN)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ModalProvider>
          <App />
        </ModalProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
