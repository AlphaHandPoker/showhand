import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import { AdminPage } from './pages/AdminPage.tsx'
import { ThemeProvider } from './theme/ThemeContext.tsx'
import './styles/mobile.css'

const isAdminRoute = window.location.pathname === '/admin'
  || window.location.pathname === '/admin/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {isAdminRoute ? <AdminPage /> : <App />}
      <Analytics />
      <SpeedInsights />
    </ThemeProvider>
  </StrictMode>,
)
