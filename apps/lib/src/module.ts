import { createConfig } from './config'
import { createFlows } from './flows'
import { defaultOAuthFunctions } from './functions'
import { createHttp } from './http'
import { createJwt } from './jwt'
import { createToken, isExpiredToken } from './token'
import type { OAuth, OAuthConfig } from './types'
import { createUser } from './user'

// last-one-wins pointer, so non-React code (interceptors, loaders, services) can reach the instance
let activeOAuth: OAuth | undefined

// created and not disposed — >1 means the pointer is ambiguous
let aliveInstances = 0

/** The instance for non-React code. On the client the last created one is the deliberate answer; on
 * the server it is only an answer while a single instance is alive, since concurrent renders could
 * otherwise hand out another request's token — so that case throws instead. */
export const getActiveOAuth = (): OAuth => {
  if (activeOAuth && aliveInstances > 1 && typeof window === 'undefined') {
    throw new Error(
      '[react-oauth-oidc]: ambiguous OAuth instance: multiple instances are alive on the server. Pass the request instance explicitly instead of resolving it globally.'
    )
  }
  if (!activeOAuth) {
    throw new Error('[react-oauth-oidc]: no active OAuth instance. Call createOAuth() first.')
  }
  return activeOAuth
}

/** One fully isolated instance: own config, token storage, axios instance and watchers. Create one per
 * request on the server and `dispose()` it when the render is done. */
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

  let disposed = false
  aliveInstances++

  const oauth: OAuth = {
    dispose: () => {
      if (!disposed) {
        disposed = true
        aliveInstances--
      }
      tokenContext.dispose()
      userContext.dispose()
      if (activeOAuth === oauth) {
        activeOAuth = undefined
      }
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
  activeOAuth = oauth
  return oauth
}

export { isExpiredToken }
