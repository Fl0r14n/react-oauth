import { createConfig } from './config'
import { createFetch } from './fetch'
import { createFlows } from './flows'
import { defaultOAuthFunctions } from './functions'
import { createJwt } from './jwt'
import { createToken, isExpiredToken } from './token'
import type { OAuth, OAuthConfig } from './types'
import { createUser } from './user'

/** One fully isolated instance: own config, token storage and watchers. Create one per request on the
 * server and `dispose()` it when the render is done.
 *
 * There is no module-level pointer to "the current instance", deliberately — it could not be answered
 * correctly under concurrent SSR, and every consumer already holds one: React through `<OAuthProvider>`,
 * everything else through the value this returned. */
// not generic in the config's extra fields: a type parameter here would be *inferred* from the argument, so
// `createOAuth({ storagekey: 'token' })` would take the typo for a legitimate extra and compile. Annotate
// instead — `const cfg: OAuthConfig<{ tenant: string }> = …`.
export const createOAuth = (cfg?: OAuthConfig): OAuth => {
  const configContext = createConfig(cfg)
  const functions = { ...defaultOAuthFunctions, ...cfg?.functions }
  const jwt = createJwt(configContext)
  const tokenContext = createToken(configContext, functions)
  const fetchContext = createFetch(configContext, tokenContext)
  const flows = createFlows(configContext, tokenContext, functions, jwt)
  const userContext = createUser(configContext, tokenContext, fetchContext, functions, jwt)

  const { configStore, oauthConfig, setOAuthConfig, config, setConfig, ignorePath, isPathIgnored, storageKey, setStorageKey, strictJwt } =
    configContext
  const {
    tokenStore,
    token,
    setToken,
    type,
    accessToken,
    status,
    isAuthorized,
    error,
    hasError,
    errorDescription,
    autoconfigOauth,
    checkToken
  } = tokenContext
  const { authHeaders, oauthFetch } = fetchContext
  const { stateStore, state, login, logout, oauthCallback } = flows
  const { userStore, user } = userContext

  const oauth: OAuth = {
    // idempotent, and re-armable after a dispose
    start: () => {
      tokenContext.start()
      userContext.start()
    },
    // idempotent: the teardowns are Set deletes, so a double dispose is harmless
    dispose: () => {
      tokenContext.dispose()
      userContext.dispose()
    },
    configStore,
    oauthConfig,
    setOAuthConfig,
    config,
    setConfig,
    storageKey,
    setStorageKey,
    ignorePath,
    isPathIgnored,
    strictJwt,
    functions,
    fetch: oauthFetch,
    authHeaders,
    tokenStore,
    token,
    setToken,
    type,
    accessToken,
    status,
    isAuthorized,
    error,
    hasError,
    errorDescription,
    userStore,
    user,
    stateStore,
    state,
    login,
    logout,
    oauthCallback,
    checkToken,
    autoconfigOauth
  }

  // Construction is inert — no subscriptions, no network — because an instance is normally built at module
  // scope, where a side effect runs on import: before a test can install its mocks, and during an SSR pass
  // that may only need the type.
  if (cfg?.autoStart !== false) {
    oauth.start()
  }
  return oauth
}

export { isExpiredToken }
