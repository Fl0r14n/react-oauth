import { describe, expect, it } from 'bun:test'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useAuth } from './hooks'
import { OAuthProvider } from './provider'
import { createOAuth, installStorage, mockOAuthFunctions, registerOAuthCleanup } from './test-utils'
import { OAuthType } from './types'

installStorage()
registerOAuthCleanup()

const anOAuth = (storageKey: string) => createOAuth({ storageKey, functions: mockOAuthFunctions() })

const Status = () => {
  const { isLoggedIn, token } = useAuth()
  return <span data-testid="status">{isLoggedIn ? `in:${token.access_token}` : 'out'}</span>
}

describe('OAuthProvider', () => {
  it('re-renders when the token changes — the reason a getter is not enough', () => {
    const oauth = anOAuth('provider-a')
    render(
      <OAuthProvider oauth={oauth}>
        <Status />
      </OAuthProvider>
    )
    expect(screen.getByTestId('status').textContent).toBe('out')

    act(() => oauth.setToken({ access_token: 'abc', type: OAuthType.RESOURCE }))

    expect(screen.getByTestId('status').textContent).toBe('in:abc')
    cleanup()
  })

  it('keeps two concurrent instances apart', () => {
    const first = anOAuth('req-1')
    const second = anOAuth('req-2')
    first.setToken({ access_token: 'one', type: OAuthType.RESOURCE })
    second.setToken({ access_token: 'two', type: OAuthType.RESOURCE })

    render(
      <>
        <OAuthProvider oauth={first}>
          <Status />
        </OAuthProvider>
        <OAuthProvider oauth={second}>
          <Status />
        </OAuthProvider>
      </>
    )

    expect(screen.getAllByTestId('status').map(el => el.textContent)).toEqual(['in:one', 'in:two'])
    cleanup()
  })

  it('falls back to the last created instance when there is no provider', () => {
    const oauth = anOAuth('pointer')
    oauth.setToken({ access_token: 'ambient', type: OAuthType.RESOURCE })

    render(<Status />)

    expect(screen.getByTestId('status').textContent).toBe('in:ambient')
    cleanup()
  })
})
