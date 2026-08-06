import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { ConfigContext } from './config'
import type { TokenContext } from './token'

export const createHttp = (
  { isPathIgnored }: Pick<ConfigContext, 'isPathIgnored'>,
  { setToken, accessToken, checkToken }: Pick<TokenContext, 'setToken' | 'accessToken' | 'checkToken'>
) => {
  const authorizationInterceptor = async (req: InternalAxiosRequestConfig) => {
    if (!isPathIgnored(req.url)) {
      await checkToken()
      const bearer = accessToken()
      if (bearer) {
        req.headers.setAuthorization(bearer)
      }
    }
    return req
  }

  const unauthorizedInterceptor = (error: any) => {
    if (error.response?.status === 401) {
      setToken(error.response.data)
    }
    return Promise.reject(error)
  }

  // a fresh instance per OAuth instance: on SSR two concurrent requests must never share interceptors
  const http = axios.create({
    headers: {
      'Content-Type': 'application/json'
    }
  })
  http.interceptors.request.use(authorizationInterceptor)
  http.interceptors.response.use(res => res, unauthorizedInterceptor)

  return {
    http,
    authorizationInterceptor,
    unauthorizedInterceptor
  }
}

export type HttpContext = ReturnType<typeof createHttp>
