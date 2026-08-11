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

## Done — correctness round, 2026-08-11

Started as a parity check against `vue-oidc` (the sibling Vue library this one was ported from). Nothing
needed porting: every fix there was already here, and `config.ts`, `flows.ts` and `jwt.ts` are ahead of it
(pathname-aware `isPathIgnored`, single-use code exchange, clean-slate token on authorize, `revoke` in a
`finally`, jose's `customFetch`). Vue's `createAxiosOAuth`/`useOAuthHttp` are an artifact of `app.use()`
being its only resolution path — a React bootstrap exports the client next to the instance instead. What
the comparison did surface was eight defects of our own, all found by reading rather than by a failing test.

- **`user` outlived its session.** `user.ts` had two guarded fillers (`if (idToken)`, `if (isAuthorized())`)
  and nothing that ever wrote `undefined`, so `logout()` without a redirect, a 401 and a failed refresh all
  left the previous user's name and avatar on screen. One `sync()` now owns fill and clear, with a
  generation counter so an async `userInfo`/`jwt` result cannot land after the session it belonged to ended.
- **A corrupt storage entry bricked the app.** `JSON.parse` in `read()` is reached from
  `createStorageStore` → `createOAuth`, which apps call at module scope — so junk under the token key threw
  where nothing could catch it and the app never rendered. Unparseable now reads as absent.
- **A rejected write took down signing in.** `setItem` throws on an exceeded quota and in Safari's private
  mode, out of `setToken`, i.e. out of `login`, `logout`, `oauthCallback` and the 401 handler. Persistence
  is now best-effort; the in-memory session stands on its own.
- **Wrong peer range.** `provider.tsx` uses React 19 context-as-provider (`<Ctx value={…}>`) while the
  manifest said `react: '>=18'`, so React 18 would install cleanly and render a broken tree. Now `>=19`.
- **An expired bearer was still handed out.** `tokenState` computed `status` with expiry but `accessToken`
  without it, so `authHeaders` sent a token it knew was dead — a guaranteed 401, which the fetch layer then
  stores as the IdP's error. `accessToken` is expiry-aware now; `revalidate()` and its watcher moved to the
  raw `token()?.access_token`, which is the subtlety (see AGENTS.md) — the derived value is empty in exactly
  the case that has to refresh.
- **No cross-tab sync.** `storage.listen()`, attached by `start()` and removed by `dispose()`: a logout or
  a refresh in one tab now reaches the others instead of leaving them on a token the user believes they
  discarded.
- **Duplicate `userinfo` requests** — closed by the `sync()` rewrite rather than by a dedupe. `[id_token,
  isAuthorized]` is watched as one tuple, so a token write is one sync however many fields it moved, and
  `checkToken`'s `expires` write moves neither. Pinned by a spec that counts the calls.
- **The form cleared the username on a rejected password**, costing the user their email for a typo. It now
  clears the password only and drops `submitted`, so the emptied field does not report "required" over the
  IdP's own message. Reading the outcome needs the unsubscribed `isAuthorized()` getter — `login` reports a
  rejection through the token, not by throwing, and the subscribed snapshot is from render time.

20 specs added (216 total). Docs updated: a "The stored session" section in the library README covering
persistence, other tabs, expiry and unavailable storage; the axios recipe now shows the bootstrap singleton
instead of a per-component `useMemo`; four new entries in AGENTS.md.

Left open, both pre-existing and both accepted: `fetch.ts` stores *any* 401's body as token state,
including one from an unrelated resource endpoint (`ignorePath()` is the escape hatch, and it is documented);
and `flows.ts` keeps its `inFlight` map for the life of the page, which is bounded by the number of distinct
callback URLs a document sees.

## Not done, deliberately

### Dropping the implicit and resource-owner grants

Kept deliberately: plenty of deployed IdPs still offer nothing else. The docs now mark both deprecated in
the grant table and explain why in a Legacy grants section, rather than claiming "all four flows" next to
a 2.1 compliance badge.

### `bun.lock` has drifted from the manifests

`git log -S zustand -- bun.lock` is empty even though zustand was a declared dependency for the whole
history — so the lockfile has not been recording at least some workspace deps. Moot for zustand now that
it is gone, but worth understanding before trusting the lockfile for a release.

## Verification gaps

No part of this branch was driven through a real browser — the Chrome tooling was unavailable throughout.
The specs, the demo app's SSR response and a live check against Google cover most of it. Two gaps remain,
both needing a human at a keyboard:

- **Hydration with a stored token.** Seed `localStorage` with a token, reload, and confirm there is no
  hydration warning in the console and that the avatar switches to the filled icon after hydration. The
  spec asserts the server markup is byte-identical with and without a stored token, which is the same
  invariant, but it is not the same as watching React hydrate.
- **The half of the Google flow that needs a password.** Verified live against Google via
  `.env.production`: discovery populates every endpoint, the authorize URL carries a valid S256
  challenge, nonce, state and `access_type`/`prompt`, the verifier is persisted, `{ redirect: false }`
  returns the URL without navigating, JWKS is reachable, and Google answers 302 to its sign-in page —
  it accepts the request rather than rejecting it. The registered redirect URI is
  `https://vite.local.dev:3000/oauth_callback`; `localhost` is not whitelisted and returns
  `redirect_uri_mismatch`.

  What is still unverified is everything after the user types a password: the code exchange, the refresh,
  and hosted logout. Those need a real sign-in, which cannot be automated here. `bun run prod` serves the
  app at `https://vite.local.dev:3000` with that config if you want to walk it through.
