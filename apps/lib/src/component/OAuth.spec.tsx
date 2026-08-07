import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { type OAuth, OAuthType } from '../core/types'
import { OAuthProvider } from '../provider'
import { createOAuth, flush, idToken, installStorage, mockOAuthFunctions, registerOAuthCleanup } from '../test-utils'
import { OAuth as OAuthComponent, type OAuthProps } from './OAuth'

const local = installStorage()
registerOAuthCleanup()

let oauth: OAuth
let functions: ReturnType<typeof mockOAuthFunctions>

beforeEach(() => {
  local.clear()
  functions = mockOAuthFunctions()
  oauth = createOAuth({ config: { tokenPath: '/t', clientId: 'c', authorizePath: 'https://idp/auth' }, functions })
})

afterEach(cleanup)

// flushed before querying so the id_token decode and any userinfo fetch have settled
const mount = async (props: OAuthProps = {}) => {
  const result = render(
    <OAuthProvider oauth={oauth}>
      <OAuthComponent {...props} />
    </OAuthProvider>
  )
  await act(async () => {
    await flush()
  })
  return result
}

const openMenu = async () => {
  act(() => screen.getByRole('button', { name: 'Account' }).click())
  await waitFor(() => screen.getByRole('button', { name: /Login|Logout/ }))
}

describe('<OAuth>', () => {
  it('server-renders the signed-out view, and a stored token cannot change that', () => {
    // the token is seeded from localStorage, which the server cannot see. The hooks pass a server
    // snapshot of an empty token, so this pass is signed-out whatever the store holds — which is what
    // lets hydration agree without a mount gate. Only `renderToString` shows it: Testing Library's
    // `render()` flushes effects and React has already re-read the store by the time it returns.
    const markup = () =>
      renderToString(
        <OAuthProvider oauth={oauth}>
          <OAuthComponent />
        </OAuthProvider>
      )

    const signedOut = markup()
    oauth.setToken({ access_token: 'at', token_type: 'Bearer', id_token: idToken({ name: 'Jane' }) })

    expect(markup()).toBe(signedOut)
    // the outlined avatar is the signed-out one, and there is no way to sign out of a session the
    // server does not know about
    expect(signedOut).toContain('AccountCircleOutlinedIcon')
    expect(signedOut).not.toContain('AccountCircleIcon')
    expect(signedOut).not.toContain('Logout')
    // and it is no longer blank — the account button is in the first paint
    expect(signedOut).toContain('aria-label="Account"')
  })

  it('shows the username/password form for the resource-owner grant', async () => {
    await mount()
    await openMenu()

    expect(screen.getByLabelText(/Username/)).toBeDefined()
    expect(screen.getByLabelText(/Password/)).toBeDefined()
  })

  it('signs in with the entered credentials', async () => {
    functions.resourceOwnerLogin.mockResolvedValue({ access_token: 'ro', token_type: 'Bearer', type: OAuthType.RESOURCE })
    await mount({ username: 'jane', password: 'secret' })
    await openMenu()

    await act(async () => {
      screen.getByRole('button', { name: 'Login' }).click()
      await flush()
    })

    expect(functions.resourceOwnerLogin).toHaveBeenCalledWith({ username: 'jane', password: 'secret' }, expect.anything())
  })

  it('refuses to submit empty credentials and says why', async () => {
    await mount()
    await openMenu()

    await act(async () => {
      screen.getByRole('button', { name: 'Login' }).click()
      await flush()
    })

    expect(functions.resourceOwnerLogin).not.toHaveBeenCalled()
    expect(screen.getByText('Name is required')).toBeDefined()
    expect(screen.getByText('Password is required')).toBeDefined()
  })

  it('shows a single login button for the redirect flows instead of a form', async () => {
    await mount({ responseType: OAuthType.AUTHORIZATION_CODE, redirectUri: 'https://app/cb' })
    await openMenu()

    expect(screen.queryByLabelText(/Password/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Login' })).toBeDefined()
  })

  it('shows the user card and logs out when authorized', async () => {
    oauth.setToken({ access_token: 'at', token_type: 'Bearer', id_token: idToken({ name: 'Jane Doe', email: 'jane@acme.io' }) })
    await mount()
    await openMenu()

    expect(screen.getByText('Jane Doe')).toBeDefined()
    expect(screen.getByText('jane@acme.io')).toBeDefined()

    await act(async () => {
      screen.getByRole('button', { name: 'Logout' }).click()
      await flush()
    })

    expect(functions.revoke).toHaveBeenCalled()
  })

  it('still offers logout when the claims carry no name or email', async () => {
    // some providers return only a `sub`; the logout control lives in the user row, so the row has
    // to render regardless or there is no way out of the session
    oauth.setToken({ access_token: 'at', token_type: 'Bearer', id_token: idToken({ sub: 'user-42' }) })
    await mount()
    await openMenu()

    expect(screen.getByText('user-42')).toBeDefined()

    await act(async () => {
      screen.getByRole('button', { name: 'Logout' }).click()
      await flush()
    })

    expect(functions.revoke).toHaveBeenCalled()
  })

  it('surfaces a flow error and lets it be dismissed', async () => {
    await mount()
    await act(async () => {
      oauth.setToken({ error: 'access_denied', error_description: 'The user said no' })
      await flush()
    })
    act(() => screen.getByRole('button', { name: 'Account' }).click())

    await waitFor(() => screen.getByText('The user said no'))

    await act(async () => {
      screen.getByRole('button', { name: /close/i }).click()
      await flush()
    })
    expect(screen.queryByText('The user said no')).toBeNull()
  })

  it('takes the alert down when the error clears, without needing a dismiss', async () => {
    await mount()
    await act(async () => {
      oauth.setToken({ error: 'invalid_request', error_description: 'Invalid Credentials' })
      await flush()
    })
    act(() => screen.getByRole('button', { name: 'Account' }).click())
    await waitFor(() => screen.getByText('Invalid Credentials'))

    // what a successful logout does — the alert must follow the state, or it lingers with nothing in it
    await act(async () => {
      oauth.setToken({})
      await flush()
    })

    expect(screen.queryByText('Invalid Credentials')).toBeNull()
  })

  it('renders the labels it is given, which is how the app translates it', async () => {
    await mount({ labels: { login: 'Anmelden', username: 'Benutzername', password: 'Passwort', account: 'Konto' } })
    act(() => screen.getByRole('button', { name: 'Konto' }).click())
    await waitFor(() => screen.getByRole('button', { name: 'Anmelden' }))

    expect(screen.getByLabelText(/Benutzername/)).toBeDefined()
    expect(screen.getByLabelText(/Passwort/)).toBeDefined()
  })

  it('lets the user card be replaced wholesale', async () => {
    oauth.setToken({ access_token: 'at', token_type: 'Bearer', id_token: idToken({ name: 'Jane' }) })
    await mount({ renderUserInfo: ({ user }) => <span data-testid="custom">{`custom:${user?.name}`}</span> })
    act(() => screen.getByRole('button', { name: 'Account' }).click())

    await waitFor(() => screen.getByTestId('custom'))
    expect(screen.getByTestId('custom').textContent).toBe('custom:Jane')
  })
})
