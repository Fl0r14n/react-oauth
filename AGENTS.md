# AGENTS.md

Working notes for this repo. See [README.md](README.md) for the user-facing version.

## What this is

`react-oauth-oidc`: an OAuth 2.1 / OpenID Connect library for React, plus a demo app that consumes it.
Authorization code + PKCE and client credentials are the current grants; implicit and resource-owner
password are supported for legacy providers and documented as deprecated, since OAuth 2.1 omits both.
Do not quietly drop them — plenty of deployed IdPs still offer nothing else.

The core is deliberately React-free — plain functions over the in-house observable stores in
`store.ts` — so interceptors, route loaders and services can use it. React only enters through
`hooks.ts` and `provider.tsx`, and `store.ts` must never import it: every core module imports
`createStore` from there, so a React import would pull React into the whole core's graph.

## Toolchain

Bun only. Never `npm`, `yarn` or `pnpm` — the lockfile is `bun.lock` and the workspaces are Bun
workspaces.

```sh
bun install
bun run check        # biome: lint + format, writes
bun run type-check
bun --filter react-oauth-oidc test
bun --filter react-oauth-oidc build
```

## Layout

```
apps/lib/src
  types.ts       protocol types + the OAuth interface
  functions.ts   every network call, overridable per instance
  store.ts       createStore + watchStore (fires on selected-value change) — no React import
  config.ts      the config store and its accessors
  storage.ts     localStorage-backed store with an explicit rekey
  token.ts       token state, expiry, refresh, discovery
  http.ts        the authorized fetch and the Authorization header
  axios.ts       ENTRY: the optional axios adapter — the only file importing axios
  jwt.ts         id_token parsing and JWKS verification
  flows.ts       login / logout / oauthCallback, PKCE, nonce
  user.ts        user from id_token claims or the userinfo endpoint
  module.ts      createOAuth — no module-level state of any kind
  core.ts        ENTRY: the React-free surface, published as react-oauth-oidc/core
  provider.tsx   <OAuthProvider> and instance resolution
  hooks.ts       the React bindings — everything here subscribes
  index.ts       ENTRY: the package root — core re-exported + the React bindings, 'use client'
  component/     ENTRY: the optional MUI account menu, 'use client'
apps/app         demo app: Vite + React Router + MUI + i18next, SSR via Bun.serve
```

Four build entries, four separate builds — see `tsdown.config.ts`. `core` has no React in its graph and
no directive, so it works in a route handler, a worker or a server component. `index` and `component` are
`'use client'`, which is exactly why `core` needs an entry of its own. `axios` is the only file that
imports axios, which is what keeps that dependency optional.

## Things that will bite you

**Entries import each other by package name, never relatively.** `hooks.ts` and `provider.tsx` import
from `'react-oauth-oidc/core'`; `component/OAuth.tsx` imports from `'react-oauth-oidc'`. Each entry is a
separate build that keeps the others external, so a relative import across that boundary inlines a second
copy — a second React context, and the component goes blind to the instance the app created. It also
doubles the bundle. `tsconfig.json` maps both names back to source so type-check and tests still resolve.

This class of mistake is invisible in the source and in the tests. `verify-entries.ts` checks it, and
`bun run build` runs it:

```sh
bun --filter react-oauth-oidc build   # tsdown, then the entry invariants
```

It asserts the core imports neither React nor axios and carries no directive, that `index` and
`component` both lead with `'use client'`, that only the `axios` entry imports axios, and that nothing
has inlined a copy of the core.

**Getters do not re-render.** The instance exposes getters (`oauth.isAuthorized()`) because the core must
work outside React. Components must go through the hooks instead — a getter read in render happens once
and never updates. This is why `hooks.ts` subscribes to the stores even where it then calls the getters.

**There is no ambient instance.** `createOAuth` keeps no module-level pointer, and `useOAuthInstance`
resolves from `<OAuthProvider>` or throws. That is deliberate: a last-one-wins global cannot be answered
correctly while two SSR renders are in flight, and every consumer already holds the instance — React via
the provider, everything else via the value `createOAuth` returned, whose `fetch` already carries the
bearer. Do not reintroduce a pointer "for convenience".

**Specs should dispose their instances.** Bun runs every spec file in one process, and an instance whose
config watcher is still live can fire a refresh against another test's mocks. Use the tracked factory
from `test-utils.ts` and call `registerOAuthCleanup()` at the top of the file. No longer a correctness
requirement now that nothing is registered globally, but still the difference between a clean run and a
confusing one.

**Browser-only state needs a server snapshot, not a mount gate.** The token is seeded from
`localStorage`, which the server cannot see, so a hook that reads it during hydration disagrees with the
server's HTML. The fix is the third argument to `useStoreValue`: the token and user hooks pass a
deterministic signed-out snapshot, React re-reads the store after hydration, and the real value lands one
render later without a mismatch. Config does **not** get one — it is passed to `createOAuth`, so
`renderToString` must see discovered endpoints.

This is also why the hooks derive from `tokenState(snapshot)` rather than calling the instance getters: a
getter reads the store directly and would smuggle the restored token back into the hydration render.
Testing any of it needs `renderToString` — Testing Library's `render()` flushes effects, so React has
already re-read the store by the time it returns.

**The user row in the component is not conditional.** Logout lives in that row's `secondaryAction`, so
gating the row on `name`/`email` would strand a user whose claims carry only a `sub` with no way to sign
out. `displayName()` supplies the fallback chain.

**`oauthCallback()` no-ops on the server** and must stay that way. The `code_verifier` is in browser
storage; a server-side exchange without it still burns the single-use code at the IdP, and the client's
own exchange then fails with `invalid_grant`. That is also why the demo does the exchange in an effect
rather than a route loader.

**HMR depends on `server.hmr.host` being pinned.** Under the SSR host the client cannot derive its
websocket target from the page origin — that port is `Bun.serve`'s, not Vite's — so `vite.config.ts`
pins `host: 'vite.local.dev'` and `protocol: 'wss'`. Drop that block and the console fills with
`WebSocket closed without opened`. The hostname has to resolve to this machine and be covered by the
certificate (`*.local.dev` is).

## Testing

`bun:test` with happy-dom registered via `bunfig.toml` → `test-setup.ts`, plus Testing Library. Specs sit
next to their source as `*.spec.ts(x)`.
