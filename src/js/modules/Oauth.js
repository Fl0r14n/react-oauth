import React from 'react';
import dispatcher from './dispatcher';
import $ from 'jquery';

var OauthEvents = {
  LOGOUT: 'oauth:logout',
  EXPIRED: 'oauth:expired',
  AUTHORIZED: 'oauth:autorized',
  DENIED: 'oauth:denied',
  PROFILE: 'ouath:profile'
}

export default class Oauth extends React.Component {

  constructor(props) {
    super();
    this.state = {
      status: OauthEvents.LOGOUT,
      authorizePath: props.autorizePath || '/oauth/authorize',
      responseType: props.responseType || 'token',
      text: props.text || 'Sign in',
      redirectUri: props.redirectUri || 'http://localhost/callback',
      site: props.site,
      clientId: props.clientId,
      scope: props.scope || '',
      state: props.state || ''
    };
    this.oauthToken = new OauthToken((props.storage === 'localStorage')? localStorage: sessionStorage);
    this.oauthToken.init();
    this.initView(props);
    dispatcher.register(this.handleActions.bind(this));
  }

  handleActions(action) {
    if(action === OauthEvents.EXPIRED) {
      this.expired();
    }
  }

  getUserProfile(props) {
    const {profileUri} = props;
    const token = this.oauthToken.get();
    if(token && token.access_token && profileUri) {
      this.serverRequest = $.ajax({
        url: profileUri,
        dataType: 'json',
        crossDomain: true,
      }).done((result)=> {
        this.setState({profile: result});
        dispatcher.dispatch(OauthEvents.PROFILE, result);
      });
    }
  }

  initView(props) {
    const token = this.oauthToken.get();
    if(!token) {
      this.oauthToken.del();
      this.state.status = OauthEvents.LOGOUT;
      return dispatcher.dispatch(OauthEvents.LOGOUT);
    }
    if(token.access_token) {
      this.state.status = OauthEvents.AUTHORIZED;
      dispatcher.dispatch(OauthEvents.AUTHORIZED);
      return this.getUserProfile(props);
    }
    if(token.error) {
      this.oauthToken.del();
      this.state.status = OauthEvents.DENIED;
      dispatcher.dispatch(OauthEvents.DENIED);
    }
  }

  authUrl() {
    const {site, authorizePath, responseType, clientId, redirectUri, scope, state} = this.state,
          appendChar = authorizePath.indexOf('?') === -1 ? '?': '&';
    return `${site}${authorizePath}${appendChar}response_type=${responseType}&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`
  }

  login() {
    location.replace(this.authUrl());
  }

  logout() {
    this.oauthToken.del();
    this.setState({'status': OauthEvents.LOGOUT});
    dispatcher.dispatch(OauthEvents.LOGOUT);
  }

  expired() {
    this.oauthToken.del();
    this.setState({'status': OauthEvents.LOGOUT});
  }

  render() {
    const {status, profile} = this.state;
    const email = profile ? profile.email : '';
    let {text, className} = this.props;
    const spanElement = (status) => {
      switch(status) {
        case OauthEvents.LOGOUT: return (<span onClick={this.login.bind(this)}>{text}</span>)
        case OauthEvents.AUTHORIZED:  return (<span onClick={this.logout.bind(this)}>Logout <strong>{email}</strong></span>)
        case OauthEvents.DENIED: return (<span onClick={this.login.bind(this)}>Access denied. Try Again</span>)
      }
    }

    return (
      <a class={"oauth "+className} href="#">
        {spanElement(status)}
      </a>
    );
  }
}


class OauthToken {

  constructor(storage) {
    this.storage = storage;
  }

  init() {
    if(location.hash.match('#access_token=')) {
      const hash = location.hash.substr(1);
      this.set(hash);
      location.replace('/');
    } else {
      const tokenStr = this.storage['token'];
      if(tokenStr) {
          const token = JSON.parse(tokenStr);
          if(token && token.access_token) {
            this.setToken(token);
          }
      }
    }
  }

  static get oauth2HashTokens() {
    return ['access_token', 'token_type', 'expires_in', 'scope', 'state', 'error', 'error_description']
  }

  get() {
    return this.token;
  }

  del() {
    delete this.storage['token'];
    delete this.token;
  }

  set(hash) {
    const params = this.parseOauthUri(hash);
    if(params) {
      this.delOauthUriVals();
      this.setToken(params);
      dispatcher.dispatch(OauthEvents.AUTHORIZED, this.token);
    }
  }

  setToken(params) {
    this.token = this.token || {};
    Object.assign(this.token, params);
    this.setExpires();
    this.storage['token'] = JSON.stringify(this.token);
    this.setExpiredAtEvent();
    this.registerAjaxInterceptor();
  }

  registerAjaxInterceptor() {
    $( document ).ajaxSend(( event, request, settings ) => {
      request.setRequestHeader('Authorization', 'Bearer ' + this.token.access_token);
    });
  }

  parseOauthUri(hash) {
    const regex = /([^&=]+)=([^&]*)/g;
    let params = {},
        m;
    while ((m = regex.exec(hash)) !== null) {
        params[decodeURIComponent(m[1])] = decodeURIComponent(m[2]);
    }
    if (params.access_token || params.error) {
        return params;
    }
  }

  delOauthUriVals() {
    var curHash = location.hash;
    OauthToken.oauth2HashTokens.forEach((hashKey) => {
      const re = new RegExp('&' + hashKey + '(=[^&]*)?|^' + hashKey + '(=[^&]*)?&?');
      curHash = curHash.replace(re, '');
    });
    location.hash = curHash;
  }

  headers() {
    return {Authorization: 'Bearer ' + this.token.access_token};
  }

  isExpired() {
    return this.token && this.token.expires_at && new Date(this.token.expires_at) < new Date();
  }

  setExpires() {
    if(!this.token) {
      return;
    }
    if (typeof (this.token.expires_in) !== 'undefined' && this.token.expires_in !== null) {
      let expires_at = new Date();
      expires_at.setSeconds(expires_at.getSeconds() + parseInt(this.token.expires_in) - 60); // 60 seconds less to secure browser and response latency
      this.token.expires_at = expires_at;
    } else {
      this.token.expires_at = null;
    }
  }

  setExpiredAtEvent() {
    if (typeof (this.token.expires_at) === 'undefined' || this.token.expires_at === null) {
      return;
    }
    const time = (new Date(this.token.expires_at)) - (new Date());
    if (time) {
      setTimeout(() => {
        dispatcher.dispatch(OauthEvents.EXPIRED, this.token);
      }, time);
    }
  }
}
