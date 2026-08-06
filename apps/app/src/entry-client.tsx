import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { createApp } from '@/app'
import { routes } from '@/routes'

// the SSR pass puts its resolved locale here; without it the client could pick a different one from
// navigator.language and contradict the server's markup
const { Providers } = createApp((globalThis as { __LOCALE__?: string }).__LOCALE__)
const router = createBrowserRouter(routes)

const app = (
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>
)

const container = document.getElementById('app')
if (!container) {
  throw new Error('missing #app — index.html and the SSR template must agree on the mount point')
}

// an element, not innerHTML: plain `vite` (SPA) serves the template as-is, so the literal
// `<!--app-html-->` comment makes innerHTML non-empty and we would hydrate against nothing
if (container.firstElementChild) {
  hydrateRoot(container, app)
} else {
  createRoot(container).render(app)
}
