import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Mock storage API for localStorage
window.storage = {
  get: async (key, shared = true) => {
    const value = localStorage.getItem(key)
    return value ? { value } : null
  },
  set: async (key, value, shared = true) => {
    localStorage.setItem(key, value)
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
