# react-oauth-oidc

OAuth 2.1 and OpenID Connect for React, with a protocol layer that does not depend on React at all.

| grant | status |
| --- | --- |
| **authorization code** + PKCE | recommended for anything with a user |
| **client credentials** | machine-to-machine |
| **implicit** | **deprecated** — omitted from OAuth 2.1, see [Legacy grants](#legacy-grants) |
| **resource owner password** | **deprecated** — omitted from OAuth 2.1, see [Legacy grants](#legacy-grants) |

Endpoint discovery, `id_token` verification against the provider's JWKS, and automatic refresh are
included. The protocol layer is plain functions over small observable stores, so route loaders, services
and workers can use it directly; React enters only through the hooks and the provider.

```sh
bun add react-oauth-oidc
```

Peers: `react` and `react-dom`, **19 or newer**. Nothing else is required — the protocol runs on `fetch`.

`axios` is needed only for the optional `react-oauth-oidc/axios` entry, and `@mui/material`,
`@mui/icons-material` and `@emotion/*` only for `react-oauth-oidc/component`.

## Entry points

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

## Quick start

### 1. Create the instance

```tsx
import { createOAuth, OAuthProvider } from 'react-oauth-oidc'

// created once, outside the component tree: route loaders and your own services need the
// instance before anything renders
export const oauth = createOAuth({
  config: {
    issuerPath: 'https://accounts.google.com',
    clientId: '<your_client_id>',
    scope: 'openid profile email',
    pkce: true
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

`<OAuthProvider>` is required. The hooks resolve their instance from context and nothing else, and throw
when it is missing.

### 2. Handle the redirect

For the authorization-code and implicit flows, add a route the IdP can come back to:

```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useOAuthActions } from 'react-oauth-oidc'

export const OAuthCallbackPage = () => {
  const { oauthCallback } = useOAuthActions()
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

### 3. Sign in and out

```tsx
import { useAuth } from 'react-oauth-oidc'

const Profile = () => {
  const { isLoggedIn, user, login, logout } = useAuth()
  return isLoggedIn ? (
    <button onClick={() => logout()}>{user?.name}</button>
  ) : (
    <button onClick={() => login({ redirectUri: `${location.origin}/oauth_callback`, responseType: 'code' })}>Login</button>
  )
}
```

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

## Hooks

| hook | gives you |
| --- | --- |
| `useAuth()` | `isLoggedIn`, `token`, `user`, `error`, `login`, `logout` — the one most components want |
| `useOAuth()` | the derived protocol state (`status`, `isAuthorized`, `accessToken`, `error`, `state`, `config`) plus every action |
| `useOAuthActions()` | every action, nothing observed |
| `useOAuthToken()` | `[token, setToken]` — the live token |
| `useOAuthUser()` | the live `UserInfo` |
| `useOAuthConfig()` | the live config and its setters |
| `useOAuthForm()` | the credentials form's state and validation, unstyled |
| `useOAuthFetch()` | `fetch` with the bearer attached, refreshing first and recording a 401 |
| `useOAuthAuthHeaders()` | the `Authorization` header, for a request you build yourself |
| `useOAuthFunctions()` | the protocol layer, with your overrides applied |
| `useOAuthInstance()` | the instance itself, for the cases the hooks do not cover |

### Subscribe to less

`useOAuth()` and `useOAuthToken()` re-render on *any* token write — including the nonce, the code
verifier and the redirect URI stashed during a PKCE handshake, none of which a component usually cares
about. When a component needs one fact, ask for that fact:

| hook | re-renders when |
| --- | --- |
| `useIsAuthorized()` | the answer flips |
| `useOAuthStatus()` | the status changes |
| `useAccessToken()` | the header value changes — `undefined` once the token has expired |
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

`useAuth()` does not hand back the instance, on purpose. See below.

## Outside React

Route loaders, plain services, interceptors: hold on to the instance `createOAuth()` returned and call its
getters.

```ts
import { oauth } from './oauth'

if (oauth.isAuthorized()) {
  const { access_token } = oauth.token()
}
```

There is no `getActiveOAuth()` and no ambient "current instance". Everything that needs one already has
it: React reads it from the provider, and your own modules import the value you exported. That is also
what makes concurrent SSR safe — with no ambient pointer, nothing can hand one request another request's
token.

**The getters are invisible to React.** `oauth.isAuthorized()` read during render happens once and never
updates, which is why components go through the hooks instead, and why `useAuth()` does not return the
instance — that would have put the trap in the most ergonomic path. Ask for it explicitly with
`useOAuthInstance()` when a component genuinely needs it.

To react to changes outside React, subscribe with `watchStore`, which fires only when the *selected* value
changes:

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

## The stored session

The token is persisted in `localStorage` under `storageKey` (`'token'` by default), so a reload stays
signed in. Change the key at runtime — `setStorageKey()`, or `useOAuthConfig().setStorageKey` — and the
new key is read without the old key's token being written to it, which is what a multi-tenant app needs.

### Other tabs

Every instance follows its own key across tabs. Signing out in one tab signs out the others, and a token
one tab refreshed is adopted by the rest instead of leaving them on a value that is already dead. Nothing
to wire up: the listener is attached by `start()` and removed by `dispose()`.

### Expiry

An expired token is refreshed before the call that needed it, and one refresh is shared by every
concurrent caller. When a refresh is impossible — no `refresh_token` — or the IdP rejects it, the session
goes to `NOT_AUTHORIZED` (or `DENIED`, with the `{error, error_description}` it answered with).

`accessToken()` / `useAccessToken()` is `undefined` for an expired token, the same way `isAuthorized()`
is `false`, so nothing hands out a bearer that is a guaranteed 401. `token()` still holds the raw value if
you need to inspect it.

`user()` follows the session: it is cleared whenever the token goes away, including a `logout()` that does
not navigate, a 401, and a refresh that failed — a signed-out app never renders the previous user's name.

### When storage is unavailable

Reads and writes are best-effort. A quota-exceeded write, Safari's private mode, storage disabled by
policy, or a corrupt value left under the key by something else are all survivable: the session lives in
memory for that page and simply does not persist. None of them throws out of `createOAuth()` or
`setToken()`, which would otherwise take down signing in on a full disk.

## Calling your own API

Attaching the bearer to your own requests works either way — pick by what your app already uses:

| you use | reach for | needs |
| --- | --- | --- |
| `fetch` | `oauth.fetch` / `useOAuthFetch()` | nothing, it is the default |
| axios | `createAxiosClient()` from `react-oauth-oidc/axios` | the `axios` peer |
| something else | `oauth.authHeaders(url)` / `useOAuthAuthHeaders()` | nothing |

All three refresh an expired token before the call — sharing one refresh across concurrent calls rather
than starting a stampede — and honour [Skipping public paths](#skipping-public-paths).

### Without axios

`oauth.fetch` is `fetch` with the bearer attached. A 401's body becomes the new token state, so the
`{error, error_description}` an IdP returns for a session it invalidated behind your back surfaces
through `error()` instead of leaving a token that looks fine and fails everything. A body that is empty
or is not JSON clears the session and records nothing — no error is invented on your server's behalf:

```ts
const orders = await oauth.fetch('/api/orders').then(r => r.json())
```

In a component, `useOAuthFetch()`. It defaults `Accept` to `application/json` on every request, and
`Content-Type` to `application/json` for a **string** body — the platform would otherwise send your
`JSON.stringify(…)` as `text/plain`. A `FormData`, `URLSearchParams`, `Blob` or stream body already
carries its own type and is left alone, so an upload keeps its multipart boundary. Set either header
yourself and it is kept, which is how you fetch a PDF or an HTML fragment through the same transport.

If you are building the request with a client the library knows nothing about, take the header instead.
`oauth.authHeaders(url)` is `{}` when there is no token or the URL is ignored, so it spreads
unconditionally:

```ts
await myClient.get('/api/orders', { headers: { ...(await oauth.authHeaders('/api/orders')) } })
```

### With axios

`react-oauth-oidc/axios` has the interceptors. It is the only entry that imports axios, which is why the
dependency is optional — apps on `fetch` never install it:

```ts
import { createAxiosClient, createAxiosInterceptors } from 'react-oauth-oidc/axios'

// a client with both interceptors attached
export const api = createAxiosClient(oauth, { baseURL: '/api' })

// or attach them to a client you already have
const { authorizationInterceptor, unauthorizedInterceptor } = createAxiosInterceptors(oauth)
existing.interceptors.request.use(authorizationInterceptor)
existing.interceptors.response.use(response => response, unauthorizedInterceptor)
```

The adapter takes the instance rather than calling a hook, so it works outside React too — and building
the client next to the instance, in the same bootstrap module, is the pattern to follow:

```ts
// oauth.ts
export const oauth = createOAuth({ config: { /* ... */ } })
export const api = createAxiosClient(oauth, { baseURL: '/api' })
```

One client for the app, importable from anywhere, so an interceptor you add in one module is there for
every caller. Building it per component instead — `useMemo(() => createAxiosClient(oauth), [oauth])` —
gives each component its own client, and interceptors added to one are invisible to the others.

Create one client per OAuth instance, never a shared default — on the server, two concurrent requests
sharing interceptors means one request's bearer on another request's call. Per request that means building
both together, exactly as above.

Nothing else in the library touches axios: the protocol calls (`refresh`, `revoke`, the token exchange,
discovery, `userinfo`) are on `fetch` regardless of which you pick here.

### Skipping public paths

Register the request URLs that must not carry a bearer. Applies to `oauth.fetch`, `authHeaders` and the
axios interceptor alike. Patterns are tested against the URL as given and against its pathname, so an
anchored pattern works for a relative path and an absolute URL alike:

```ts
oauth.ignorePath(/^\/public\//)
```

## UI

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

A rejected attempt clears the password and keeps the username — a mistyped password should not cost the
user their email as well — and stops showing field errors, so the emptied password field does not report
"required" on top of the IdP's own message. A successful one clears both.

## Configuration

| option | default | meaning |
| --- | --- | --- |
| `config` | — | the provider/endpoint half: `issuerPath`, `clientId`, `clientSecret`, `scope`, `authorizePath`, `tokenPath`, `revokePath`, `logoutPath`, `userPath`, `introspectionPath`, `jwksUri`, `pkce`, `redirectUri`, `logoutRedirectUri` |
| `storageKey` | `'token'` | the `localStorage` key the token is persisted under, and the key followed across tabs — see [The stored session](#the-stored-session) |
| `ignorePaths` | `[]` | request URL patterns that must not carry a bearer — see [Skipping public paths](#skipping-public-paths) |
| `strictJwt` | `true` | verify the `id_token` against the JWKS; with it off, claims are parsed without verification |
| `autoStart` | `true` | with `false`, building the instance observes nothing and hits no network until you call `start()` |
| `functions` | — | per-instance overrides of the protocol layer |

There is no index signature, so a misspelled option is a compile error rather than a silently ignored one.
Fields of your own are named through the type parameter:

```ts
const config: OAuthConfig<{ tenant: string }> = { config: { /* ... */ }, tenant: 'acme' }
const oauth = createOAuth(config)
```

`OAuthToken<TExtra>` and `UserInfo<TClaims>` do the same for provider-specific token fields and custom
claims:

```ts
const { groups } = oauth.user() as UserInfo<{ groups: string[] }>
```

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

### Overriding a network call

Every call (`refresh`, `revoke`, `authorize`, `userInfo`, …) can be replaced per instance, with no
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

## SSR

Create **one instance per request** — instances are fully isolated (token, config, watchers, transport) —
hand it to `<OAuthProvider>`, and dispose it when the render is done:

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

`oauthCallback()` no-ops on the server: the `code_verifier` lives in the browser's storage, and a
server-side exchange without it would still burn the single-use authorization code at the IdP — the
client's own exchange would then fail with `invalid_grant`.

Hydration needs no special handling. The token comes from `localStorage`, so the token and user hooks
report signed-out during the server pass *and* during the hydration render, then re-render once React
re-reads the store — no mismatch, and no gate that blanks the UI until an effect runs.

The library never imports `node:async_hooks`; it stays runtime-agnostic.

## Legacy grants

The **implicit** and **resource owner password credentials** grants are omitted from OAuth 2.1 and the
Security Best Current Practice advises against both: implicit returns tokens in the URL fragment where
they leak through history and referrers, and the password grant hands your application the user's actual
credentials and cannot support MFA or federation.

They are still supported here, because plenty of deployed identity providers still only offer them. If you
have a choice, use the authorization code grant with PKCE — it works for browser apps without a client
secret, which is the reason implicit existed in the first place.

```ts
// implicit — deprecated
login({ redirectUri, responseType: 'token' })

// resource owner password — deprecated
login({ username, password })
```

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

### Microsoft Entra ID

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
    scope: 'openid profile email',
    pkce: true
  }
})
```

Google needs `accessType: 'offline'` and `prompt: 'consent'` on the login parameters to return a refresh
token:

```ts
login({ redirectUri, responseType: 'code', accessType: 'offline', prompt: 'consent' })
```

## License

MIT
