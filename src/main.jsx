import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './ui.jsx'

if (window.location.hash === '#eruda') {
  import('eruda').then(module => {
    const eruda = module.default
    eruda.init()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
