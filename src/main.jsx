import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// The Purchase Portal has its OWN fixed theme and must never follow the system/browser
// light/dark preference. Pin the light theme on the root element before first paint.
document.documentElement.setAttribute('data-theme', 'light');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
