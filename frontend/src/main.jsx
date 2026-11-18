import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Back from brainshospital.com (bfcache) can restore a blank React root — reload
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return
  const root = document.getElementById('root')
  const rootEmpty = !root?.firstElementChild
  if (rootEmpty || import.meta.env.DEV) {
    window.location.reload()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
