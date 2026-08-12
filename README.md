# react-oauth

OAuth 2.1 / OpenID Connect React library, published as [`react-oauth-oidc`](apps/lib/README.md) on npm.

Authorization code with PKCE and client credentials, plus OIDC, discovery, JWKS verification and
automatic refresh. The implicit and resource-owner-password grants are supported too, and marked
deprecated — OAuth 2.1 omits both.

This repo is a Bun monorepo with two packages:

- **`apps/lib`** — the [`react-oauth-oidc`](apps/lib/README.md) library source. Built with `tsdown`,
  published to npm.
- **`apps/app`** — `react-oauth-oidc-client`, a demo consumer app linking the lib via `workspace:*`.

## Stack

- React 19, React Router, MUI (app + optional component entry)
- Vite + optional Bun SSR (`Bun.serve` + Vite middleware)
- a ~25-line in-house observable store for state, `fetch` for transport, `jose` for JWKS verification
- `axios` only in the optional `react-oauth-oidc/axios` adapter entry
- `tsdown` for the library bundle (ESM, `.d.mts` types)
- `bun:test` + happy-dom + Testing Library for the lib, `biome` for lint/format

## Setup

Requires [Bun](https://bun.sh). Never use `npm`/`yarn`/`pnpm`.

```sh
bun install
```

## Run

All commands from the repo root.

```sh
bun run dev           # dev servers for all workspaces (app on port 3000)
bun run ssr           # SSR dev server (Vite middleware + Bun.serve, HTTPS when .cert/ exists)
bun run build         # build lib (tsdown) + app (vite build)
bun run test          # lib tests
bun run type-check    # tsc across both workspaces
bun run lint          # biome lint
bun run format        # biome format --write
bun run check         # biome check --write (lint + format)
```

Per package:

```sh
bun --filter react-oauth-oidc build          # build lib only
bun --filter react-oauth-oidc test           # lib tests only
bun --filter react-oauth-oidc-client dev     # app dev server only
```

The app consumes the lib through its built `dist/`, so build the lib once before running the app — and
again after changing lib source.

HMR works in both `bun run dev` and `bun run ssr`, but it depends on `server.hmr.host` in
`apps/app/vite.config.ts` being a hostname that resolves to this machine (`vite.local.dev` by default,
which the certificate also covers via `*.local.dev`). Under the SSR host the websocket cannot be
derived from the page origin — that port belongs to `Bun.serve` — so if you browse on a different
hostname, point `server.hmr.host` at it or HMR will sit there retrying.

## App env vars

`VITE_`-prefixed (Vite convention), all optional:

- `VITE_OAUTH_ISSUER_PATH`, `VITE_OAUTH_CLIENT_ID`, `VITE_OAUTH_CLIENT_SECRET`, `VITE_OAUTH_SCOPE`
- `VITE_OAUTH_AUTHORIZE_PATH`, `VITE_OAUTH_TOKEN_PATH`, `VITE_OAUTH_LOGOUT_PATH` — only needed when the
  IdP has no discovery document
- `VITE_OAUTH_TYPE` (`code` by default, `password` for the resource-owner form), `VITE_OAUTH_PKCE`,
  `VITE_OAUTH_STATE`
- `VITE_APP_DOMAIN` (defaults to `globalThis.location?.origin`)
- `VITE_THEME` (default `light`)
- `PORT` overrides the default 3000

`apps/app/.env` holds commented-out placeholders and is tracked. Real IdP credentials belong in
`apps/app/.env.production` (loaded by `bun run prod` / `--mode production`), which is gitignored along
with `.env.local` and `.env.*.local`.

A client secret in a Vite app is compiled into the client bundle and is not a secret from the browser.
Use a public client with PKCE and no secret wherever the IdP allows it — Google does.

## TLS for SSR

Place `key.pem` + `cert.pem` in `.cert/`. The dev server and the SSR host use HTTPS when they are
present. See [.cert/README.md](.cert/README.md).

## Library docs

See [`apps/lib/README.md`](apps/lib/README.md) for usage, configuration and IdP examples (Keycloak,
Azure, Google).

## Publishing

**Publishing a GitHub release publishes to npm.** That is the whole flow — the release event runs
[`.github/workflows/publish.yml`](.github/workflows/publish.yml), which checks, builds, type-checks, tests
and then publishes `react-oauth-oidc`.

```sh
# 1. bump the version in apps/lib/package.json — that is the published manifest.
#    The root package.json has its own unrelated version; npm never sees it.
# 2. commit and tag
git commit -am 'release 1.2.0'
git tag v1.2.0
git push --follow-tags
# 3. publish the release — this is the step that triggers npm
gh release create v1.2.0 --generate-notes
```

Watch it and confirm the result:

```sh
gh run watch "$(gh run list --workflow publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
npm view react-oauth-oidc version
```

No npm token is involved. The workflow authenticates with [trusted
publishing](https://docs.npmjs.com/trusted-publishers/), exchanging GitHub's OIDC token for publish rights,
which also attaches [provenance](https://docs.npmjs.com/generating-provenance-statements) to the published
version. That takes one registration per package — note the repo is `react-oauth` while the package is
`react-oauth-oidc`, so `--repo` has to be explicit:

```sh
npm trust github react-oauth-oidc --file publish.yml --repo Fl0r14n/react-oauth --allow-publish
```

Until that registration exists the publish job fails, and per [npm/cli#9088](https://github.com/npm/cli/issues/9088)
it reports a misleading `404`/`ENEEDAUTH` rather than saying the publisher did not match.

`bun run publish` still publishes from a workstation, but prefer the release: a local publish prompts for a
2FA code and produces no provenance.

## License

MIT
