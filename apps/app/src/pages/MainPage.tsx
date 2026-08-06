import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { useAuth } from 'react-oauth-oidc'
import OAuth, { type OAuthProps } from 'react-oauth-oidc/component'
import LanguageMenu from '@/components/LanguageMenu'
import ThemeToggle from '@/components/ThemeToggle'

const { VITE_OAUTH_TYPE, VITE_OAUTH_STATE, VITE_APP_DOMAIN } = import.meta.env

export const MainPage = () => {
  const { t } = useTranslation()
  const { isLoggedIn, user, token } = useAuth()

  const origin = VITE_APP_DOMAIN || globalThis.location?.origin
  const config: OAuthProps = {
    responseType: VITE_OAUTH_TYPE || 'code',
    redirectUri: `${origin}/oauth_callback`,
    logoutRedirectUri: `${origin}/`,
    accessType: 'offline',
    // a fresh value per load unless one is pinned: the IdP echoes it back, which is what lets the
    // callback tell its own redirect apart from a forged one
    state: VITE_OAUTH_STATE || globalThis.crypto?.randomUUID(),
    labels: {
      login: t('oauth.login'),
      logout: t('oauth.logout'),
      username: t('oauth.username'),
      password: t('oauth.password'),
      usernameRequired: t('oauth.usernameRequired'),
      passwordRequired: t('oauth.passwordRequired'),
      usernameLength: t('oauth.usernameLength'),
      passwordLength: t('oauth.passwordLength'),
      account: t('oauth.account')
    }
  }

  return (
    <>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('title')}
          </Typography>
          <LanguageMenu />
          <ThemeToggle />
          <OAuth {...config} />
        </Toolbar>
      </AppBar>
      <Box sx={{ p: 3 }}>
        <Typography variant="body1" gutterBottom>
          {isLoggedIn ? `${t('signedInAs')} ${user?.name || user?.email || user?.sub || '—'}` : t('notSignedIn')}
        </Typography>
        {isLoggedIn && (
          <Paper variant="outlined" sx={{ p: 2, mt: 2, overflowX: 'auto' }}>
            <Typography component="pre" variant="body2" sx={{ m: 0 }}>
              {JSON.stringify({ token, user }, null, 2)}
            </Typography>
          </Paper>
        )}
      </Box>
    </>
  )
}

export default MainPage
