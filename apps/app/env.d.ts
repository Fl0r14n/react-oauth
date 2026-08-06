/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_THEME?: 'light' | 'dark'
  readonly VITE_APP_DOMAIN?: string
  readonly VITE_OAUTH_ISSUER_PATH?: string
  readonly VITE_OAUTH_AUTHORIZE_PATH?: string
  readonly VITE_OAUTH_TOKEN_PATH?: string
  readonly VITE_OAUTH_LOGOUT_PATH?: string
  readonly VITE_OAUTH_CLIENT_ID?: string
  readonly VITE_OAUTH_CLIENT_SECRET?: string
  readonly VITE_OAUTH_SCOPE?: string
  readonly VITE_OAUTH_TYPE?: string
  readonly VITE_OAUTH_STATE?: string
  readonly VITE_OAUTH_PKCE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
