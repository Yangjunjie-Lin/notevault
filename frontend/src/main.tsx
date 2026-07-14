import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './app/App'
import AppErrorBoundary from './shared/components/AppErrorBoundary'

const root = document.getElementById('root')
if (!root) throw new Error('Unable to find the application root element.')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
