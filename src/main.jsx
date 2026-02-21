import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TEXT_PROCESSING_PLAN } from './textProcessingPlan'
import './index.css'
import App from './App.jsx'

// Show next week text processing plan in console
console.log(TEXT_PROCESSING_PLAN)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
