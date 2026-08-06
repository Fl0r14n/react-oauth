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

Peers: `react` and `react-dom`. Nothing else is required — the protocol runs on `fetch`.

`axios` is needed only for the optional `react-oauth-oidc/axios` entry, and `@mui/material`,
`@mui/icons-material` and `@emotion/*` only for `react-oauth-oidc/component`.

### Entry points

| import from | you get | notes |
| --- | --- | --- |
| `react-oauth-oidc` | everything: the hooks, the provider, and all of `/core` | `'use client'` |
| `react-oauth-oidc/core` | the protocol layer only — `createOAuth`, the types, the store helpers | no React, no directive |
| `react-oauth-oidc/axios` | the optional axios adapter — interceptors and a client factory | no React; needs the `axios` peer |
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

// created once, outside the component tree: route loaders and your own services need the
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
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useOAuth } from 'react-oauth-oidc'

export const OAuthCallbackPage = () => {
  const { oauthCallback } = useOAuth()
  const navigate = useNavigate()

  useEffect(() => {
    void oauthCallback(globalThis.location?.href).finally(() => navigate('/', { replace: true }))
  }, [oauthCallback, navigate])

  return null
}
```

No guard needed. `oauthCallback` is idempotent per redirect: an authorization code is single-use, so
calling it twice with the same URL returns the first exchange rather than starting a second. That covers
StrictMode's double-invoke in development and a browser Back into the callback URL in production, where
re-exchanging a consumed code would come back as `invalid_grant` and take down a session that had already
succeeded.

An effect rather than a route loader, deliberately: the exchange needs the `code_verifier` from browser
storage, and a loader also runs on the server.

### Own the navigation

`login()` and `logout()` navigate with `location.replace` by default. Pass `{ redirect: false }` to get
the URL back instead and route it yourself — a React Router navigation, or Next's `redirect()`:

```ts
const url = await login({ redirectUri, responseType: 'code' }, { redirect: false })
// the PKCE verifier and nonce are already persisted, so the callback works whoever navigates
router.push(url!)
```

`logout()` returns the end-session URL the same way, and clears the local session either way — so it is
never left behind if the navigation does not happen. It returns `undefined` when there is no hosted
end-session endpoint to visit, since logout was then a local token revocation.

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
| `useAuth()` | `isLoggedIn`, `token`, `user`, `error`, `login`, `logout` — the one most components want |
| `useOAuth()` | the derived protocol state (`status`, `isAuthorized`, `accessToken`, `error`, `state`, `config`) plus every action |
| `useOAuthToken()` | `[token, setToken]` — the live token |
| `useOAuthUser()` | the live `UserInfo` |
| `useOAuthConfig()` | the live config and its setters |
| `useOAuthFetch()` | `fetch` with the bearer attached, refreshing first and recording a 401 |
| `useOAuthAuthHeaders()` | the `Authorization` header, for a request you build yourself |
| `useOAuthFunctions()` | the protocol layer, with your overrides applied |
| `useOAuthInstance()` | the instance itself, for the cases the hooks do not cover |

#### Subscribe to less

`useOAuth()` and `useOAuthToken()` re-render on *any* token write — including the nonce, the code
verifier and the redirect URI stashed during a PKCE handshake, none of which a component usually cares
about. When a component needs one fact, ask for that fact:

| hook | re-renders when |
| --- | --- |
| `useIsAuthorized()` | the answer flips |
| `useOAuthStatus()` | the status changes |
| `useAccessToken()` | the header value changes |
| `useOAuthError()` | the error changes |
| `useOAuthSelector(fn)` | whatever `fn` returns changes |
| `useOAuthActions()` | never — no subscription at all |

```tsx
// an avatar that only cares whether someone is signed in
const Avatar = () => (useIsAuthorized() ? <UserIcon /> : <AnonIcon />)

// a sign-out button that never re-renders
const SignOut = () => {
  const { logout } = useOAuthActions()
  return <button onClick={() => logout()}>Sign out</button>
}
```

`useOAuthSelector` must return a primitive or a reference that is stable for unchanged state — a fresh
object every call re-renders forever. Every one of these derives its server value by applying the same
selector to an empty token, so they hydrate without a mismatch and without any extra plumbing.

`useAuth()` does not hand back the instance. The instance exposes getters, and a getter read during
render happens once and never updates — returning it from a hook put that trap in the most ergonomic
path. Ask for it explicitly with `useOAuthInstance()` when you need it.

Every hook subscribes and re-renders. **Outside React** — route loaders, interceptors, plain
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
it: React reads it from the provider, and your own modules import the value you exported. `oauth.fetch`
already attaches the bearer, so the common case needs no wiring at all.

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

### Or build your own form

The credentials form's behaviour lives in `useOAuthForm`, which has no opinion about how anything looks —
the MUI component above is one skin over it. Field errors come back as codes rather than sentences, so
the hook needs no i18n dependency and you pick the wording:

```tsx
const SignIn = () => {
  const form = useOAuthForm()

  return (
    <form onSubmit={form.submit}>
      <input value={form.username.value} onChange={e => form.username.onChange(e.target.value)} />
      {form.username.showError && <span>{form.username.error === 'required' ? 'Required' : 'Too long'}</span>}

      <input
        type={form.passwordVisible ? 'text' : 'password'}
        value={form.password.value}
        onChange={e => form.password.onChange(e.target.value)}
      />
      <button type="button" onClick={form.togglePasswordVisible}>eye</button>

      {form.error && <p role="alert">{form.error}</p>}
      <button type="submit" disabled={form.submitting || (form.submitted && !form.valid)}>Sign in</button>
    </form>
  )
}
```

`showError` is false until a submit has been attempted, so a pristine form does not shout about its empty
required fields. `form.error` is the IdP's rejection of the last attempt; `dismissError()` hides it, and
the next attempt shows it again even if the message is identical.

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

`oauth.fetch` attaches the bearer to every request it makes, as does the axios adapter's interceptor.
Register the paths they must skip:

```ts
oauth.ignorePath(/\/public\//)
```

### Calling your own API

`oauth.fetch` is `fetch` with the bearer attached. It refreshes an expired token before the call, skips
the paths you registered above, and records a 401's body on the token so a session the IdP invalidated
behind your back surfaces as an error rather than as a token that looks fine and fails everything:

```ts
const orders = await oauth.fetch('/api/orders').then(r => r.json())
```

In a component, `useOAuthFetch()`. If you are building the request with something else, take the header
instead — `useOAuthAuthHeaders()`, or `oauth.authHeaders(url)`, which is `{}` when there is no token or
the URL is ignored, so it can be spread unconditionally:

```ts
await myClient.get('/api/orders', { headers: { ...(await oauth.authHeaders('/api/orders')) } })
```

#### axios

If your own requests want interceptors, `react-oauth-oidc/axios` has them. It is the only entry that
imports axios, which is why the dependency is optional:

```ts
import { createAxiosClient, createAxiosInterceptors } from 'react-oauth-oidc/axios'

// a client with both interceptors attached
export const api = createAxiosClient(oauth, { baseURL: '/api' })

// or attach them to a client you already have
const { authorizationInterceptor, unauthorizedInterceptor } = createAxiosInterceptors(oauth)
existing.interceptors.request.use(authorizationInterceptor)
existing.interceptors.response.use(response => response, unauthorizedInterceptor)
```

The adapter takes the instance rather than calling a hook, so it works outside React too. In a component,
keep the client stable:

```ts
const oauth = useOAuthInstance()
const api = useMemo(() => createAxiosClient(oauth), [oauth])
```

Create one client per OAuth instance, never a shared default — on the server, two concurrent requests
sharing interceptors means one request's bearer on another request's call.

### SSR

Create **one instance per request** — instances are fully isolated (token, config, watchers,
transport) — hand it to `<OAuthProvider>`, and dispose it when the render is done:

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
| `autoStart` | `true` | with `false`, building the instance observes nothing and hits no network until you call `start()` |
| `functions` | — | per-instance overrides of the protocol layer |

### Deferring the start

`createOAuth()` normally arms itself: it subscribes to its own stores, and revalidates a stored token —
which can mean a refresh request. That is usually what you want, but an instance is typically built at
module scope, where it means a network call on import. `autoStart: false` builds an inert instance:

```ts
export const oauth = createOAuth({ config: { /* ... */ }, autoStart: false })

// later, once whatever had to happen first has happened
oauth.start()
```

`start()` is idempotent, re-arms an instance you disposed, and reconciles before subscribing — so a
`storageKey` set while the instance was inert is picked up rather than ignored.

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
