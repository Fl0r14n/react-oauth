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
  const { http, authorizationInterceptor, unauthorizedInterceptor } = httpContext
  const { stateStore, state, login, logout, oauthCallback } = flows
  const { userStore, user } = userContext

  const oauth: OAuth = {
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
    http,
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
    autoconfigOauth,
    authorizationInterceptor,
    unauthorizedInterceptor
  }
  return oauth
}

export { isExpiredToken }
