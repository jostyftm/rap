/**
 * Script de selección de elementos (JS plano, sin dependencias) inyectado en el sitio objetivo.
 * - Modo embebido: corre dentro del iframe del editor y habla con `window.parent` vía postMessage.
 * - Modo externo: corre en el Chromium headed y habla con el Runner vía `window.rpaLiveEmit`.
 * No debe contener comillas invertidas ni `${` porque se exporta como template literal.
 */
export const PICKER_JS = String.raw`
(function () {
  if (window.__rpaPicker) return;
  var isTop = window.top === window;
  var isDirectFrame = false;
  try { isDirectFrame = window.parent === window.top; } catch (e) { isDirectFrame = true; }
  var isEditorFrame = window.name === 'rpa-live-frame' || isDirectFrame;
  if (!isTop && !isEditorFrame) return;
  window.__rpaPicker = true;

  var armed = null;
  var overlay = null;
  var tagLabel = null;
  var hoverEl = null;

  function send(msg) {
    msg.__rpa = true;
    if (!isTop && window.parent) { window.parent.postMessage(msg, '*'); }
    else if (typeof window.rpaLiveEmit === 'function') { window.rpaLiveEmit(msg); }
  }

  function realUrl() {
    var origin = window.__RPA_ORIGIN__ || location.origin;
    return origin + location.pathname + location.search + location.hash;
  }

  // ---------- Overlay de resaltado ----------
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.setAttribute('data-rpa-overlay', '1');
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #3b82f6;background:rgba(59,130,246,.18);border-radius:3px;display:none;transition:all .05s;';
    tagLabel = document.createElement('div');
    tagLabel.style.cssText = 'position:absolute;top:-20px;left:-2px;background:#3b82f6;color:#fff;font:11px monospace;padding:1px 6px;border-radius:3px;white-space:nowrap;';
    overlay.appendChild(tagLabel);
    document.documentElement.appendChild(overlay);
  }

  function highlight(el, text, color) {
    ensureOverlay();
    if (!el || !el.getBoundingClientRect) { overlay.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    var c = color || '#3b82f6';
    overlay.style.borderColor = c;
    tagLabel.style.background = c;
    tagLabel.textContent = text || el.tagName.toLowerCase();
  }

  function hideOverlay() { if (overlay) overlay.style.display = 'none'; }

  // ---------- Utilidades de localizadores ----------
  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

  function implicitRole(el) {
    var tag = el.tagName.toLowerCase();
    var explicit = el.getAttribute('role');
    if (explicit) return explicit;
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    return null;
  }

  function labelText(el) {
    var id = el.getAttribute('id');
    var lab = null;
    if (id) lab = document.querySelector('label[for="' + esc(id) + '"]');
    if (!lab && el.closest) lab = el.closest('label');
    return lab ? (lab.innerText || '').trim() : '';
  }

  function accessibleName(el) {
    var n = el.getAttribute('aria-label') || labelText(el) || '';
    if (!n) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'input') n = el.getAttribute('value') || el.getAttribute('placeholder') || '';
      else n = (el.innerText || '').trim();
    }
    return n.replace(/\s+/g, ' ').trim();
  }

  function cssPath(el) {
    if (el.id && !/^[0-9]/.test(el.id) && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      return '#' + CSS.escape(el.id);
    }
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      var tag = cur.tagName.toLowerCase();
      if (cur.id && !/^[0-9]/.test(cur.id) && document.querySelectorAll('#' + CSS.escape(cur.id)).length === 1) {
        parts.unshift('#' + CSS.escape(cur.id));
        break;
      }
      var sel = tag;
      var parent = cur.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === cur.tagName; });
        if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      parts.unshift(sel);
      cur = parent;
    }
    return parts.join(' > ');
  }

  function xpathFor(el) {
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var tag = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift('//*[@id="' + esc(cur.id) + '"]'); return parts.join('/'); }
      var idx = 1;
      var sib = cur.previousElementSibling;
      while (sib) { if (sib.tagName === cur.tagName) idx++; sib = sib.previousElementSibling; }
      parts.unshift(tag + '[' + idx + ']');
      cur = cur.parentElement;
    }
    return '/' + parts.join('/');
  }

  function countCss(sel) { try { return document.querySelectorAll(sel).length; } catch (e) { return 0; } }

  function getCandidates(el) {
    var list = [];
    var tag = el.tagName.toLowerCase();
    var testid = el.getAttribute('data-testid');
    if (testid) list.push({ strategy: 'testid', value: testid, score: 95, unique: countCss('[data-testid="' + esc(testid) + '"]') === 1 });

    var role = implicitRole(el);
    var name = accessibleName(el);
    if (role && name && name.length < 60 && !/['"]/.test(name)) {
      list.push({ strategy: 'role', value: role + "[name='" + name + "']", score: 90 });
    }

    var lbl = labelText(el);
    if (lbl && lbl.length < 60 && tag !== 'button') list.push({ strategy: 'label', value: lbl, score: 85 });

    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      var txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (txt && txt.length > 0 && txt.length < 40 && !/['"]/.test(txt)) list.push({ strategy: 'text', value: txt, score: 80 });
    }

    ['data-test', 'data-cy', 'name', 'placeholder', 'aria-label'].forEach(function (attr) {
      var v = el.getAttribute(attr);
      if (v) {
        var sel = tag + '[' + attr + '="' + esc(v) + '"]';
        list.push({ strategy: 'css', value: sel, score: attr === 'name' ? 80 : 75, unique: countCss(sel) === 1 });
      }
    });

    if (el.id && !/^[0-9]+$/.test(el.id)) {
      var idsel = '#' + CSS.escape(el.id);
      list.push({ strategy: 'css', value: idsel, score: 85, unique: countCss(idsel) === 1 });
    }

    var path = cssPath(el);
    list.push({ strategy: 'css', value: path, score: 60, unique: countCss(path) === 1 });
    list.push({ strategy: 'xpath', value: xpathFor(el), score: 50, unique: true });

    list.sort(function (a, b) {
      var ua = a.unique === false ? -30 : 0;
      var ub = b.unique === false ? -30 : 0;
      return (b.score + ub) - (a.score + ua);
    });
    return list;
  }

  function describe(el) {
    var attrs = {};
    ['id', 'name', 'type', 'placeholder', 'href', 'data-testid', 'aria-label', 'value'].forEach(function (a) {
      var v = el.getAttribute(a);
      if (v) attrs[a] = v;
    });
    var tag = el.tagName.toLowerCase();
    return {
      tag: tag,
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      attrs: attrs,
      isInput: tag === 'input' || tag === 'textarea',
      isSelect: tag === 'select',
      role: implicitRole(el)
    };
  }

  // ---------- Resolución de elementos (primary -> fallbacks) ----------
  var ROLE_SELECTORS = {
    button: 'button,[role=button],input[type=button],input[type=submit],input[type=reset]',
    link: 'a[href],[role=link]',
    textbox: 'input:not([type]),input[type=text],input[type=email],input[type=password],input[type=search],input[type=tel],input[type=url],input[type=number],textarea,[role=textbox]',
    checkbox: 'input[type=checkbox],[role=checkbox]',
    radio: 'input[type=radio],[role=radio]',
    combobox: 'select,[role=combobox]',
    heading: 'h1,h2,h3,h4,h5,h6,[role=heading]'
  };

  function isVisible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function deepestWithText(text) {
    var needle = text.toLowerCase();
    var all = document.body ? document.body.querySelectorAll('*') : [];
    var best = null;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.hasAttribute('data-rpa-overlay')) continue;
      var t = (el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (t.indexOf(needle) === -1) continue;
      var childHas = Array.prototype.some.call(el.children, function (c) {
        return ((c.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase()).indexOf(needle) !== -1;
      });
      if (!childHas && isVisible(el)) { best = el; break; }
    }
    return best;
  }

  function resolveCandidate(c) {
    if (!c || !c.value) return null;
    try {
      if (c.strategy === 'testid') {
        var v = esc(c.value);
        var el = document.querySelector('[data-testid="' + v + '"], [data-test="' + v + '"], [data-test-id="' + v + '"], [data-cy="' + v + '"], [data-qa="' + v + '"]');
        if (el) return el;
        try {
          return document.getElementById(c.value);
        } catch (e) {
          return null;
        }
      }
      if (c.strategy === 'css') return document.querySelector(c.value);
      if (c.strategy === 'xpath') {
        return document.evaluate(c.value, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      }
      if (c.strategy === 'text') return deepestWithText(c.value);
      if (c.strategy === 'label') {
        var needle = c.value.toLowerCase();
        var labels = document.querySelectorAll('label');
        for (var i = 0; i < labels.length; i++) {
          if ((labels[i].innerText || '').toLowerCase().indexOf(needle) !== -1) {
            if (labels[i].control) return labels[i].control;
          }
        }
        return document.querySelector('[aria-label="' + esc(c.value) + '"]');
      }
      if (c.strategy === 'role') {
        var m = c.value.match(/^([a-z]+)(\[name=['"](.*)['"]\])?$/i);
        if (!m) return document.querySelector(c.value);
        var sel = ROLE_SELECTORS[m[1]] || '[role=' + m[1] + ']';
        var cands = document.querySelectorAll(sel);
        for (var j = 0; j < cands.length; j++) {
          if (!m[3] || accessibleName(cands[j]).toLowerCase().indexOf(m[3].toLowerCase()) !== -1) return cands[j];
        }
        return null;
      }
    } catch (e) { return null; }
    return null;
  }

  function resolveGroup(group) {
    if (!group || !group.primary) return null;
    var list = [group.primary].concat(group.fallbacks || []);
    for (var i = 0; i < list.length; i++) {
      var el = resolveCandidate(list[i]);
      if (el) return { el: el, strategy: list[i].strategy, value: list[i].value };
    }
    return null;
  }

  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
  }

  // ---------- Ejecución de pasos de prueba ----------
  async function execAction(cmd) {
    var res = { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action };

    // Caso especial: waitFor (soporta timeout, networkIdle, url, text y selector)
    if (cmd.action === 'waitFor') {
      var strat = (cmd.params && cmd.params.strategy) || (cmd.locator ? 'selector' : 'timeout');
      var val = cmd.params ? cmd.params.value : null;

      if (strat === 'timeout') {
        var ms = Number(val) || 1000;
        await new Promise(function (r) { setTimeout(r, ms); });
        return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'timeout', output: 'Pausa de ' + ms + 'ms completada' };
      }

      if (strat === 'networkIdle') {
        await new Promise(function (r) { setTimeout(r, 600); });
        return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'networkIdle', output: 'Red inactiva' };
      }

      if (strat === 'url') {
        var targetUrl = String(val || '').toLowerCase();
        var uStart = Date.now();
        while (Date.now() - uStart < 5000) {
          if (!targetUrl || realUrl().toLowerCase().indexOf(targetUrl) !== -1) {
            return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'url', output: realUrl() };
          }
          await new Promise(function (r) { setTimeout(r, 200); });
        }
        if (!targetUrl || realUrl().toLowerCase().indexOf(targetUrl) !== -1) {
          return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'url', output: realUrl() };
        }
        return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: false, strategy: 'url', error: 'Timeout esperando URL: ' + val };
      }

      if (strat === 'text') {
        var needle = String(val || '').trim();
        if (!needle) {
          return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'text', output: 'Texto vacío' };
        }
        var tStart = Date.now();
        while (Date.now() - tStart < 5000) {
          var textEl = deepestWithText(needle);
          if (textEl && isVisible(textEl)) {
            textEl.scrollIntoView({ block: 'center', inline: 'center' });
            highlight(textEl, 'encontrado: "' + needle.slice(0, 15) + '"', '#10b981');
            setTimeout(hideOverlay, 1000);
            return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'text', output: 'Texto visible: ' + needle };
          }
          await new Promise(function (r) { setTimeout(r, 200); });
        }
        return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: false, strategy: 'text', error: 'Timeout esperando texto: ' + needle };
      }

      // strat === 'selector' o fallback
      var sStart = Date.now();
      while (Date.now() - sStart < 5000) {
        var foundEl = null;
        var foundStrat = 'selector';
        if (cmd.locator) {
          var g = resolveGroup(cmd.locator);
          if (g && isVisible(g.el)) {
            foundEl = g.el;
            foundStrat = g.strategy;
          }
        }
        if (!foundEl && val) {
          try {
            var raw = String(val).trim();
            var elCand = (raw.indexOf('//') === 0 || raw.indexOf('(') === 0)
              ? document.evaluate(raw, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
              : document.querySelector(raw);
            if (elCand && isVisible(elCand)) {
              foundEl = elCand;
              foundStrat = raw.indexOf('//') === 0 ? 'xpath' : 'css';
            }
          } catch (e) {}
        }
        if (foundEl) {
          foundEl.scrollIntoView({ block: 'center', inline: 'center' });
          highlight(foundEl, 'visible (' + foundStrat + ')', '#10b981');
          setTimeout(hideOverlay, 1000);
          return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: foundStrat, output: 'Elemento visible en pantalla' };
        }
        await new Promise(function (r) { setTimeout(r, 200); });
      }
      return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: false, error: 'Elemento no encontrado tras esperar 5s' };
    }

    // Acciones que no requieren un localizador obligatorio
    if (cmd.action === 'screenshot' && (!cmd.locator || !cmd.locator.primary || !cmd.locator.primary.value)) {
      return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'fullPage', output: 'Captura de pantalla simulada' };
    }
    if (cmd.action === 'scroll' && cmd.params && cmd.params.mode !== 'element') {
      var sp = cmd.params || {};
      var sbeh = sp.behavior || 'smooth';
      if (sp.mode === 'top') {
        window.scrollTo({ top: 0, behavior: sbeh });
        return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'top', output: 'Desplazado al inicio' };
      } else if (sp.mode === 'bottom') {
        window.scrollTo({ top: document.body.scrollHeight, behavior: sbeh });
        return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'bottom', output: 'Desplazado al final' };
      } else {
        var sx = sp.x || 0;
        var sy = sp.y == null ? 500 : sp.y;
        window.scrollBy({ left: sx, top: sy, behavior: sbeh });
        return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'coordinates', output: 'Desplazado ' + sy + 'px' };
      }
    }

    // Auto-espera activa (polling) hasta que el elemento aparezca y sea visible en el DOM
    var timeoutMs = Math.min((cmd.timeout && Number(cmd.timeout)) || 3500, 10000);
    var startTime = Date.now();
    var found = null;
    while (Date.now() - startTime < timeoutMs) {
      found = resolveGroup(cmd.locator);
      if (found && isVisible(found.el)) break;
      await new Promise(function (r) { setTimeout(r, 100); });
    }
    if (!found) {
      found = resolveGroup(cmd.locator);
    }
    if (!found) {
      if (cmd.action === 'screenshot') {
        return { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: true, strategy: 'fullPage', output: 'Captura de pantalla simulada' };
      }
      var cands = (cmd.locator && [cmd.locator.primary].concat(cmd.locator.fallbacks || []).filter(Boolean)) || [];
      var details = cands.map(function(c) { return '[' + c.strategy + ': ' + c.value + ']'; }).join(', ');
      var isPlaceholder = cands.some(function(c) {
        return c.value === 'action-button' || c.value === 'input-field' || c.value === 'data-text' || c.value === 'select-dropdown';
      });
      var hint = isPlaceholder ? ' — El nodo tiene el selector por defecto (' + (cmd.locator && cmd.locator.primary && cmd.locator.primary.value) + '). Configúralo o selecciónalo con el cursor en el simulador.' : '';
      res.ok = false;
      res.error = 'Elemento no encontrado tras esperar ' + Math.round(timeoutMs / 1000) + 's' + (details ? ' (' + details + ')' : '') + hint;
      return res;
    }
    var el = found.el;
    try {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      highlight(el, cmd.action + ' → ' + found.strategy, '#10b981');
      setTimeout(hideOverlay, 900);
      var p = cmd.params || {};
      if (cmd.action === 'click') {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        el.click();
      }
      else if (cmd.action === 'type') {
        el.focus();
        setNativeValue(el, p.clear === false ? (el.value || '') + String(p.text == null ? '' : p.text) : String(p.text == null ? '' : p.text));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (p.pressEnter) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        if (typeof el.blur === 'function') el.blur();
      } else if (cmd.action === 'select') {
        el.value = p.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (cmd.action === 'extract') {
        res.output = (p.extractType === 'attribute' && p.attributeName) ? el.getAttribute(p.attributeName) : (el.innerText || el.textContent || '').trim();
      } else if (cmd.action === 'scroll') {
        el.scrollIntoView({ behavior: (p && p.behavior) || 'smooth', block: 'center', inline: 'center' });
        res.output = 'Desplazado hasta el elemento';
      }
      res.ok = true; res.strategy = found.strategy; res.value = found.value;
    } catch (e) { res.ok = false; res.error = String(e && e.message || e); }
    return res;
  }

  // ---------- Modo selección ----------
  function elementAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (el && el.hasAttribute && el.hasAttribute('data-rpa-overlay')) return null;
    return el;
  }

  function onMove(e) {
    if (!armed) return;
    hoverEl = elementAt(e.clientX, e.clientY);
    if (hoverEl) highlight(hoverEl, describeLabel(hoverEl));
  }

  function describeLabel(el) {
    var d = el.tagName.toLowerCase();
    if (el.id) d += '#' + el.id;
    return d;
  }

  function swallow(e) {
    if (!armed) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function onClick(e) {
    if (!armed) return;
    swallow(e);
    var el = elementAt(e.clientX, e.clientY) || e.target;
    if (!el || el === document.documentElement) return;
    highlight(el, 'seleccionado', '#10b981');
    send({
      type: 'rpa:pick',
      nodeId: armed.nodeId,
      element: describe(el),
      candidates: getCandidates(el),
      url: realUrl()
    });
    armed = null;
    document.documentElement.style.cursor = '';
    setTimeout(hideOverlay, 900);
  }

  ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'submit'].forEach(function (t) {
    document.addEventListener(t, swallow, true);
  });
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('keydown', function (e) {
    if (armed && e.key === 'Escape') {
      armed = null;
      hideOverlay();
      document.documentElement.style.cursor = '';
      send({ type: 'rpa:disarmed' });
    }
  }, true);

  // ---------- Mensajería ----------
  function handle(cmd) {
    if (!cmd || !cmd.type) return;
    if (cmd.type === 'rpa:arm') {
      armed = { nodeId: cmd.nodeId };
      document.documentElement.style.cursor = 'crosshair';
    } else if (cmd.type === 'rpa:disarm') {
      armed = null; hideOverlay();
      document.documentElement.style.cursor = '';
    } else if (cmd.type === 'rpa:exec') {
      Promise.resolve(execAction(cmd)).then(function (r) {
        if (!r) r = { reqId: cmd.reqId, nodeId: cmd.nodeId, action: cmd.action, ok: false, error: 'Sin respuesta de ejecución' };
        r.type = 'rpa:exec:result';
        send(r);
      }).catch(function (err) {
        send({
          type: 'rpa:exec:result',
          reqId: cmd.reqId,
          nodeId: cmd.nodeId,
          action: cmd.action,
          ok: false,
          error: String(err && err.message || err)
        });
      });
    } else if (cmd.type === 'rpa:locate') {
      var f = resolveGroup(cmd.locator);
      if (f) { f.el.scrollIntoView({ block: 'center' }); highlight(f.el, 'localizado (' + f.strategy + ')', '#f59e0b'); setTimeout(hideOverlay, 2000); }
      send({ type: 'rpa:locate:result', nodeId: cmd.nodeId, found: !!f, strategy: f ? f.strategy : null });
    } else if (cmd.type === 'rpa:ping') {
      send({ type: 'rpa:ready', url: realUrl(), title: document.title });
    }
  }
  window.__rpaReceive = handle;
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data.type !== 'string' || e.data.type.indexOf('rpa:') !== 0) return;
    handle(e.data);
  });

  // ---------- Navegación ----------
  function notifyNav() { send({ type: 'rpa:navigated', url: realUrl(), title: document.title }); }
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () { var r = orig.apply(this, arguments); setTimeout(notifyNav, 0); return r; };
  });
  window.addEventListener('popstate', notifyNav);
  window.addEventListener('hashchange', notifyNav);
  window.addEventListener('load', function () { notifyNav(); send({ type: 'rpa:ready', url: realUrl(), title: document.title }); });
  send({ type: 'rpa:ready', url: realUrl(), title: document.title });
})();
`;
