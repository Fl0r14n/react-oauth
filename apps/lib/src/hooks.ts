import { useSyncExternalStore } from 'react'
import { useOAuthInstance } from './provider'
import type { Subscribable } from './store'
import { isExpiredToken } from './token'
import type { OAuth, OAuthConfig, OAuthParameters, OAuthStatus, OAuthToken, OAuthType, OAuthTypeConfig, UserInfo } from './types'

/** Every hook here subscribes. Outside React use `getActiveOAuth()` and its getters instead — a getter
 * is invisible to React, so `oauth.isAuthorized()` read in a component renders once and never updates. */

/** The React binding for the stores in `store.ts`, which are deliberately React-free.
 *
 * `getServerSnapshot` is the same function as `getSnapshot` on purpose. Handing `useSyncExternalStore`
 * a creation-time snapshot instead — which is what zustand's own `useStore` does — makes anything
 * written after the store was built (a restored token, a discovered config) invisible to
 * `renderToString`.
 *
 * `selector` must return a stable reference for unchanged state, or this re-renders forever. */
export const useStoreValue = <S, T>(store: Subscribable<S>, selector: (state: S) => T): T => {
  const snapshot = () => selector(store.getState())
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}

export const useOAuthToken = () => {
  const { tokenStore, setToken } = useOAuthInstance()
  return { value: useStoreValue(tokenStore, state => state.value), set: setToken }
}

/** id_token claims, replaced by the `userinfo` response when a `userPath` is configured. */
export const useOAuthUser = (): UserInfo | undefined => useStoreValue(useOAuthInstance().userStore, state => state.user)

/** `config` is the provider/endpoint half — the part `autoconfigOauth()` fills in from discovery. */
export const useOAuthConfig = () => {
  const { configStore, setOAuthConfig, setConfig, setStorageKey, ignorePath } = useOAuthInstance()
  const oauthConfig = useStoreValue(configStore, state => state.oauthConfig)
  return {
    oauthConfig,
    config: oauthConfig.config as Partial<OAuthTypeConfig> | undefined,
    storageKey: oauthConfig.storageKey || 'token',
    set: setOAuthConfig as (config: Partial<OAuthConfig>) => void,
    setConfig,
    setStorageKey,
    ignorePath
  }
}

export const useOAuthHttp = () => useOAuthInstance().http

export const useOAuthInterceptors = () => {
  const { authorizationInterceptor, unauthorizedInterceptor } = useOAuthInstance()
  return { authorizationInterceptor, unauthorizedInterceptor }
}

export const useOAuthFunctions = () => useOAuthInstance().functions

export interface OAuthState {
  type: OAuthType | undefined
  accessToken: string | undefined
  status: OAuthStatus
  isAuthorized: boolean
  error: string | undefined
  hasError: boolean
  errorDescription: string | undefined
  /** the `state` parameter echoed back by the last authorization redirect */
  state: string | undefined
  config: Partial<OAuthTypeConfig> | undefined
  storageKey: string
  setConfig: OAuth['setConfig']
  setStorageKey: OAuth['setStorageKey']
  ignorePath: OAuth['ignorePath']
  login: OAuth['login']
  logout: OAuth['logout']
  oauthCallback: OAuth['oauthCallback']
  autoconfigOauth: OAuth['autoconfigOauth']
  isExpiredToken: typeof isExpiredToken
}

export const useOAuth = (): OAuthState => {
  const oauth = useOAuthInstance()
  // subscribing to the three stores is what makes the derived values below re-render; the getters
  // read the same state, so they stay the single definition of how each value is derived
  useStoreValue(oauth.tokenStore, state => state.value)
  useStoreValue(oauth.configStore, state => state.oauthConfig)
  useStoreValue(oauth.stateStore, state => state.state)

  return {
    type: oauth.type(),
    accessToken: oauth.accessToken(),
    status: oauth.status(),
    isAuthorized: oauth.isAuthorized(),
    error: oauth.error(),
    hasError: oauth.hasError(),
    errorDescription: oauth.errorDescription(),
    state: oauth.state(),
    config: oauth.config(),
    storageKey: oauth.storageKey(),
    setConfig: oauth.setConfig,
    setStorageKey: oauth.setStorageKey,
    ignorePath: oauth.ignorePath,
    login: oauth.login,
    logout: oauth.logout,
    oauthCallback: oauth.oauthCallback,
    autoconfigOauth: oauth.autoconfigOauth,
    isExpiredToken
  }
}

export interface Auth {
  isLoggedIn: boolean
  token: OAuthToken
  user?: UserInfo
  error?: string
  login: (parameters?: OAuthParameters) => Promise<string | undefined>
  logout: (logoutRedirectUri?: string, state?: string) => Promise<void>
  oauth: OAuth
}

export const useAuth = (): Auth => {
  const oauth = useOAuthInstance()
  const token = useStoreValue(oauth.tokenStore, state => state.value)
  const user = useStoreValue(oauth.userStore, state => state.user)

  return {
    isLoggedIn: !!token?.access_token && !isExpiredToken(token) && !oauth.hasError(),
    token,
    user,
    error: oauth.errorDescription(),
    login: oauth.login,
    logout: oauth.logout,
    oauth
  }
}
