import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { useEffect, useRef } from 'react'
import { useOAuth } from 'react-oauth-oidc'
import { useNavigate, useSearchParams } from 'react-router'

/** An effect rather than a route loader: the exchange needs the `code_verifier` from browser storage,
 * and a loader also runs on the server — where an exchange without the verifier would still burn the
 * single-use code at the IdP, leaving the browser's own exchange to fail with `invalid_grant`. */
export const OAuthCallbackPage = () => {
  const { oauthCallback } = useOAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // the code is single-use and StrictMode double-invokes effects in development
  const exchanged = useRef(false)

  useEffect(() => {
    if (exchanged.current) return
    exchanged.current = true
    const returnUrl = searchParams.get('returnUrl')
    void oauthCallback(globalThis.location?.href).finally(() => navigate(returnUrl || '/', { replace: true }))
  }, [oauthCallback, navigate, searchParams])

  return (
    <Stack sx={{ minHeight: '50vh', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Stack>
  )
}

export default OAuthCallbackPage
