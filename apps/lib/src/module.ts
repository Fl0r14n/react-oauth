import { createConfig } from './config'
import { createFlows } from './flows'
import { defaultOAuthFunctions } from './functions'
import { createHttp } from './http'
import { createJwt } from './jwt'
import { createToken, isExpiredToken } from './token'
import type { OAuth, OAuthConfig } from './types'
import { createUser } from './user'

/** One fully isolated instance: own config, token storage, axios instance and watchers. Create one per
 * request on the server and `dispose()` it when the render is done.
 *
 * There is deliberately no module-level pointer to "the current instance". Every consumer already has
 * one: React gets it from `<OAuthProvider>`, and non-React code (interceptors, loaders, services) holds
 * the value this returned — the axios client on it already carries the interceptors. A global pointer
 * would only add a second source of truth, and one that cannot be answered correctly under concurrent
 * SSR. */
// deliberately not generic in the config's extra fields. A type parameter here would be *inferred* from
// the argument, so `createOAuth({ storagekey: 'token' })` would infer the typo as a legitimate extra and
// compile — which is the exact mistake the index signature used to allow. Annotate instead:
// `const cfg: OAuthConfig<{ tenant: string }> = …`.
export const createOAuth = (cfg?: OAuthConfig): OAuth => {
  const configContext = createConfig(cfg)
  const functions = { ...defaultOAuthFunctions, ...cfg?.functions }
  const jwt = createJwt(configContext)
  const tokenContext = createToken(configContext, functions)
  const httpContext = createHttp(configContext, tokenContext)
  const flows = createFlows(configContext, tokenContext, functions, jwt)
  const userContext = createUser(configContext, tokenContext, httpContext, functions, jwt)

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
  const { authHeaders, authorizedFetch } = httpContext
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
    fetch: authorizedFetch,
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

  // Construction itself is inert: no subscriptions, no network, nothing observed. That matters because
  // an instance is normally built at module scope, where a side effect runs on import — before a test
  // can install its mocks, and during an SSR pass that may only need the type.
  //
  // Default true, because the common case is "build it and use it" and making everyone remember a second
  // call would be a worse API than the side effect was.
  if (cfg?.autoStart !== false) {
    oauth.start()
  }
  return oauth
}

export { isExpiredToken }
