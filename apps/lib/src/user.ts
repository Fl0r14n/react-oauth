import type { ConfigContext } from './config'
import type { HttpContext } from './http'
import type { Jwt } from './jwt'
import { createStore, watchStore } from './store'
import type { TokenContext } from './token'
import type { OAuthFunctions, UserInfo } from './types'

export const createUser = (
  { configStore, config }: Pick<ConfigContext, 'configStore' | 'config'>,
  { tokenStore, token, isAuthorized }: Pick<TokenContext, 'tokenStore' | 'token' | 'isAuthorized'>,
  { http }: Pick<HttpContext, 'http'>,
  functions: OAuthFunctions,
  jwt: Jwt
) => {
  const userStore = createStore<{ user?: UserInfo }>({})
  const user = () => userStore.getState().user

  const fromIdToken = async (idToken?: string) => {
    if (idToken) {
      userStore.setState({ user: await jwt(idToken) })
    }
  }
  const unwatchIdToken = watchStore(tokenStore, () => token()?.id_token, fromIdToken)
  void fromIdToken(token()?.id_token)

  const fetchUser = async () => {
    if (isAuthorized() && (config() as any)?.userPath) {
      const usr = await functions.userInfo(config(), http)
      if (usr) {
        userStore.setState({ user: usr })
      }
    }
  }
  const unwatchAuthorized = watchStore(tokenStore, isAuthorized, () => void fetchUser())
  const unwatchUserPath = watchStore(
    configStore,
    () => (config() as any)?.userPath,
    () => void fetchUser()
  )
  // fired eagerly: with a valid stored token and a statically configured userPath both sources are
  // already truthy at creation and never change — without this the fetch never happens
  void fetchUser()

  return {
    userStore,
    user,
    dispose: () => {
      unwatchIdToken()
      unwatchAuthorized()
      unwatchUserPath()
    }
  }
}

export type UserContext = ReturnType<typeof createUser>
