import { createStore } from './store'
import type { OAuthConfig, OAuthTypeConfig } from './types'

export const createConfig = (cfg?: OAuthConfig) => {
  const configStore = createStore<{ oauthConfig: OAuthConfig }>({
    oauthConfig: {
      storageKey: 'token',
      ignorePaths: [],
      strictJwt: true,
      ...cfg
    }
  })

  const oauthConfig = () => configStore.getState().oauthConfig
  const setOAuthConfig = (patch: Partial<OAuthConfig>) => configStore.setState({ oauthConfig: { ...oauthConfig(), ...patch } })

  const config = () => oauthConfig().config
  const setConfig = (patch?: Partial<OAuthTypeConfig>) =>
    setOAuthConfig({ config: { ...oauthConfig().config, ...patch } as OAuthTypeConfig })

  const ignorePath = (pattern: RegExp) => {
    const paths = oauthConfig().ignorePaths ?? []
    if (!paths.some(p => p.source === pattern.source && p.flags === pattern.flags)) {
      setOAuthConfig({ ignorePaths: [...paths, pattern] })
    }
  }

  /** Tests the URL as given *and* its pathname, so an anchored `/^\/public/` works whether the caller
   * passed `/public/x` or `https://api.example.com/public/x`. Matching only the raw string made anchored
   * patterns silently never fire for absolute URLs; matching only the pathname would have broken patterns
   * written against a host. Both is a superset of the old behaviour. */
  const isPathIgnored = (url?: string) => {
    const patterns = oauthConfig().ignorePaths ?? []
    if (!url || !patterns.length) return false
    const candidates = [url]
    try {
      // the base makes a relative path parseable; it is never used for anything else
      candidates.push(new URL(url, 'http://localhost').pathname)
    } catch {
      /* not a parseable URL — the raw string is all there is to match */
    }
    return patterns.some(pattern => candidates.some(candidate => pattern.test(candidate)))
  }

  const storageKey = () => oauthConfig().storageKey || 'token'
  const setStorageKey = (storageKey: string) => setOAuthConfig({ storageKey })

  const strictJwt = () => oauthConfig().strictJwt

  return {
    configStore,
    oauthConfig,
    setOAuthConfig,
    config,
    setConfig,
    ignorePath,
    isPathIgnored,
    storageKey,
    setStorageKey,
    strictJwt
  }
}

export type ConfigContext = ReturnType<typeof createConfig>
