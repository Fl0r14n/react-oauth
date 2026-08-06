# Backlog

Architecture items from the React-idiom review of `apps/lib`. All of them are done — this file is kept as
the record of what changed and why, plus the few things deliberately left alone.

Verification for any future item:

```sh
bun run check                          # do not pipe this — the exit code is what matters
bun --filter '*' type-check
bun --filter react-oauth-oidc test
bun --filter react-oauth-oidc build   # also runs verify-entries.ts — the entry-boundary invariants
```

Worth doing for anything touching SSR or hydration, since the specs cannot see it: `bun run ssr`, then
`curl -sk https://localhost:3000/` and check the server markup and the log.

## Done

- **Own the store layer, drop the zustand peer dep.** Also fixed a real bug: persistence lived in a store
  subscriber, so a write re-entering during `rekey`'s notification cascade was silently dropped.
- **#1 — drop the module singleton, require the provider.** `getActiveOAuth`, `activeOAuth` and
  `aliveInstances` removed; `useOAuthInstance` throws when there is no `<OAuthProvider>`.
- **#2 — getters out of the ergonomic path.** `useAuth()` no longer returns the instance;
  `useOAuthInstance()` is the explicit ask. The hooks derive from `tokenState(snapshot)` rather than
  calling getters during render, so the trap is gone from the paths people actually use.
- **#3 — real `getServerSnapshot`, delete the `mounted` flag.** `tokenState()` is the single pure
  derivation shared by the instance getters and the hooks; `useStoreValue` takes an optional
  `serverSelector`; the token and user hooks pass a frozen signed-out snapshot, the config store
  deliberately does not.
- **#4 — fine-grained hooks.** `useIsAuthorized`, `useOAuthStatus`, `useAccessToken`, `useOAuthError`,
  `useOAuthSelector`, `useOAuthActions`. The spec pins the actual claim: `useIsAuthorized` does not
  re-render across three PKCE writes and `useOAuth` does, in the same file, so the contrast is the test.
- **#5 — inert construction.** `createOAuth` observes nothing and hits no network until `start()`, called
  for you unless `autoStart: false`. `start()` reconciles before subscribing, is idempotent, and re-arms a
  disposed instance.
- **#6 — `/core` entry + `'use client'`.** Four entries now (`core`, root, `axios`, `component`).
  `verify-entries.ts` runs in `bun run build` and asserts the invariants, all of which otherwise fail
  silently.
- **#7 — `oauthCallback` is idempotent per redirect.** Keyed by the redirect's parameters and retained
  rather than cleared on settle, so a browser Back into the callback URL cannot re-exchange a consumed
  code. The `useRef` guard is gone from the README recipe and the demo app.
- **#8 — `login()`/`logout()` take `{ redirect: false }`** and return the URL for callers that own
  navigation. `logout()` clears the local session either way.
- **#9 — fetch-based core, axios optional.** `oauth.fetch` and `oauth.authHeaders` replace `oauth.http`
  and the two interceptors; `react-oauth-oidc/axios` keeps them for apps that want them and is the only
  file importing axios. `defaultOAuthFunctions` gained its first spec, against a real local server.
- **#10 — `useOAuthForm`.** The credentials form's behaviour, i18n-free (error codes, not sentences), with
  the MUI component as one skin over it.
- **#11 — generic claim types, `as const` over `enum`.** `[x: string]: any` gone from `OAuthConfig`,
  `OAuthToken` and `UserInfo`; extras are a type parameter. `types.spec.ts` pins the tightening with
  `@ts-expect-error`, which fails the build if the index signature ever comes back.
- **#12 — `useOAuthToken()` returns `[token, setToken]`.**
- **jose/fetch under Bun.** happy-dom replaced global `fetch` with a `node:http`-based implementation that
  mis-parses `Bun.serve` responses, which was the real source of the `ECONNREFUSED` noise on every test
  run. `test-setup.ts` restores Bun's native fetch; `jwt.ts` hands jose the platform fetch via its
  `customFetch` option. The JWKS suite then gained the case it never had: strict verification succeeding.

## Not done, deliberately

### The OAuth 2.1 wording in the README

Reviewed and kept as-is: the library supports the implicit and resource-owner grants, and the README says
so. (For the record, the 2.1 draft *omits* both rather than deprecating them, but supporting them is a
defensible pragmatic choice and the docs are not misleading about what is on offer.)

### `bun.lock` has drifted from the manifests

`git log -S zustand -- bun.lock` is empty even though zustand was a declared dependency for the whole
history — so the lockfile has not been recording at least some workspace deps. Moot for zustand now that
it is gone, but worth understanding before trusting the lockfile for a release.

## Never verified in a browser

Nothing in this branch was checked in a real browser — the Chrome tooling was unavailable throughout. The
specs and the demo app's SSR response cover a lot, but two things would be worth a manual pass:

- **Hydration with a stored token.** Seed `localStorage` with a token, reload, and confirm there is no
  hydration warning in the console and that the avatar switches to the filled icon after hydration. The
  spec asserts the server markup is byte-identical with and without a stored token, which is the same
  invariant, but it is not the same as watching React hydrate.
- **A real IdP round trip.** `apps/app/.env` has no issuer configured, so no login flow — authorization
  code with PKCE, the callback exchange, refresh, and hosted logout — has been run against a live
  provider since these changes. Every one of them is covered by specs against a local server, which is
  not the same thing.
