/**
 * Script de intercepción de red del lado del cliente inyectado síncronamente en <head>.
 * - Resuelve problemas de CORS en sitios embebidos interceptando fetch, XMLHttpRequest y sendBeacon.
 * - Reencamina llamadas a dominios externos a través de /__rpa_proxy.
 * - Canoniza URLs hacia el host proxy actual (evitando llamadas cross-origin a youtube.com vs www.youtube.com).
 * - Deshabilita ServiceWorkers que rompen la caché y el proxy en el iframe.
 * - Implementa un Virtual Cookie Jar transparente sobre Document.prototype.cookie para sitios
 *   embebidos en iframe donde el navegador bloquea cookies de terceros (Third-Party Cookie Blocking).
 */
export const PROXY_CLIENT_JS = String.raw`
(function () {
  if (window.__rpaProxyInjected) return;
  window.__rpaProxyInjected = true;

  var realOrigin = window.__RPA_ORIGIN__ || location.origin;
  var realHost = '';
  var altHost = '';

  try {
    realHost = new URL(realOrigin).host.toLowerCase();
    altHost = realHost.startsWith('www.') ? realHost.slice(4) : ('www.' + realHost);
  } catch (e) {
    realHost = location.host.toLowerCase();
  }

  // ---------- Virtual Cookie Jar (Soporte iframe sin third-party cookies) ----------
  var cookieStorageKey = '__rpa_cookie_jar__';
  function getCookieJar() {
    try {
      var s = sessionStorage.getItem(cookieStorageKey);
      if (s) return JSON.parse(s);
    } catch (e) {}
    try {
      if (window.name && window.name.indexOf('__RPA_COOKIES__:') === 0) {
        return JSON.parse(window.name.slice(18));
      }
    } catch (e) {}
    if (!window.__rpa_mem_cookies__) {
      window.__rpa_mem_cookies__ = {};
    }
    return window.__rpa_mem_cookies__;
  }

  function saveCookieJar(jar) {
    window.__rpa_mem_cookies__ = jar;
    var serialized = JSON.stringify(jar);
    try {
      sessionStorage.setItem(cookieStorageKey, serialized);
    } catch (e) {}
    try {
      // Guardar también en window.name para sobrevivir recargas si sessionStorage es bloqueado
      if (!window.name || window.name.indexOf('__RPA_COOKIES__:') === 0) {
        window.name = '__RPA_COOKIES__:' + serialized;
      }
    } catch (e) {}
  }

  // Inicializar con cookies enviadas por el servidor si existen
  try {
    var initial = window.__RPA_INITIAL_COOKIES__;
    if (initial && typeof initial === 'object') {
      var currentJar = getCookieJar();
      for (var initK in initial) {
        if (Object.prototype.hasOwnProperty.call(initial, initK) && !currentJar[initK]) {
          currentJar[initK] = { value: String(initial[initK]) };
        }
      }
      saveCookieJar(currentJar);
    }
  } catch (e) {}

  function getActiveCookieString() {
    var jar = getCookieJar();
    var now = Date.now();
    var pairs = [];
    var changed = false;
    for (var k in jar) {
      if (!Object.prototype.hasOwnProperty.call(jar, k)) continue;
      var item = jar[k];
      if (item && item.expires && item.expires <= now) {
        delete jar[k];
        changed = true;
      } else if (item && item.value !== undefined) {
        pairs.push(k + '=' + item.value);
      }
    }
    if (changed) saveCookieJar(jar);
    return pairs.join('; ');
  }

  function setVirtualCookie(cookieStr) {
    if (!cookieStr || typeof cookieStr !== 'string') return;
    var parts = cookieStr.split(';');
    var first = (parts[0] || '').split('=');
    var name = (first[0] || '').trim();
    var value = first.slice(1).join('=').trim();
    if (!name) return;

    var jar = getCookieJar();
    var expires = null;
    for (var i = 1; i < parts.length; i++) {
      var p = (parts[i] || '').trim();
      if (/^expires=/i.test(p)) {
        var t = new Date(p.slice(8).trim()).getTime();
        if (!isNaN(t)) expires = t;
      } else if (/^max-age=/i.test(p)) {
        var sec = parseInt(p.slice(8).trim(), 10);
        if (!isNaN(sec)) expires = Date.now() + sec * 1000;
      }
    }

    if ((expires && expires <= Date.now()) || (value === '' && parts.some(function (p) { return /^expires=/i.test(p.trim()); }))) {
      delete jar[name];
    } else {
      jar[name] = { value: value, expires: expires };
    }
    saveCookieJar(jar);

    // Sincronizar en segundo plano con el servidor proxy de forma no bloqueante
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(location.origin + '/__rpa_cookie_sync', JSON.stringify({ name: name, value: value, expires: expires }));
      }
    } catch (e) {}
  }

  try {
    Object.defineProperty(Document.prototype, 'cookie', {
      get: function () {
        return getActiveCookieString();
      },
      set: function (val) {
        setVirtualCookie(val);
      },
      configurable: true,
    });
  } catch (e) {
    try {
      Object.defineProperty(document, 'cookie', {
        get: function () {
          return getActiveCookieString();
        },
        set: function (val) {
          setVirtualCookie(val);
        },
        configurable: true,
      });
    } catch (e2) {}
  }

  function getMockUrl(u) {
    if (!window.__RPA_MOCKS__ || !window.__RPA_MOCKS__.mac) return null;
    var hostname = u.hostname.toLowerCase();
    var port = u.port || (u.protocol === 'https:' ? '443' : '80');
    if ((hostname === '127.0.0.1' || hostname === 'localhost') && port === '9494') {
      if (u.pathname.indexOf('/mac') !== -1) {
        return location.origin + '/__rpa_mock/mac';
      }
      if (u.pathname.indexOf('/version') !== -1) {
        return location.origin + '/__rpa_mock/version';
      }
    }
    return null;
  }

  function shouldProxy(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return null;
    var trimmed = urlStr.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('javascript:')) {
      return null;
    }

    try {
      var u = new URL(trimmed, location.href);
      var targetHost = u.host.toLowerCase();

      // Soporte mock de agente local en entorno de pruebas
      var mockUrl = getMockUrl(u);
      if (mockUrl) return mockUrl;

      // Si es loopback/local y no hay mock activo, no reescribir hacia el proxy
      var targetHostname = u.hostname.toLowerCase();
      if (targetHostname === '127.0.0.1' || targetHostname === 'localhost') {
        return null;
      }

      // Si ya apunta a este proxy local o es relativo
      if (targetHost === location.host.toLowerCase()) {
        return null;
      }

      // Si apunta al host real del sitio o su versión alternativa www
      if (targetHost === realHost || targetHost === altHost) {
        return location.origin + u.pathname + u.search + u.hash;
      }

      // Es un host externo (ej: gstatic.com, googleapis.com, etc.)
      return location.origin + '/__rpa_proxy?url=' + encodeURIComponent(u.href);
    } catch (e) {
      return null;
    }
  }

  // ---------- Interceptar window.fetch ----------
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (resource, init) {
      try {
        var activeCookies = getActiveCookieString();
        var customInit = init ? Object.assign({}, init) : {};
        if (activeCookies) {
          var h = new Headers(customInit.headers || (resource instanceof Request ? resource.headers : undefined));
          if (!h.has('x-rpa-cookie')) {
            h.set('x-rpa-cookie', activeCookies);
            customInit.headers = h;
          }
        }

        if (typeof resource === 'string') {
          var rewritten = shouldProxy(resource);
          if (rewritten) resource = rewritten;
        } else if (resource && typeof resource === 'object' && resource.url) {
          var targetUrl = resource.url;
          var rewrittenUrl = shouldProxy(targetUrl);
          if (rewrittenUrl) {
            try {
              resource = new Request(rewrittenUrl, resource);
            } catch (err) {
              resource = rewrittenUrl;
            }
          }
        }
        return origFetch.call(this, resource, Object.keys(customInit).length ? customInit : init);
      } catch (e) {}
      return origFetch.call(this, resource, init);
    };
  }

  // ---------- Interceptar XMLHttpRequest ----------
  if (window.XMLHttpRequest) {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        var rewritten = shouldProxy(url);
        if (rewritten) {
          var args = Array.prototype.slice.call(arguments);
          args[1] = rewritten;
          return origOpen.apply(this, args);
        }
      } catch (e) {}
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        var activeCookies = getActiveCookieString();
        if (activeCookies && typeof this.setRequestHeader === 'function') {
          this.setRequestHeader('x-rpa-cookie', activeCookies);
        }
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
  }

  // ---------- Interceptar navigator.sendBeacon ----------
  if (navigator.sendBeacon) {
    var origBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      try {
        var rewritten = shouldProxy(url);
        if (rewritten) {
          var args = Array.prototype.slice.call(arguments);
          args[0] = rewritten;
          return origBeacon.apply(this, args);
        }
      } catch (e) {}
      return origBeacon.apply(this, arguments);
    };
  }

  // ---------- Desactivar Service Workers en modo embebido ----------
  if (navigator.serviceWorker) {
    try {
      navigator.serviceWorker.register = function () {
        return Promise.reject(new Error('ServiceWorker deshabilitado en RPA Live Preview'));
      };
    } catch (e) {}
  }
})();
`;
