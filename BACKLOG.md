# Backlog

Architecture items from the React-idiom review of `apps/lib`. Each is independent unless a dependency is
noted. Written to survive across sessions — a fresh session should be able to execute any item from this
file without re-deriving the reasoning.

Verification for every item:

```sh
bun run check
bun --filter '*' type-check
bun --filter react-oauth-oidc test
bun --filter react-oauth-oidc build
grep -c createOAuth apps/lib/dist/component.mjs   # must be 0 — see AGENTS.md, the dual-core guard
```

## Done

- **Own the store layer, drop the zustand peer dep.** Commits `3820e74`, `e5eed56`, `5fda991`, `0347889`.
  Also fixed a real bug: persistence lived in a store subscriber, so a write re-entering during
  `rekey`'s notification cascade was silently dropped.
- **#1 — drop the module singleton, require the provider.** `getActiveOAuth`, `activeOAuth` and
  `aliveInstances` removed; `useOAuthInstance` throws when there is no `<OAuthProvider>`. The dual-core
  build guard in AGENTS.md now greps for `createOAuth`, since `activeOAuth` no longer exists to find.

## In progress — branch `refactor/own-store`

- **#3 — real `getServerSnapshot`, delete the `mounted` flag.** `tokenState()` in `token.ts` is now the
  single pure derivation used by both the instance getters and the hooks; `useStoreValue` takes an
  optional `serverSelector`; the token and user hooks pass a frozen signed-out snapshot; the config store
  deliberately does not. The `mounted` useState/useEffect gate is gone from `component/OAuth.tsx`, so the
  account button is server-rendered.

  Not verified in a real browser — the Chrome tooling was unavailable. The spec asserts the server
  markup is byte-identical with and without a stored token, which is the same invariant, but an actual
  hydration run with a seeded `localStorage` token would be worth doing: seed a token, reload, confirm
  no hydration warning in the console and that the avatar switches to the filled icon after hydration.
- **#6 — `/core` entry + `'use client'`.** Not started. Add `src/core.ts` exporting the React-free
  surface (`types`, `functions`, `store`, `storage`, `module`), keep `index.ts` as the React entry with a
  `'use client'` banner via tsdown `outputOptions.banner`, and add `./core` to the package `exports` map.

  Watch out: if `index.ts` re-exports `./core` inside the same tsdown build, the shared code may land in a
  chunk that carries no `'use client'` directive. The proven fix is the pattern `component/OAuth.tsx`
  already uses — import by package name (`react-oauth-oidc/core`) so the core stays a separate module,
  with a `tsconfig.json` path mapping back to `src/core.ts` for type-check and tests.

## Open

### #2 — Getters leak into the React surface

`useAuth()` returns the whole `oauth` instance, so a component can reach `oauth.isAuthorized()` — a
getter read in render happens once and never updates. The README needs a paragraph warning about this,
which means the API has a trap built into it.

Fix: split the type. `OAuthCore` (getters, for non-React consumers) versus what the hooks hand out. Drop
`oauth` from `useAuth`'s return. If it has to stay, rename the getters `peekToken()` / `readSnapshot()`
so misuse reads as wrong at the call site. Partly addressed already — the pure derivations extracted for
#3 mean the hooks no longer call getters during render.

### #4 — `useOAuth()` is a mega-hook that subscribes to whole objects

`useStoreValue(tokenStore, s => s.value)` re-renders on *every* token write — the `code_verifier` stash,
the `setExpires` bump, the nonce. A component showing only an avatar re-renders during PKCE setup. It
also returns a fresh 15-field object each render, so consumer `memo` never holds.

Fix: fine-grained hooks plus a selector escape hatch, and split state from actions.

```ts
export const useOAuthSelector = <T>(selector: (o: OAuth) => T): T
export const useIsAuthorized = () => ...   // boolean, identity-stable
export const useOAuthActions = () => ...   // stable object, zero subscriptions
```

A component that only calls `login` should never re-render on a token change. Keep `useOAuth()` as the
convenience aggregate; stop it being the only door.

### #5 — `createOAuth()` is not inert

Construction attaches watchers, calls `revalidate()`, fires `fetchUser()`, and can hit the network. So
building an instance at module scope has side effects.

Fix: `createOAuth()` builds, `oauth.start()` activates — or accept `{ autoStart: false }`. Makes the
SSR-per-request story and the specs honest, and matches how React treats subscription lifecycles.

### #7 — `oauthCallback` pushes idempotence onto the user

The README's callback-page recipe needs a `useRef` guard because StrictMode double-invokes effects and an
authorization code is single-use. `token.ts` already solves this shape with its `inFlight` promise.

Fix: dedupe inside `oauthCallback`, keyed by `code`. Deletes the ref from every consumer's callback page.

### #8 — `login()` both returns a URL and navigates

`flows.ts` calls `globalThis.location?.replace(url)` *and* returns the url. Impure, and unusable with
React Router or Next's `redirect()`.

Fix: `login(params, { redirect: false })`, or always return the url and expose navigation separately.

### #9 — axios as a peer dependency

Interceptors are the Angular idiom; the current React default is `fetch`.

Fix: core exposes `getAuthHeaders()` / `authorizedFetch`; ship axios as a `react-oauth-oidc/axios`
adapter. Drops a required peer for most consumers. Touches `functions.ts` (every network call) and
`http.ts`.

### #10 — the MUI component ships in the same package

Headless is the current idiom, and the MUI peers exist only for this one entry.

Fix: `useOAuthForm()` returning field state, validation and submit; move the MUI skin to a sibling
package or keep it as a reference implementation.

### #11 — Type surface

`[x: string]: any` on `OAuthConfig`, `OAuthToken` and `UserInfo` (`types.ts`) kills autocomplete and lets
typos through. Fix with generics: `UserInfo<TClaims = {}>`, `OAuthToken<TExtra = {}>`.

Separately, `OAuthType` and `OAuthStatus` are TS `enum`s. `as const` objects are erasable, tree-shake
better, and do not force a value import. Low priority, high polish.

### #12 — Naming

`useOAuthToken()` returns `{ value, set }`, which is a Vue ref. React reads `[token, setToken]`, or two
hooks.

## Not from the review

### `jwt.spec.ts` makes a real network call

Every `bun test` run prints an `ECONNREFUSED` stack — a spec reaches a real JWKS URL. Tests pass anyway,
so it is noise rather than failure, but it hides genuine errors in the output. Mock `createRemoteJWKSet`
or point `jwksUri` at a local fixture.

### `bun.lock` has drifted from the manifests

`git log -S zustand -- bun.lock` is empty even though zustand was a declared dependency for the whole
history — so the lockfile has not been recording at least some workspace deps. Moot for zustand now that
it is gone, but worth understanding before trusting the lockfile for a release.

### README claims OAuth 2.1 compliance while shipping the two grants 2.1 removes

`apps/lib/README.md` opens with "fully OAuth 2.1 compliant" and then lists all four grants. OAuth 2.1
removes the implicit and resource-owner-password grants. Supporting them is a defensible pragmatic
choice — IdPs still serve them — but the claim contradicts itself.

Suggested wording: "OAuth 2.1 by default (authorization code + PKCE); the legacy implicit and password
grants are still supported."
