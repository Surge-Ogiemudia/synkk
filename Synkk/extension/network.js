// PST Network Watcher
// Injected into the MAIN page context to override fetch and XHR

(function() {
  if (window.__pstNetworkInjected) return;
  window.__pstNetworkInjected = true;

  console.log("[PST] Network Watcher injected into main page context.");

  // 1. Override Fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
    const reqInit = args[1] || {};
    const method = (reqInit.method || 'GET').toUpperCase();
    
    let reqBody = null;
    try {
      if (reqInit.body && typeof reqInit.body === 'string') {
        reqBody = JSON.parse(reqInit.body);
      }
    } catch(e) {}

    const response = await originalFetch.apply(this, args);
    
    // Check if POST request looks like an HTTP login/auth API payload
    if (method === 'POST' && reqBody && typeof reqBody === 'object') {
      try {
        const bodyStr = JSON.stringify(reqBody).toLowerCase();
        const urlStr = url.toLowerCase();
        if (urlStr.includes('login') || urlStr.includes('auth') || urlStr.includes('signin') || urlStr.includes('session') || bodyStr.includes('password') || bodyStr.includes('pass')) {
          let userVal = reqBody.username || reqBody.email || reqBody.user || reqBody.identity || reqBody.login || reqBody.email_or_username || '';
          let passVal = reqBody.password || reqBody.pass || reqBody.pwd || reqBody.secret || '';
          if (userVal && passVal) {
            window.postMessage({
              type: "PST_LOGIN_INTERCEPTED",
              pmsUrl: window.location.href,
              username: String(userVal),
              password: String(passVal)
            }, "*");
          }
        }
      } catch(e) {}
    }

    // Always emit raw network packet for AI traffic logging
    try {
      response.clone().text().then(resText => {
        window.postMessage({
          type: "PST_RAW_NETWORK_STREAM",
          method,
          url,
          reqBody,
          status: response.status,
          resSnippet: resText ? resText.substring(0, 1500) : ''
        }, "*");
      }).catch(e => {});
    } catch(e) {}

    // Check response JSON for sale interception
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      response.clone().json().then(resData => {
        window.postMessage({ type: "PST_NETWORK_INTERCEPT", method, url, reqBody, payload: resData }, "*");
      }).catch(err => {
        if (method === 'POST') {
           window.postMessage({ type: "PST_NETWORK_INTERCEPT", method, url, reqBody, payload: { success: true } }, "*");
        }
      });
    } else if (method === 'POST') {
       window.postMessage({ type: "PST_NETWORK_INTERCEPT", method, url, reqBody, payload: { success: true } }, "*");
    }
    
    return response;
  };

  // 2. Override XHR
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._pstMethod = method.toUpperCase();
    this._pstUrl = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };

  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    let reqBody = null;
    try {
      if (args[0] && typeof args[0] === 'string') {
        reqBody = JSON.parse(args[0]);
      }
    } catch(e) {}

    this.addEventListener("load", function() {
      // Check XHR POST requests for login/auth payload
      if (this._pstMethod === 'POST' && reqBody && typeof reqBody === 'object') {
        try {
          const bodyStr = JSON.stringify(reqBody).toLowerCase();
          const urlStr = (this._pstUrl || '').toLowerCase();
          if (urlStr.includes('login') || urlStr.includes('auth') || urlStr.includes('signin') || urlStr.includes('session') || bodyStr.includes('password') || bodyStr.includes('pass')) {
            let userVal = reqBody.username || reqBody.email || reqBody.user || reqBody.identity || reqBody.login || reqBody.email_or_username || '';
            let passVal = reqBody.password || reqBody.pass || reqBody.pwd || reqBody.secret || '';
            if (userVal && passVal) {
              window.postMessage({
                type: "PST_LOGIN_INTERCEPTED",
                pmsUrl: window.location.href,
                username: String(userVal),
                password: String(passVal)
              }, "*");
            }
          }
        } catch(e) {}
      }

      // Always emit raw network packet for AI traffic logging
      try {
        window.postMessage({
          type: "PST_RAW_NETWORK_STREAM",
          method: this._pstMethod,
          url: this._pstUrl,
          reqBody,
          status: this.status,
          resSnippet: this.responseText ? this.responseText.substring(0, 1500) : ''
        }, "*");
      } catch(e) {}

      const contentType = this.getResponseHeader("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          const data = JSON.parse(this.responseText);
          window.postMessage({ type: "PST_NETWORK_INTERCEPT", method: this._pstMethod, url: this._pstUrl, reqBody, payload: data }, "*");
        } catch (e) {
          if (this._pstMethod === 'POST') window.postMessage({ type: "PST_NETWORK_INTERCEPT", method: this._pstMethod, url: this._pstUrl, reqBody, payload: { success: true } }, "*");
        }
      } else if (this._pstMethod === 'POST') {
        window.postMessage({ type: "PST_NETWORK_INTERCEPT", method: this._pstMethod, url: this._pstUrl, reqBody, payload: { success: true } }, "*");
      }
    });
    originalXHRSend.apply(this, args);
  };
})();
