import type { Subscribable } from './store'

/** The standard `fetch` signature. The library's transport is a plain fetch so the core needs no HTTP
 * client dependency; pass your own to intercept, instrument, or run it against a test double. */
export type OAuthFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type ClientCredentialConfig = {
  tokenPath: string
  revokePath?: string
  clientId: string
  clientSecret?: string
  scope?: string
  userPath?: string
  introspectionPath?: string
}

export type ResourceOwnerConfig = ClientCredentialConfig

export type ImplicitConfig = {
  authorizePath: string
  revokePath?: string
  clientId: string
  scope?: string
  logoutPath?: string
  redirectUri?: string // if not using OAuthParameters
  logoutRedirectUri?: string // if not using OAuthParameters
  userPath?: string
}

export type AuthorizationCodeConfig = ResourceOwnerConfig & {
  authorizePath: string
  logoutPath?: string
  redirectUri?: string // if not using OAuthParameters
  logoutRedirectUri?: string // if not using OAuthParameters
}

export type AuthorizationCodePKCEConfig = AuthorizationCodeConfig & {
  pkce?: boolean
}

export type OpenIdConfig = AuthorizationCodePKCEConfig & {
  issuerPath: string
  jwksUri?: string
}

export type ResourceOwnerParameters = {
  username: string
  password: string
}

export type AuthorizationCodeParameters = {
  accessType?: 'online' | 'offline'
  prompt?: 'none' | 'consent' | 'login' | 'select_account'
  redirectUri: string
  // `string & {}` keeps the two real options in autocomplete while still accepting anything an IdP
  // happens to want
  responseType: typeof OAuthType.IMPLICIT | typeof OAuthType.AUTHORIZATION_CODE | (string & {})
  state?: string
}

export type OAuthParameters = ResourceOwnerParameters | AuthorizationCodeParameters

export type RedirectOptions = {
  /** `false` builds the URL and returns it without navigating, for callers that own navigation — a
   * router, or Next's `redirect()`. The PKCE verifier and nonce are persisted either way, so the
   * callback still works. Defaults to `true`. */
  redirect?: boolean
}

export type OAuthTypeConfig =
  | OpenIdConfig
  | AuthorizationCodePKCEConfig
  | AuthorizationCodeConfig
  | ImplicitConfig
  | ResourceOwnerConfig
  | ClientCredentialConfig

/** `TExtra` instead of an `[x: string]: any` index signature: the index signature turned every typo into
 * a valid config and erased autocomplete. Carry your own fields by naming them — `OAuthConfig<{ tenant:
 * string }>` — which also documents them. */
export type OAuthConfig<TExtra = unknown> = {
  config?: Partial<OAuthTypeConfig>
  storageKey?: string
  ignorePaths?: RegExp[]
  strictJwt?: boolean
  functions?: Partial<OAuthFunctions>
  /** `false` builds an inert instance: no subscriptions, no revalidation, no network until you call
   * `start()`. Useful when the instance is created at module scope and something has to happen first —
   * installing mocks in a test, or reading a config that is not available at import time. */
  autoStart?: boolean
} & TExtra

/** `as const` objects rather than TS `enum`s: they erase to plain values (so a runtime that only strips
 * types can run the source), tree-shake, and do not force a value import just to name a type.
 * `OAuthType.RESOURCE` still works; the difference is that `OAuthType` in a type position is now the
 * union of the values. */
export const OAuthType = {
  RESOURCE: 'password',
  AUTHORIZATION_CODE: 'code',
  IMPLICIT: 'token',
  CLIENT_CREDENTIAL: 'client_credentials'
} as const

export type OAuthType = (typeof OAuthType)[keyof typeof OAuthType]

/** The token as persisted, which is the IdP's response plus the few fields this library adds to carry a
 * flow across a redirect (`code_verifier`, `nonce`, `redirect_uri`, and the computed `expires`).
 *
 * Provider-specific claims go in `TExtra` — `OAuthToken<{ id_token_expires_in: number }>` — rather than
 * through an `any` index signature that silently accepted misspellings of the real fields. */
export type OAuthToken<TExtra = unknown> = {
  id_token?: string
  access_token?: string
  refresh_token?: string
  token_type?: string
  state?: string
  error?: string
  error_description?: string
  expires_in?: number | string
  refresh_expires_in?: number | string
  scope?: string
  code_verifier?: string
  nonce?: string
  type?: OAuthType
  /** absolute ms, computed from `expires_in` on first sight */
  expires?: number
  code?: string
  /** echoed back into the token exchange, which has to match the authorize request */
  redirect_uri?: string
} & TExtra

export const OAuthStatus = {
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  AUTHORIZED: 'AUTHORIZED',
  DENIED: 'DENIED'
} as const

export type OAuthStatus = (typeof OAuthStatus)[keyof typeof OAuthStatus]

export type OpenIdConfiguration = {
  issuer?: string
  authorization_endpoint?: string
  introspection_endpoint?: string
  token_endpoint?: string
  userinfo_endpoint?: string
  end_session_endpoint?: string
  revocation_endpoint?: string
  jwks_uri?: string
  scopes_supported?: string[]
  code_challenge_methods_supported?: string[]
}

/** The standard OIDC claims. Anything your IdP adds goes in `TClaims` —
 * `UserInfo<{ groups: string[] }>` — so those claims are typed at the point of use instead of being
 * `any` everywhere. */
export type UserInfo<TClaims = unknown> = {
  email?: string
  email_verified?: boolean
  family_name?: string
  given_name?: string
  name?: string
  preferred_username?: string
  sub?: string
  address?: object
  picture?: string
  locale?: string
} & TClaims

export type IntrospectInfo = UserInfo & {
  active: boolean
  scope: string
  client_id?: string
  username: string
  exp: number
}

export interface OAuthFunctions {
  refresh: (token?: OAuthToken, config?: Partial<OpenIdConfig>) => Promise<OAuthToken | undefined>
  revoke: (token?: OAuthToken, config?: Partial<OpenIdConfig>) => Promise<void>
  authorize: (token?: OAuthToken, config?: Partial<OpenIdConfig>) => Promise<OAuthToken | undefined>
  resourceOwnerLogin: (parameters: ResourceOwnerParameters, config?: ResourceOwnerConfig) => Promise<OAuthToken | undefined>
  clientCredentialLogin: (config?: ClientCredentialConfig) => Promise<OAuthToken | undefined>
  openIdConfiguration: (config?: Partial<OpenIdConfig>) => Promise<OpenIdConfiguration | undefined>
  /** `request` defaults to the instance's authorized fetch, so the bearer is already attached */
  userInfo: (config?: Partial<OpenIdConfig>, request?: OAuthFetch) => Promise<UserInfo | undefined>
  introspect: (token?: OAuthToken, config?: Partial<OpenIdConfig>) => Promise<IntrospectInfo | undefined>
}

export interface OAuth {
  /** attaches the watchers and revalidates a stored token. Called for you unless you passed
   * `autoStart: false`. Idempotent, and re-arms an instance that was disposed. */
  start: () => void
  /** stops every watcher. On SSR, call it per request once the render is done. */
  dispose: () => void

  // --- config
  // read-only on purpose: writes go through setOAuthConfig/setToken, which own persistence and the
  // expires computation. A raw setState would bypass both.
  configStore: Subscribable<{ oauthConfig: OAuthConfig }>
  oauthConfig: () => OAuthConfig
  setOAuthConfig: (config: Partial<OAuthConfig>) => void
  /** the provider/endpoint part of the config — what discovery fills in */
  config: () => Partial<OAuthTypeConfig> | undefined
  setConfig: (config?: Partial<OAuthTypeConfig>) => void
  storageKey: () => string
  setStorageKey: (key: string) => void
  /** register a path the authorization interceptor must skip — idempotent */
  ignorePath: (pattern: RegExp) => void
  isPathIgnored: (url?: string) => boolean
  strictJwt: () => boolean | undefined
  functions: OAuthFunctions

  // --- token
  /** `fetch` with the bearer attached, refreshing an expired token first and recording a 401 */
  fetch: OAuthFetch
  /** the `Authorization` header for a request you are building yourself; `{}` when there is none, or when
   * the URL matches an ignored path */
  authHeaders: (url?: string) => Promise<Record<string, string>>
  tokenStore: Subscribable<{ value: OAuthToken }>
  token: () => OAuthToken
  setToken: (token: OAuthToken) => void
  type: () => OAuthType | undefined
  /** `"<token_type> <access_token>"`, or `undefined` when there is none or it has expired */
  accessToken: () => string | undefined
  status: () => OAuthStatus
  isAuthorized: () => boolean
  error: () => string | undefined
  hasError: () => boolean
  errorDescription: () => string | undefined

  // --- user
  userStore: Subscribable<{ user?: UserInfo }>
  user: () => UserInfo | undefined

  // --- flows
  stateStore: Subscribable<{ state?: string }>
  state: () => string | undefined
  /** returns the authorization URL for the redirect flows, `undefined` for the direct grants */
  login: (parameters?: OAuthParameters, options?: RedirectOptions) => Promise<string | undefined>
  /** returns the end-session URL when there is one to visit, `undefined` when logout was a local revoke */
  logout: (logoutRedirectUri?: string, state?: string, options?: RedirectOptions) => Promise<string | undefined>
  /** idempotent per redirect: the same `code` is exchanged once however many times this is called */
  oauthCallback: (url?: string | URL) => Promise<void>
  checkToken: () => Promise<void>
  autoconfigOauth: () => Promise<void>
}
