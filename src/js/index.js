import React from 'react';
import ReactDOM from 'react-dom';
import Oauth from './modules/Oauth';

require('file!../index.html');

const app = document.getElementById('app');

const oauthServer = 'http://localhost:8000';
const redirectUri = window.location.origin;
const profileUri = oauthServer + '/accounts/me/';
ReactDOM.render(
  <Oauth text="Login"
         site={oauthServer}
         autorizePath="/o/authorize/"
         clientId="0CbDbFO4Vv1sS23DvTKkC8u7Rdllkkeh4uafCMZn"
         redirectUri={redirectUri}
         profileUri={profileUri}
         revokeUri="/o/revoke_token/"
         scope="write"/>, app);
