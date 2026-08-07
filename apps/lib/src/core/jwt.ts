import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import type { ConfigContext } from './config'
import type { OpenIdConfig } from './types'

const parseJwt = (idToken?: string) => {
  const payload = idToken?.split('.')[1]
  if (!payload) return {}
  // JWT segments are base64url (RFC 7515) — atob only accepts base64: map -_ back and re-pad
  const base64 = payload
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(payload.length / 4) * 4, '=')
  return JSON.parse(
    decodeURIComponent(
      Array.from(atob(base64))
        .map(c => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    )
  )
}

/** Resolves the JWKS set lazily on use rather than from a subscription: the set is rebuilt only when
 * `jwksUri` or `strictJwt` actually changed, so nothing has to watch the config. */
export const createJwt = ({ config, strictJwt }: Pick<ConfigContext, 'config' | 'strictJwt'>) => {
  let jwksSet: ReturnType<typeof createRemoteJWKSet> | undefined
  let lastUri: string | undefined
  let lastStrict: boolean | undefined

  const jwks = () => {
    const jwksUri = (config() as OpenIdConfig)?.jwksUri
    const strict = strictJwt()
    if (jwksUri !== lastUri || strict !== lastStrict) {
      lastUri = jwksUri
      lastStrict = strict
      // hand jose the platform fetch: left to itself it reaches for `node:http`, which drags a Node
      // shim into Bun, workers and edge runtimes for what is one GET of a JSON document
      jwksSet =
        jwksUri && strict
          ? createRemoteJWKSet(new URL(jwksUri), { [customFetch]: (url, init) => fetch(url, init as RequestInit) })
          : undefined
    }
    return jwksSet
  }

  return async (idToken?: string) => {
    if (!idToken) return {}
    const set = jwks()
    if (!set) return parseJwt(idToken)
    const { issuerPath, clientId } = (config() as OpenIdConfig) || {}
    try {
      const { payload } = await jwtVerify(idToken, set, {
        ...(issuerPath && { issuer: issuerPath }),
        ...(clientId && { audience: clientId })
      })
      return payload
    } catch {
      return { error: 'Invalid token' }
    }
  }
}

export type Jwt = ReturnType<typeof createJwt>
