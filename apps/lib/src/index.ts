/** The package root: the React bindings, plus everything in `core.ts` re-exported for convenience.
 *
 * Built with a `'use client'` banner, because the hooks and the provider are client-only. That banner is
 * why the core has its own entry — a server component or route handler that only needs `createOAuth`
 * imports `react-oauth-oidc/core` and never crosses the client boundary.
 *
 * The core is imported by package name, not relatively, so the bundler keeps it external and there is
 * exactly one copy of it at runtime. See AGENTS.md. */
export * from 'react-oauth-oidc/core'
export * from './form'
export * from './hooks'
export * from './provider'
