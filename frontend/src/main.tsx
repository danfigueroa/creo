import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { router } from '@/app/router'
import { AppProviders } from '@/app/providers'
import { anonymizeAnalyticsEvent } from '@/lib/analytics'
import './index.css'

// Drop any leftover theme persistence so the editorial light theme always wins.
window.localStorage.removeItem('pv-theme')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
      {/* Vercel Web Analytics: sem cookie. Só coleta em produção na Vercel;
          no `make dev` o script apenas loga no console. */}
      <Analytics beforeSend={anonymizeAnalyticsEvent} />
    </AppProviders>
  </React.StrictMode>
)
