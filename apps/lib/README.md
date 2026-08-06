# react-oauth-oidc

> A fully **OAuth 2.1** compliant React library. All four flows are supported:
>
> - **resource owner**
> - **implicit**
> - **authorization code**
> - **client credentials**

> Supports OIDC

> `PKCE` support for authorization code with code verification

The protocol layer is plain functions over small observable stores and needs no React, so interceptors,
route loaders and services can use it directly. React enters only through the hooks and the provider.

```sh
bun add react-oauth-oidc
```

Peers: `react`, `react-dom`, `axios`. `@mui/material`, `@mui/icons-material` and `@emotion/*` are
needed only for the optional `react-oauth-oidc/component` entry.

### Entry points

| import from | you get | notes |
| --- | --- | --- |
| `react-oauth-oidc` | everything: the hooks, the provider, and all of `/core` | `'use client'` |
| `react-oauth-oidc/core` | the protocol layer only — `createOAuth`, the types, the store helpers | no React, no directive |
| `react-oauth-oidc/component` | the optional MUI account menu | `'use client'`, needs the MUI peers |

The root re-exports the core, so most apps only ever import from `react-oauth-oidc`. Reach for `/core`
when the importer is not a client component — a Next.js route handler or server component, a worker, a
CLI, a plain service. It has no React in its import graph and no `'use client'` banner, so it will not
drag a server module across the client boundary:

```ts
import { createOAuth, isExpiredToken } from 'react-oauth-oidc/core'
```

## How to

### Configure your oauth client

```tsx
import { createOAuth, OAuthProvider } from 'react-oauth-oidc'

// created once, outside the component tree: the axios interceptors and any route loader need the
// instance before anything renders
const oauth = createOAuth({
  config: {
    issuerPath: 'https://accounts.google.com',
    clientId: '<your_client_id>'
  }
})

createRoot(document.getElementById('app')!).render(
  <OAuthProvider oauth={oauth}>
    <App />
  </OAuthProvider>
)
```

With only an `issuerPath` set, the endpoints (`authorizePath`, `tokenPath`, `jwksUri`, PKCE support, …)
are discovered from `<issuer>/.well-known/openid-configuration` on the first login.

### Handle the redirect

For the authorization-code and implicit flows, add a route the IdP can come back to:

```tsx
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useOAuth } from 'react-oauth-oidc'

export const OAuthCallbackPage = () => {
  const { oauthCallback } = useOAuth()
  const navigate = useNavigate()
  // an authorization code is single-use, and StrictMode double-invokes effects in development
  const exchanged = useRef(false)

  useEffect(() => {
    if (exchanged.current) return
    exchanged.current = true
    void oauthCallback(globalThis.location?.href).finally(() => navigate('/', { replace: true }))
  }, [oauthCallback, navigate])

  return null
}
```

An effect rather than a route loader, deliberately: the exchange needs the `code_verifier` from browser
storage, and a loader also runs on the server.

### Use the hooks

```tsx
import { useAuth } from 'react-oauth-oidc'

const Profile = () => {
  const { isLoggedIn, user, login, logout } = useAuth()
  return isLoggedIn ? <button onClick={() => logout()}>{user?.name}</button> : <button onClick={() => login()}>Login</button>
}
```

| hook | gives you |
| --- | --- |
| `useAuth()` | `isLoggedIn`, `token`, `user`, `error`, `login`, `logout`, `oauth` — the one most components want |
| `useOAuth()` | the derived protocol state (`status`, `isAuthorized`, `accessToken`, `error`, `state`, `config`) plus every action |
| `useOAuthToken()` | `{ value, set }` — the live token |
| `useOAuthUser()` | the live `UserInfo` |
| `useOAuthConfig()` | the live config and its setters |
| `useOAuthHttp()` | the instance's axios client, interceptors attached |
| `useOAuthInterceptors()` | the two interceptors, to attach to your own axios instance |
| `useOAuthFunctions()` | the protocol layer, with your overrides applied |

Every hook subscribes and re-renders. **Outside React** — axios interceptors, route loaders, plain
services — hold on to the instance `createOAuth()` returned and call its getters:

```ts
// oauth.ts — your bootstrap owns the instance, and hands the same one to <OAuthProvider>
export const oauth = createOAuth({ config: { /* ... */ } })

// anywhere else
if (oauth.isAuthorized()) {
  /* ... */
}
```

There is no `getActiveOAuth()` and no ambient "current instance". Everything that needs one already has
it: React reads it from the provider, and your own modules import the value you exported. The instance's
`http` client already carries both interceptors, so the common case needs no wiring at all.

The getters are invisible to React, which is exactly why components must not use them — `oauth.isAuthorized()`
in a component renders once and never updates.

To react to changes outside React, subscribe to the instance's stores with `watchStore`, which fires only
when the *selected* value changes:

```ts
import { watchStore } from 'react-oauth-oidc'
import { oauth } from './oauth'

const unwatch = watchStore(oauth.tokenStore, state => state.value.access_token, accessToken => {
  /* ... */
})
```

The exposed stores (`tokenStore`, `configStore`, `userStore`, `stateStore`) are read-only: `getState` and
`subscribe`, no `setState`. Writes go through `setToken` / `setConfig` / `setStorageKey`, which own
persistence and the `expires` computation — a raw store write would skip both. `createStore` and
`createStorageStore` are exported too, if you want stores of your own on the same primitives.

### The `<OAuth>` component

An optional drop-in account menu, built on MUI:

```tsx
import OAuth from 'react-oauth-oidc/component'

;<OAuth
  responseType="code"
  redirectUri={`${location.origin}/oauth_callback`}
  logoutRedirectUri={`${location.origin}/`}
  accessType="offline"
/>
```

It renders an avatar button that opens the right affordance for the configured grant: a single login
button for the redirect flows, a username/password form for the resource-owner grant, the user's card
once signed in, and the flow error when there is one.

- `labels` — every string it renders, for translation (the library itself carries no i18n dependency)
- `renderUserInfo` — replaces the default user row with your own, receiving `{ user, logout }`

It server-renders the signed-out view. The token comes from `localStorage`, which the server cannot see,
so the hooks report signed-out during the server pass *and* during hydration — then re-render once React
re-reads the store. The account button is in the first paint, and hydration never disagrees.

### Override oauth functions (optional)

Every network call (`refresh`, `revoke`, `authorize`, `userInfo`, …) can be replaced per instance — no
mutation of shared objects:

```ts
import { createOAuth, defaultOAuthFunctions } from 'react-oauth-oidc'

const oauth = createOAuth({
  config: {
    /* ... */
  },
  functions: {
    refresh: async (token, config) => {
      const result = await defaultOAuthFunctions.refresh(token, config)
      // custom handling
      return result
    }
  }
})
```

### Ignoring paths

The authorization interceptor attaches the bearer to every request on the instance's axios client.
Register the ones it must skip:

```ts
oauth.ignorePath(/\/public\//)
```

### SSR

Create **one instance per request** — instances are fully isolated (token, config, watchers, axios
instance) — hand it to `<OAuthProvider>`, and dispose it when the render is done:

```tsx
export const render = async (url: string) => {
  const oauth = createOAuth({
    config: {
      /* ... */
    }
  })
  try {
    return renderToString(
      <OAuthProvider oauth={oauth}>
        <App />
      </OAuthProvider>
    )
  } finally {
    oauth.dispose()
  }
}
```

`<OAuthProvider>` is required — the hooks resolve their instance from context and nothing else, and they
throw when it is missing. That is what makes concurrent SSR safe by construction: with no ambient
pointer, there is nothing that could hand one request another request's token.

`oauthCallback()` no-ops on the server: the `code_verifier` lives in the browser's storage, and a
server-side exchange without it would still burn the single-use authorization code at the IdP — the
client's own exchange would then fail with `invalid_grant`.

The library never imports `node:async_hooks`; it stays runtime-agnostic.

## Configuration

| option | default | meaning |
| --- | --- | --- |
| `config` | — | the provider/endpoint half: `issuerPath`, `clientId`, `clientSecret`, `scope`, `authorizePath`, `tokenPath`, `revokePath`, `logoutPath`, `userPath`, `introspectionPath`, `jwksUri`, `pkce`, `redirectUri`, `logoutRedirectUri` |
| `storageKey` | `'token'` | the `localStorage` key the token is persisted under; changing it at runtime re-reads that key without writing to it |
| `ignorePaths` | `[]` | request URL patterns the authorization interceptor skips |
| `strictJwt` | `true` | verify the `id_token` against the JWKS; with it off, claims are parsed without verification |
| `functions` | — | per-instance overrides of the protocol layer |

## IdP examples

### Keycloak

```ts
createOAuth({
  config: {
    issuerPath: 'https://<host>/realms/<realm>',
    clientId: '<client>',
    scope: 'openid profile email',
    pkce: true
  }
})
```

### Azure AD

```ts
createOAuth({
  config: {
    issuerPath: 'https://login.microsoftonline.com/<tenant>/v2.0',
    clientId: '<client>',
    scope: 'openid profile email offline_access',
    pkce: true
  }
})
```

### Google

```ts
createOAuth({
  config: {
    issuerPath: 'https://accounts.google.com',
    clientId: '<client>',
    scope: 'openid profile email'
  }
})
```

Google needs `accessType: 'offline'` and `prompt: 'consent'` on the login parameters to return a refresh
token.

## License

MIT
