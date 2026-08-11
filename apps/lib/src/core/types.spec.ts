import { describe, expect, it } from 'bun:test'
import { mockOAuthFunctions } from '../test-utils'
import { createOAuth } from './module'
import { type OAuthConfig, OAuthStatus, type OAuthToken, OAuthType, type UserInfo } from './types'

/** Mostly compile-time. `tsc --noEmit` covers src/**, so a `@ts-expect-error` here fails the build if the
 * error it expects stops happening — the only way to pin a *tightening*.
 *
 * The asymmetry these pin is deliberate: `OAuthToken` and `UserInfo` are open, because an IdP may send
 * whatever it likes and the value arrives parsed off the wire. `OAuthConfig` is closed, because you write
 * it by hand and a misspelled option has nothing else to catch it. */

describe('OAuthType / OAuthStatus', () => {
  it('are plain values, usable without a value import for the type', () => {
    expect(OAuthType.RESOURCE).toBe('password')
    expect(OAuthType.AUTHORIZATION_CODE).toBe('code')
    expect(OAuthType.IMPLICIT).toBe('token')
    expect(OAuthType.CLIENT_CREDENTIAL).toBe('client_credentials')
    expect(OAuthStatus.AUTHORIZED).toBe('AUTHORIZED')
  })

  it('narrow as a union in a type position', () => {
    const fromTheWire = 'code'
    const asType: OAuthType = fromTheWire
    expect(asType).toBe(OAuthType.AUTHORIZATION_CODE)

    // @ts-expect-error 'nonsense' is not one of the four grants
    const invalid: OAuthType = 'nonsense'
    expect(invalid as string).toBe('nonsense')
  })
})

describe('OAuthToken', () => {
  it('carries provider-specific claims through the type parameter', () => {
    const token: OAuthToken<{ id_token_expires_in: number }> = {
      access_token: 'at',
      token_type: 'Bearer',
      id_token_expires_in: 3600
    }

    // typed, not `any` — this would have been `any` under the old index signature
    const expiry: number = token.id_token_expires_in
    expect(expiry).toBe(3600)
  })

  it('declares the fields the library itself stashes across a redirect', () => {
    const mid: OAuthToken = { redirect_uri: 'https://app/cb', code_verifier: 'v', nonce: 'n', expires: 1 }
    expect(mid.redirect_uri).toBe('https://app/cb')
  })

  it('accepts whatever else the provider sends', () => {
    // an IdP's own fields are not typos: Keycloak sends session_state, OCC sends customerId
    const token: OAuthToken = { access_token: 'at', session_state: 'abc', customerId: 'cust-1' }
    expect(token.session_state).toBe('abc')
    // reachable without the type parameter — that is what the index signature is for
    expect(token.groups).toBeUndefined()
  })
})

describe('UserInfo', () => {
  it('types custom claims at the point of use', () => {
    const user: UserInfo<{ groups: string[] }> = { sub: 'abc', groups: ['admin'] }

    const groups: string[] = user.groups
    expect(groups).toEqual(['admin'])
  })

  it('accepts a claim set it has never heard of', () => {
    const user: UserInfo = { sub: 'abc', groups: ['admin'], 'urn:custom:tenant': 'acme' }
    expect(user.groups).toEqual(['admin'])
  })
})

describe('OAuthConfig', () => {
  it('takes extra fields by naming them', () => {
    const config: OAuthConfig<{ tenant: string }> = { storageKey: 'token', tenant: 'acme' }

    const tenant: string = config.tenant
    expect(tenant).toBe('acme')
  })

  it('catches a misspelled option instead of ignoring it — unlike the token, this one is hand-written', () => {
    // @ts-expect-error `storagekey` is not `storageKey` — previously indistinguishable from a real option
    const config: OAuthConfig = { storagekey: 'token' }
    expect(config).toBeDefined()
  })

  it('createOAuth takes extras through an annotation, and still catches a typo', () => {
    const config: OAuthConfig<{ tenant: string }> = { storageKey: 'token', tenant: 'acme', functions: mockOAuthFunctions() }
    const oauth = createOAuth(config)

    expect(oauth.oauthConfig().storageKey).toBe('token')
    expect((oauth.oauthConfig() as typeof config).tenant).toBe('acme')

    // @ts-expect-error the whole point: a misspelled option is rejected at the call site. Making
    // createOAuth generic would infer this typo as a legitimate extra field and accept it.
    createOAuth({ storagekey: 'token', functions: mockOAuthFunctions() }).dispose()
    oauth.dispose()
  })
})
