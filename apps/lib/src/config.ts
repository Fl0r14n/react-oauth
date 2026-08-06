import { createStore } from 'zustand/vanilla'
import type { OAuthConfig, OAuthTypeConfig } from './types'

export const createConfig = (cfg?: OAuthConfig) => {
  const configStore = createStore<{ oauthConfig: OAuthConfig }>(() => ({
    oauthConfig: {
      storageKey: 'token',
      ignorePaths: [],
      strictJwt: true,
      ...cfg
    }
  }))

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

  const isPathIgnored = (url?: string) => (!!url && oauthConfig().ignorePaths?.some(pattern => pattern.test(url))) || false

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
