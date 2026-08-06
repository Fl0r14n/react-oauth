import { beforeEach, describe, expect, it } from 'bun:test'
import { act, cleanup, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useOAuth, useOAuthConfig, useOAuthHttp, useOAuthToken, useOAuthUser, useStoreValue } from './hooks'
import { OAuthProvider } from './provider'
import { createStore } from './store'
import { createOAuth, flush, idToken, installStorage, mockOAuthFunctions, registerOAuthCleanup } from './test-utils'
import { type OAuth, OAuthStatus, OAuthType, type ResourceOwnerConfig } from './types'

const local = installStorage()
registerOAuthCleanup()

let oauth: OAuth

beforeEach(() => {
  local.clear()
  oauth = createOAuth({ config: { tokenPath: '/t', clientId: 'c' }, functions: mockOAuthFunctions() })
})

const mount = (ui: React.ReactNode) => render(<OAuthProvider oauth={oauth}>{ui}</OAuthProvider>)

describe('useOAuth', () => {
  const Probe = () => {
    const { status, isAuthorized, hasError, errorDescription, accessToken } = useOAuth()
    return <span data-testid="p">{`${status}|${isAuthorized}|${hasError}|${errorDescription ?? '-'}|${accessToken ?? '-'}`}</span>
  }

  it('re-renders derived protocol state when the token changes', () => {
    mount(<Probe />)
    expect(screen.getByTestId('p').textContent).toBe(`${OAuthStatus.NOT_AUTHORIZED}|false|false|-|-`)

    act(() => oauth.setToken({ access_token: 'at', token_type: 'Bearer', expires: Date.now() + 60_000 }))
    expect(screen.getByTestId('p').textContent).toBe(`${OAuthStatus.AUTHORIZED}|true|false|-|Bearer at`)

    act(() => oauth.setToken({ error: 'access_denied', error_description: 'nope' }))
    expect(screen.getByTestId('p').textContent).toBe(`${OAuthStatus.DENIED}|false|true|nope|-`)
    cleanup()
  })

  it('re-renders when the config changes — the autoconfig case', () => {
    const ConfigProbe = () => <span data-testid="c">{(useOAuth().config as ResourceOwnerConfig)?.tokenPath ?? '-'}</span>
    mount(<ConfigProbe />)
    expect(screen.getByTestId('c').textContent).toBe('/t')

    act(() => oauth.setConfig({ tokenPath: '/discovered' }))

    expect(screen.getByTestId('c').textContent).toBe('/discovered')
    cleanup()
  })

  it('re-renders when the authorization redirect echoes a state back', async () => {
    const StateProbe = () => <span data-testid="s">{useOAuth().state ?? '-'}</span>
    mount(<StateProbe />)

    await act(async () => {
      await oauth.oauthCallback('https://h/cb#access_token=at&state=from-idp')
    })

    expect(screen.getByTestId('s').textContent).toBe('from-idp')
    cleanup()
  })
})

describe('useOAuthToken', () => {
  const Probe = () => {
    const { value, set } = useOAuthToken()
    return (
      <button type="button" data-testid="t" onClick={() => set({ access_token: 'set-from-ui', type: OAuthType.RESOURCE })}>
        {value.access_token ?? '-'}
      </button>
    )
  }

  it('reads and writes the live token', () => {
    mount(<Probe />)
    expect(screen.getByTestId('t').textContent).toBe('-')

    act(() => screen.getByTestId('t').click())

    expect(screen.getByTestId('t').textContent).toBe('set-from-ui')
    expect(oauth.token().access_token).toBe('set-from-ui')
    cleanup()
  })
})

describe('useOAuthUser', () => {
  it('re-renders once the id_token claims are decoded', async () => {
    const Probe = () => <span data-testid="u">{useOAuthUser()?.name ?? '-'}</span>
    mount(<Probe />)

    await act(async () => {
      oauth.setToken({ id_token: idToken({ name: 'Jane' }) })
      await flush()
    })

    expect(screen.getByTestId('u').textContent).toBe('Jane')
    cleanup()
  })
})

describe('useOAuthConfig / useOAuthHttp', () => {
  it('exposes the live config and the instance axios client', () => {
    let http: unknown
    const Probe = () => {
      http = useOAuthHttp()
      return <span data-testid="k">{useOAuthConfig().storageKey}</span>
    }
    mount(<Probe />)
    expect(screen.getByTestId('k').textContent).toBe('token')

    act(() => oauth.setStorageKey('tenant.token'))

    expect(screen.getByTestId('k').textContent).toBe('tenant.token')
    expect(http).toBe(oauth.http)
    cleanup()
  })
})

describe('useStoreValue', () => {
  it('re-renders on a store write and ignores unrelated ones', () => {
    const store = createStore({ a: 1, b: 1 })
    let renders = 0
    const Probe = () => {
      renders++
      return <span data-testid="a">{useStoreValue(store, state => state.a)}</span>
    }
    render(<Probe />)
    expect(screen.getByTestId('a').textContent).toBe('1')
    const baseline = renders

    act(() => store.setState({ a: 2, b: 1 }))
    expect(screen.getByTestId('a').textContent).toBe('2')

    // the selected value is unchanged, so useSyncExternalStore bails out of re-rendering
    act(() => store.setState({ a: 2, b: 9 }))
    expect(renders).toBe(baseline + 1)
    cleanup()
  })

  it('renders the current state on the server, not the state at store creation', () => {
    const store = createStore({ a: 'initial' })
    const Probe = () => <span>{useStoreValue(store, state => state.a)}</span>

    // stands in for a token restored from storage or a config filled in by discovery — written after
    // the store was built but before renderToString. Passing a creation-time getServerSnapshot, which
    // is what zustand's own useStore does, would render 'initial' here.
    store.setState({ a: 'written after creation' })

    expect(renderToString(<Probe />)).toContain('written after creation')
  })
})
