import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { defaultOAuthFunctions as fns } from './functions'
import { type OAuthFetch, OAuthType } from './types'

/** `defaultOAuthFunctions` is mocked out by every other spec, so until now the actual wire format was
 * untested — the one part of this library that has to match an RFC. Against a real local server, so what
 * is asserted is what was sent. */

let server: ReturnType<typeof Bun.serve>
let requests: Array<{ path: string; method: string; body: Record<string, string>; headers: Headers }>
let respond: (path: string) => Response

const url = (path: string) => `http://localhost:${server.port}${path}`
const last = () => requests[requests.length - 1]

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async request => {
      const path = new URL(request.url).pathname
      const raw = await request.text()
      requests.push({
        path,
        method: request.method,
        body: Object.fromEntries(new URLSearchParams(raw)),
        headers: request.headers
      })
      return respond(path)
    }
  })
})

afterAll(() => server.stop(true))

beforeEach(() => {
  requests = []
  respond = () => Response.json({ access_token: 'issued', token_type: 'Bearer', expires_in: 3600 })
})

describe('form encoding', () => {
  it('sends application/x-www-form-urlencoded, not JSON', async () => {
    await fns.resourceOwnerLogin({ username: 'jane', password: 'pw' }, { tokenPath: url('/token'), clientId: 'c' })

    expect(last().method).toBe('POST')
    expect(last().headers.get('content-type')).toContain('application/x-www-form-urlencoded')
    expect(last().headers.get('accept')).toBe('application/json')
  })

  it('omits an absent client_secret instead of sending the string "undefined"', async () => {
    await fns.resourceOwnerLogin({ username: 'jane', password: 'pw' }, { tokenPath: url('/token'), clientId: 'c' })

    expect('client_secret' in last().body).toBe(false)
    expect(last().body).toEqual({ client_id: 'c', grant_type: 'password', username: 'jane', password: 'pw' })
  })

  it('includes client_secret and scope when configured', async () => {
    await fns.resourceOwnerLogin(
      { username: 'jane', password: 'pw' },
      { tokenPath: url('/token'), clientId: 'c', clientSecret: 's', scope: 'openid profile' }
    )

    expect(last().body.client_secret).toBe('s')
    expect(last().body.scope).toBe('openid profile')
  })
})

describe('resourceOwnerLogin', () => {
  it('marks the grant on the returned token', async () => {
    const token = await fns.resourceOwnerLogin({ username: 'jane', password: 'pw' }, { tokenPath: url('/token'), clientId: 'c' })

    expect(token?.access_token).toBe('issued')
    expect(token?.type).toBe(OAuthType.RESOURCE)
  })

  it('returns undefined without a tokenPath or clientId', async () => {
    expect(await fns.resourceOwnerLogin({ username: 'u', password: 'p' }, {} as any)).toBeUndefined()
    expect(requests).toEqual([])
  })
})

describe('clientCredentialLogin', () => {
  it('posts the client_credentials grant', async () => {
    const token = await fns.clientCredentialLogin({ tokenPath: url('/token'), clientId: 'c', clientSecret: 's' })

    expect(last().body.grant_type).toBe('client_credentials')
    expect(token?.type).toBe(OAuthType.CLIENT_CREDENTIAL)
  })
})

describe('refresh', () => {
  it('posts the refresh grant and preserves the original grant type', async () => {
    const token = await fns.refresh(
      { refresh_token: 'rt', type: OAuthType.AUTHORIZATION_CODE },
      { tokenPath: url('/token'), clientId: 'c' }
    )

    expect(last().body).toEqual({ client_id: 'c', grant_type: 'refresh_token', refresh_token: 'rt' })
    // the response does not restate the grant, but the session is still an authorization-code session
    expect(token?.type).toBe(OAuthType.AUTHORIZATION_CODE)
  })

  it('returns the original token untouched when there is nothing to refresh with', async () => {
    const original = { access_token: 'at' }

    expect(await fns.refresh(original, { tokenPath: url('/token') })).toBe(original)
    expect(requests).toEqual([])
  })
})

describe('authorize', () => {
  it('exchanges the code with the verifier and redirect_uri', async () => {
    const token = await fns.authorize(
      { code: 'abc', redirect_uri: 'https://app/cb', code_verifier: 'v' },
      { tokenPath: url('/token'), clientId: 'c' }
    )

    expect(last().body).toEqual({
      code: 'abc',
      client_id: 'c',
      redirect_uri: 'https://app/cb',
      grant_type: 'authorization_code',
      code_verifier: 'v'
    })
    expect(token?.type).toBe(OAuthType.AUTHORIZATION_CODE)
  })

  it('does nothing without a code', async () => {
    const original = {}
    expect(await fns.authorize(original, { tokenPath: url('/token') })).toBe(original)
    expect(requests).toEqual([])
  })
})

describe('revoke', () => {
  it('revokes both tokens, each with its hint', async () => {
    respond = () => new Response(null, { status: 200 })

    await fns.revoke({ access_token: 'at', refresh_token: 'rt' }, { revokePath: url('/revoke'), clientId: 'c' })

    expect(requests.map(r => [r.body.token, r.body.token_type_hint])).toEqual([
      ['at', 'access_token'],
      ['rt', 'refresh_token']
    ])
  })

  it('does not reject when the IdP rejects an already-invalid token', async () => {
    // Google answers 4xx here. If this threw, logout would abort and the local session would survive.
    respond = () => Response.json({ error: 'invalid_token' }, { status: 400 })

    await expect(fns.revoke({ access_token: 'stale' }, { revokePath: url('/revoke') })).resolves.toBeUndefined()
  })

  it('is a no-op without a revokePath', async () => {
    await fns.revoke({ access_token: 'at' }, {})
    expect(requests).toEqual([])
  })
})

describe('openIdConfiguration', () => {
  it('gets the discovery document with the client_id', async () => {
    respond = () => Response.json({ token_endpoint: '/t', authorization_endpoint: '/a' })

    const discovered = await fns.openIdConfiguration({ issuerPath: url('/realms/r'), clientId: 'c' })

    expect(last().path).toBe('/realms/r/.well-known/openid-configuration')
    expect(last().method).toBe('GET')
    expect(discovered?.token_endpoint).toBe('/t')
  })

  it('returns undefined without an issuerPath', async () => {
    expect(await fns.openIdConfiguration({})).toBeUndefined()
    expect(requests).toEqual([])
  })
})

describe('userInfo', () => {
  it('goes through the request function it is handed, so the bearer is attached', async () => {
    respond = () => Response.json({ sub: 'abc', name: 'Jane' })
    const authorized: OAuthFetch = (input, init) => fetch(input, { ...init, headers: { ...init?.headers, Authorization: 'Bearer at' } })

    const user = await fns.userInfo({ userPath: url('/me') } as any, authorized)

    expect(user?.name).toBe('Jane')
    expect(last().headers.get('authorization')).toBe('Bearer at')
  })
})

describe('introspect', () => {
  it('authenticates with basic client credentials', async () => {
    respond = () => Response.json({ active: true })

    await fns.introspect({ access_token: 'at' }, { introspectionPath: url('/introspect'), clientId: 'c', clientSecret: 's' })

    expect(last().headers.get('authorization')).toBe(`Basic ${btoa('c:s')}`)
    expect(last().body.token).toBe('at')
  })
})

describe('error handling', () => {
  it('returns an RFC 6749 error body as the payload rather than throwing', async () => {
    // §5.2: the error *is* the response, with a 400. It has to reach the token, not become an exception.
    respond = () => Response.json({ error: 'invalid_grant', error_description: 'Bad credentials' }, { status: 400 })

    const token = await fns.resourceOwnerLogin({ username: 'jane', password: 'wrong' }, { tokenPath: url('/token'), clientId: 'c' })

    expect(token?.error).toBe('invalid_grant')
    expect(token?.error_description).toBe('Bad credentials')
  })

  it('resolves undefined when the transport fails outright', async () => {
    // nothing listening: a connection error must not propagate, or a background revalidation takes the
    // app down with it
    const token = await fns.clientCredentialLogin({ tokenPath: 'http://127.0.0.1:1/token', clientId: 'c' })

    expect(token).toBeUndefined()
  })

  it('resolves undefined when the body is not JSON', async () => {
    respond = () => new Response('<html>gateway timeout</html>', { status: 504 })

    expect(await fns.clientCredentialLogin({ tokenPath: url('/token'), clientId: 'c' })).toBeUndefined()
  })
})
