import { createContext, type ReactNode, useContext } from 'react'
import { getActiveOAuth } from './module'
import type { OAuth } from './types'

const OAuthContext = createContext<OAuth | undefined>(undefined)

export interface OAuthProviderProps {
  /** created in the app's bootstrap with `createOAuth(...)`, not here */
  oauth: OAuth
  children?: ReactNode
}

/** The instance is deliberately not created here — interceptors and route loaders need it before
 * anything renders, so the app builds it and passes it in.
 *
 * Optional on the client, where the module pointer answers too. Required for concurrent SSR. */
export const OAuthProvider = ({ oauth, children }: OAuthProviderProps) => <OAuthContext value={oauth}>{children}</OAuthContext>

/** Provider first, then {@link getActiveOAuth}. Throws when there is none, and on the server when the
 * fallback would be ambiguous. */
export const useOAuthInstance = (): OAuth => useContext(OAuthContext) ?? getActiveOAuth()
