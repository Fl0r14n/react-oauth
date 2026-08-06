import type { ConfigContext } from './config'
import { createStorageStore } from './storage'
import { watchStore } from './store'
import { type OAuthFunctions, OAuthStatus, type OAuthToken, type OpenIdConfig } from './types'

export const isExpiredToken = (token?: OAuthToken) => (token?.expires && Date.now() > token.expires) || false

export const createToken = (
  { configStore, config, setConfig, storageKey }: Pick<ConfigContext, 'configStore' | 'config' | 'setConfig' | 'storageKey'>,
  functions: OAuthFunctions
) => {
  const storage = createStorageStore<OAuthToken>(storageKey(), {})
  const token = storage.get
  const setToken = storage.set

  // the storage key is runtime-mutable: a multi-tenant app gives each tenant its own token key
  const unwatchKey = watchStore(configStore, storageKey, key => storage.rekey(key))

  const type = () => token()?.type

  const accessToken = () => {
    const { token_type, access_token } = token() || {}
    return (token_type && access_token && `${token_type} ${access_token}`) || undefined
  }

  const status = () => {
    const value = token()
    return (
      (value?.error && OAuthStatus.DENIED) ||
      (value?.access_token && !isExpiredToken(value) && OAuthStatus.AUTHORIZED) ||
      OAuthStatus.NOT_AUTHORIZED
    )
  }

  const isAuthorized = () => status() === OAuthStatus.AUTHORIZED
  const error = () => token().error
  const hasError = () => !!error()
  const errorDescription = () => token().error_description

  const autoconfigOauth = async () => {
    const c = (config() || {}) as OpenIdConfig
    if (!(c.tokenPath || c.authorizePath)) {
      const v = await functions.openIdConfiguration(c)
      if (v) {
        setConfig({
          ...c,
          ...(v?.authorization_endpoint && { authorizePath: v.authorization_endpoint }),
          ...(v?.token_endpoint && { tokenPath: v.token_endpoint }),
          ...(v?.revocation_endpoint && { revokePath: v.revocation_endpoint }),
          ...(v?.userinfo_endpoint && { userPath: v.userinfo_endpoint }),
          ...(v?.introspection_endpoint && { introspectionPath: v.introspection_endpoint }),
          ...(v?.end_session_endpoint && { logoutPath: v.end_session_endpoint }),
          ...(v?.jwks_uri && { jwksUri: v.jwks_uri }),
          ...(c?.pkce === undefined &&
            v?.code_challenge_methods_supported && { pkce: v.code_challenge_methods_supported.indexOf('S256') > -1 }),
          scope: config()?.scope || 'openid'
        })
      }
    }
  }

  const setExpires = (t: OAuthToken) => {
    const expiresIn = Number(t?.expires_in) || 0
    if (expiresIn && !t.expires) {
      setToken({
        ...t,
        expires: Date.now() + expiresIn * 1e3
      })
    }
  }

  let inFlight: Promise<void> | undefined

  const checkToken = () => {
    if (inFlight) return inFlight
    inFlight = (async () => {
      const t = token()
      if (isExpiredToken(t)) {
        await autoconfigOauth()
        const refreshed = await functions.refresh(t, config())
        if (refreshed && !isExpiredToken(refreshed)) {
          if (refreshed.error) {
            // RFC 6749 §5.2 error (e.g. invalid_grant) — persist it like the 401 interceptor so the dead token is dropped
            setToken(refreshed)
          } else {
            // keep the old refresh token — the response may not include a new one
            setExpires({ refresh_token: t.refresh_token, ...refreshed })
          }
        }
      } else {
        setExpires(t)
      }
    })().finally(() => {
      inFlight = undefined
    })
    return inFlight
  }

  // accessToken is a string, so identity comparison is enough and a setExpires write cannot loop
  const revalidate = () => {
    if (config() && accessToken()) {
      void checkToken()
    }
  }
  const unwatchConfig = watchStore(configStore, config, revalidate)
  const unwatchToken = watchStore(storage.store, accessToken, revalidate)
  revalidate()

  return {
    tokenStore: storage.store,
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
    checkToken,
    dispose: () => {
      unwatchKey()
      unwatchConfig()
      unwatchToken()
    }
  }
}

export type TokenContext = ReturnType<typeof createToken>
