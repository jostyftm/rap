/**
 * Script de intercepción de red del lado del cliente inyectado síncronamente en <head>.
 * - Resuelve problemas de CORS en sitios embebidos interceptando fetch, XMLHttpRequest y sendBeacon.
 * - Reencamina llamadas a dominios externos a través de /__rpa_proxy.
 * - Canoniza URLs hacia el host proxy actual (evitando llamadas cross-origin a youtube.com vs www.youtube.com).
 * - Deshabilita ServiceWorkers que rompen la caché y el proxy en el iframe.
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

  function shouldProxy(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return null;
    var trimmed = urlStr.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('javascript:')) {
      return null;
    }

    try {
      var u = new URL(trimmed, location.href);
      var targetHost = u.host.toLowerCase();

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
              // Si Request falla al clonarse por streaming body, usar URL reescrita
              resource = rewrittenUrl;
            }
          }
        }
      } catch (e) {}
      return origFetch.call(this, resource, init);
    };
  }

  // ---------- Interceptar XMLHttpRequest ----------
  if (window.XMLHttpRequest) {
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
      try {
        var rewritten = shouldProxy(url);
        if (rewritten) url = rewritten;
      } catch (e) {}
      return origOpen.call(this, method, url, async, user, password);
    };
  }

  // ---------- Interceptar navigator.sendBeacon ----------
  if (navigator.sendBeacon) {
    var origBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      try {
        var rewritten = shouldProxy(url);
        if (rewritten) url = rewritten;
      } catch (e) {}
      return origBeacon.call(this, url, data);
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
