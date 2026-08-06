import { describe, expect, it } from 'bun:test'
import { type OAuthConfig, OAuthStatus, type OAuthToken, OAuthType, type UserInfo } from './types'

/** Mostly compile-time. `tsc --noEmit` covers src/**, so a `@ts-expect-error` here fails the build if
 * the error it expects stops happening — which is the only way to pin a *tightening*. Without these,
 * putting an `[x: string]: any` index signature back would break nothing and no one would notice. */

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

  it('rejects what used to be silently accepted', () => {
    // @ts-expect-error a typo'd field is a typo, not a provider extension
    const typo: OAuthToken = { access_tokn: 'at' }
    expect(typo).toBeDefined()

    const token: OAuthToken = { access_token: 'at' }
    // @ts-expect-error reading an undeclared claim needs the type parameter
    expect(token.groups).toBeUndefined()
  })
})

describe('UserInfo', () => {
  it('types custom claims at the point of use', () => {
    const user: UserInfo<{ groups: string[] }> = { sub: 'abc', groups: ['admin'] }

    const groups: string[] = user.groups
    expect(groups).toEqual(['admin'])
  })

  it('still rejects undeclared claims without the parameter', () => {
    const user: UserInfo = { sub: 'abc' }
    // @ts-expect-error `groups` is not a standard OIDC claim
    expect(user.groups).toBeUndefined()
  })
})

describe('OAuthConfig', () => {
  it('takes extra fields by naming them', () => {
    const config: OAuthConfig<{ tenant: string }> = { storageKey: 'token', tenant: 'acme' }

    const tenant: string = config.tenant
    expect(tenant).toBe('acme')
  })

  it('catches a misspelled option instead of ignoring it', () => {
    // @ts-expect-error `storagekey` is not `storageKey` — previously indistinguishable from a real option
    const config: OAuthConfig = { storagekey: 'token' }
    expect(config).toBeDefined()
  })
})
