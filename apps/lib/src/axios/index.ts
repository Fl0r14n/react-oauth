import axios, { type AxiosInstance, type CreateAxiosDefaults, type InternalAxiosRequestConfig } from 'axios'
import type { OAuth } from '../core/types'

/** The axios adapter, published as `react-oauth-oidc/axios`.
 *
 * The core speaks `fetch` and has no HTTP client dependency — axios used to be a required peer for every
 * consumer, including the ones who never touched it. This entry keeps the ergonomics for apps that do
 * want interceptors, and it is the only place axios is imported, so the dependency is optional.
 *
 * React-free on purpose: pass the instance in. In a component that means
 * `useMemo(() => createAxiosClient(useOAuthInstance()), [oauth])`, which keeps the client stable without
 * this entry needing to know about React at all. */

/** Attaches the bearer, refreshing an expired token first, and skips URLs registered with
 * `oauth.ignorePath()`. */
export const authorizationInterceptor =
  (oauth: OAuth) =>
  async (req: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    for (const [key, value] of Object.entries(await oauth.authHeaders(req.url))) {
      req.headers.set(key, value)
    }
    return req
  }

/** Stores a 401's body as the new token state, so a session the IdP invalidated behind our back surfaces
 * as an error instead of a token that looks fine and fails every call — see the same branch in the core's
 * `fetch.ts`. Re-rejects: this is not error handling, it is bookkeeping. */
export const unauthorizedInterceptor = (oauth: OAuth) => (error: any) => {
  if (error?.response?.status === 401) {
    // axios hands `data` over as a string when the body is HTML or empty, and a string is not token state
    const { data } = error.response
    oauth.setToken((typeof data === 'object' && data) || {})
  }
  return Promise.reject(error)
}

export interface AxiosInterceptors {
  authorizationInterceptor: (req: InternalAxiosRequestConfig) => Promise<InternalAxiosRequestConfig>
  unauthorizedInterceptor: (error: any) => Promise<never>
}

/** For attaching to an axios instance you already have. */
export const createAxiosInterceptors = (oauth: OAuth): AxiosInterceptors => ({
  authorizationInterceptor: authorizationInterceptor(oauth),
  unauthorizedInterceptor: unauthorizedInterceptor(oauth)
})

/** A fresh axios instance with both interceptors attached.
 *
 * One per OAuth instance, never a shared default: on the server two concurrent requests sharing
 * interceptors would mean one request's bearer on another request's call. */
export const createAxiosClient = (oauth: OAuth, defaults?: CreateAxiosDefaults): AxiosInstance => {
  const client = axios.create({ headers: { 'Content-Type': 'application/json' }, ...defaults })
  const { authorizationInterceptor: onRequest, unauthorizedInterceptor: onError } = createAxiosInterceptors(oauth)
  client.interceptors.request.use(onRequest)
  client.interceptors.response.use(response => response, onError)
  return client
}
