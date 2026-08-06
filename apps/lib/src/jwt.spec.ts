import { describe, expect, it } from 'bun:test'
import { createJwt } from './jwt'
import { idToken } from './test-utils'

// no jwksUri + strictJwt off → the local parseJwt path is exercised
const jwt = createJwt({ config: () => ({}) as any, strictJwt: () => false })

describe('jwt parse (no jwks)', () => {
  it('returns {} without a token', async () => {
    expect(await jwt()).toEqual({})
  })

  it('parses a plain ascii payload', async () => {
    const payload = { sub: 'abc', admin: true }
    expect(await jwt(idToken(payload))).toEqual(payload)
  })

  it('parses base64url payloads containing - and _', async () => {
    const payload = { sub: '1234567890', name: 'ÿÿÿ' } // utf-8 bytes hit the base64url -/_ alphabet
    const token = idToken(payload)
    expect(token.split('.')[1]).toMatch(/[-_]/) // guard: the regression is actually exercised
    expect(await jwt(token)).toEqual(payload)
  })

  it('parses unpadded payload lengths', async () => {
    // vary payload length so the stripped base64 padding must be reconstructed
    for (const name of ['a', 'ab', 'abc', 'abcd']) {
      const payload = { name }
      expect(await jwt(idToken(payload))).toEqual(payload)
    }
  })

  it('returns {} for a malformed token rather than throwing', async () => {
    expect(await jwt('not-a-jwt')).toEqual({})
  })
})

describe('jwt verify (jwks configured)', () => {
  it('rejects a token it cannot verify against the jwks', async () => {
    const strict = createJwt({
      // port 1 refuses immediately — no DNS, no timeout, no dependency on the machine's network
      config: () => ({ jwksUri: 'http://127.0.0.1:1/jwks', issuerPath: 'https://idp', clientId: 'c' }) as any,
      strictJwt: () => true
    })

    // the remote set is unreachable, which is exactly the failure path worth pinning: an
    // unverifiable token must surface as an error, never fall back to the unsigned parse
    expect(await strict(idToken({ sub: 'abc' }))).toEqual({ error: 'Invalid token' })
  })
})
