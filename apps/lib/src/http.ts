import type { ConfigContext } from './config'
import type { TokenContext } from './token'
import type { OAuthFetch } from './types'

/** The authorized transport, on `fetch`. Axios lives in `react-oauth-oidc/axios` now — it was a required
 * peer dependency for what amounts to two hooks around a request. */
export const createHttp = (
  { isPathIgnored }: Pick<ConfigContext, 'isPathIgnored'>,
  { setToken, accessToken, checkToken }: Pick<TokenContext, 'setToken' | 'accessToken' | 'checkToken'>
) => {
  /** The bearer, refreshing first if it is expired. Empty when there is nothing to send, so it can be
   * spread into a headers object unconditionally. */
  const authHeaders = async (url?: string): Promise<Record<string, string>> => {
    if (isPathIgnored(url)) return {}
    await checkToken()
    const bearer = accessToken()
    return (bearer && { Authorization: bearer }) || {}
  }

  /** `fetch` types these itself — including FormData's multipart boundary — so a Content-Type default
   * over the top of one breaks the request. */
  const bodyTypesItself = (body: unknown) =>
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof ReadableStream ||
    ArrayBuffer.isView(body)

  /** `fetch`, with the bearer attached and a 401 recorded.
   *
   * Storing the 401's body is what lets a session that the IdP has invalidated behind our back show up
   * as an error rather than as a token that looks fine and fails every call. */
  const authorizedFetch: OAuthFetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const headers = new Headers(init?.headers)
    for (const [key, value] of Object.entries(await authHeaders(url))) {
      headers.set(key, value)
    }
    // the axios client this replaced defaulted to JSON, and dropping that silently would have changed
    // what every existing call sends. Skipped for bodies fetch types better than we can.
    if (!headers.has('Content-Type') && !bodyTypesItself(init?.body)) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(input, { ...init, headers })
    if (response.status === 401) {
      // clone: the caller still has to be able to read the body
      await response
        .clone()
        .json()
        .then(body => setToken(body))
        .catch(() => setToken({}))
    }
    return response
  }

  return { authHeaders, authorizedFetch }
}

export type HttpContext = ReturnType<typeof createHttp>
