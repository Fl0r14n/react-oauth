# AGENTS.md

Working notes for this repo. See [README.md](README.md) for the user-facing version.

## What this is

`react-oauth-oidc`: an OAuth 2.1 / OpenID Connect library for React, plus a demo app that consumes it.
All four grants (resource owner, implicit, authorization code, client credentials), OIDC, and PKCE.

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
  http.ts        the axios instance and the two interceptors
  jwt.ts         id_token parsing and JWKS verification
  flows.ts       login / logout / oauthCallback, PKCE, nonce
  user.ts        user from id_token claims or the userinfo endpoint
  module.ts      createOAuth + the module-level active pointer
  provider.tsx   <OAuthProvider> and instance resolution
  hooks.ts       the React bindings — everything here subscribes
  component/     the optional MUI account menu
apps/app         demo app: Vite + React Router + MUI + i18next, SSR via Bun.serve
```

## Things that will bite you

**The component entry must import the core by package name.** `src/component/OAuth.tsx` imports from
`'react-oauth-oidc'`, not `'../hooks'`. It is bundled as a separate entry, so a relative import inlines a
second copy of the core — a second module pointer and a second React context — and the component goes
blind to the instance the app created. `tsconfig.json` maps the package name back to `src/index.ts` so
type-check and tests still resolve it. Verify after touching the build:

```sh
bun run build && grep -c activeOAuth apps/lib/dist/component.mjs   # must be 0
```

**Getters do not re-render.** The instance exposes getters (`oauth.isAuthorized()`) because the core must
work outside React. Components must go through the hooks instead — a getter read in render happens once
and never updates. This is why `hooks.ts` subscribes to the stores even where it then calls the getters.

**Specs must dispose their instances.** `createOAuth` counts live instances to detect an ambiguous global
pointer on the server, and bun runs every spec file in one process — a leaked instance from one file
trips the ambiguity error in another. Use the tracked factory from `test-utils.ts` and call
`registerOAuthCleanup()` at the top of the file.

**The component renders nothing until mounted.** The token is seeded from `localStorage`, which the
server cannot see, so rendering the signed-in view during the server pass guarantees a hydration
mismatch. Testing that gate needs `renderToString` — Testing Library's `render()` flushes effects, so the
gate is already open by the time it returns.

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
