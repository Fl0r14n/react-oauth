import type { ConfigContext } from './config'
import type { Jwt } from './jwt'
import { createStore } from './store'
import type { TokenContext } from './token'
import {
  type AuthorizationCodeParameters,
  type ClientCredentialConfig,
  type OAuthFunctions,
  type OAuthParameters,
  OAuthType,
  type OpenIdConfig,
  type ResourceOwnerConfig,
  type ResourceOwnerParameters
} from './types'

const arrToString = (buf: Uint8Array) => buf.reduce((s, b) => s + String.fromCharCode(b), '')
const base64url = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

const randomString = (length = 48) => {
  const buff = arrToString(crypto.getRandomValues(new Uint8Array(length * 2)))
  return base64url(buff).substring(0, length)
}

const pkce = async (value: string) => {
  const buff = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64url(arrToString(new Uint8Array(buff)))
}

const parseOauthUri = (hash: string) => {
  const params = Object.fromEntries(new URLSearchParams(hash))
  return (Object.keys(params).length && params) || {}
}

const generateNonce = (scope: string) => (scope.indexOf('openid') > -1 ? randomString() : undefined)

const generatePkcePair = async () => {
  const code_verifier = randomString()
  return { code_verifier, code_challenge: await pkce(code_verifier) }
}

export const createFlows = (
  { config }: Pick<ConfigContext, 'config'>,
  { token, setToken, autoconfigOauth }: Pick<TokenContext, 'token' | 'setToken' | 'autoconfigOauth'>,
  functions: OAuthFunctions,
  jwt: Jwt
) => {
  const stateStore = createStore<{ state?: string }>({})
  const state = () => stateStore.getState().state
  const setState = (value?: string) => stateStore.setState({ state: value })

  const checkNonce = async (parameters: Record<string, string>) => {
    if (parameters.error) return parameters
    const payload = await jwt(parameters.id_token)
    if (payload?.error || payload?.nonce !== token()?.nonce) {
      return { error: (payload?.error as string) || 'Invalid nonce' }
    }
    return parameters
  }

  const toAuthorizationUrl = async (parameters: AuthorizationCodeParameters) => {
    const { authorizePath, clientId, scope = '', pkce: usePkce } = config() as any
    // not only a config typo — with just an `issuerPath` set this comes from discovery, so a failed
    // discovery lands here too. Without the check it dies on `authorizePath.includes`, naming nothing.
    if (!authorizePath) {
      throw new Error(
        '[react-oauth-oidc]: cannot start the authorization flow — no authorizePath. Set it explicitly, or set issuerPath so autoconfigOauth() can discover it (and check that the discovery request succeeded).'
      )
    }
    const nonce = generateNonce(scope)
    const pkcePair = usePkce ? await generatePkcePair() : undefined
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: parameters.redirectUri,
      response_type: parameters.responseType,
      scope,
      state: parameters.state || ''
    })
    if (parameters.accessType) {
      params.set('access_type', parameters.accessType)
      params.set('prompt', parameters.prompt || '')
    }
    if (nonce) {
      params.set('nonce', nonce)
    }
    if (pkcePair) {
      params.set('code_challenge', pkcePair.code_challenge)
      params.set('code_challenge_method', 'S256')
    }
    // a clean slate, not `{...token()}`: spreading carries a stale `error` from a dead session into
    // the new attempt, so even a successful login comes back flagged as failed
    setToken({
      redirect_uri: parameters.redirectUri,
      ...(nonce && { nonce }),
      ...(pkcePair && { code_verifier: pkcePair.code_verifier })
    })
    const url = `${authorizePath}${authorizePath.includes('?') ? '&' : '?'}${params}`
    globalThis.location?.replace(url)
    return url
  }

  const checkCode = async () => {
    const parameters = await functions.authorize(token(), config())
    if (parameters) {
      setToken(await checkNonce(parameters as Record<string, string>))
    }
  }

  const login = async (parameters?: OAuthParameters) => {
    await autoconfigOauth()
    if (parameters && (parameters as ResourceOwnerParameters).password) {
      setToken((await functions.resourceOwnerLogin(parameters as ResourceOwnerParameters, config() as ResourceOwnerConfig)) || {})
    } else if (
      parameters &&
      (parameters as AuthorizationCodeParameters).redirectUri &&
      (parameters as AuthorizationCodeParameters).responseType
    ) {
      return await toAuthorizationUrl(parameters as AuthorizationCodeParameters)
    } else {
      setToken((await functions.clientCredentialLogin(config() as ClientCredentialConfig)) || {})
    }
  }

  const logout = async (logoutRedirectUri?: string, logoutState?: string) => {
    await autoconfigOauth()
    const { logoutPath, clientId, logoutRedirectUri: configLogoutRedirectUri } = (config() as OpenIdConfig) || {}
    const returnUri = logoutRedirectUri || configLogoutRedirectUri
    if (returnUri && logoutPath) {
      const { id_token } = token()
      const params = new URLSearchParams({ post_logout_redirect_uri: returnUri })
      if (clientId) {
        params.set('client_id', clientId)
      }
      if (id_token) {
        params.set('id_token_hint', id_token)
      }
      if (logoutState) {
        params.set('state', logoutState)
      }
      setToken({})
      globalThis.location?.replace(`${logoutPath}${logoutPath.includes('?') ? '&' : '?'}${params}`)
    } else {
      // best-effort: revoke may reject (IdP answers 4xx for an already-invalid token) and the local
      // session must go either way, or it lingers, 401s, and refills the token with the IdP's error
      try {
        await functions.revoke(token(), config())
      } finally {
        setToken({})
      }
    }
  }

  const oauthCallback = async (url?: string | URL) => {
    // do not run in SSR, verifiers sit in the user's browser storage
    if (typeof window === 'undefined') return
    const path = (url && new URL(url)) || globalThis.location || ({} as Location)
    const { hash, search } = path
    const isImplicitRedirect = hash && /(access_token=)|(error=)/.test(hash)
    const isAuthCodeRedirect = (search && /(code=)|(error=)/.test(search)) || (hash && /(code=)|(error=)/.test(hash))
    if (isImplicitRedirect) {
      const parameters = parseOauthUri(hash.substring(1))
      setToken({
        ...(await checkNonce(parameters)),
        type: OAuthType.IMPLICIT
      })
      setState(parameters?.state)
    } else if (isAuthCodeRedirect) {
      const parameters = parseOauthUri(search?.substring(1) || hash?.substring(1))
      setToken({
        ...token(),
        ...parameters
        // do not set type yet. will be set by authorize function since it is a two-step process
      })
      setState(parameters?.state)
      await autoconfigOauth()
      await checkCode()
    }
  }

  return {
    stateStore,
    state,
    login,
    logout,
    oauthCallback
  }
}

export type FlowsContext = ReturnType<typeof createFlows>
