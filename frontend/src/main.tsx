import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { initAuth } from './lib/auth'
import { initBitrix, fitWindow } from './lib/bx24'
import './index.css'

async function bootstrap(): Promise<void> {
  // Dev/demo only. The mock module is behind this flag so it is never bundled
  // into the production build served by nginx.
  if (import.meta.env.VITE_MOCK === '1') {
    const { installMockServer } = await import('./mocks/server')
    installMockServer()
  }

  initAuth()

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => {
          const status = (error as { status?: number })?.status
          if (status === 401 || status === 404) return false
          return count < 2
        },
      },
    },
  })

  const container = document.getElementById('root')
  if (!container) throw new Error('#root missing from the bootstrap HTML')

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )

  // Tell the CRM shell how tall we are, now and whenever the document changes.
  initBitrix(() => fitWindow(0))
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => fitWindow()).observe(document.documentElement)
  }
}

void bootstrap()
