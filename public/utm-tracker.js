/**
 * Ads Ativos — UTM Tracker v2.0
 * Script de Captura e Persistência de Atribuição (Vanilla JS, ~3KB)
 *
 * Compatível com: Elementor, WordPress, Hotmart, Kirvano, páginas HTML puras
 *
 * Como usar:
 *   1. Adicione no <head> de TODAS as suas páginas:
 *      <script src="https://seudominio.com/utm-tracker.js"></script>
 *
 *   2. No formulário de checkout, adicione campos hidden com os IDs:
 *      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
 *      src, fbclid, gclid, aa_referrer
 *      O script os preenche automaticamente.
 *
 *   3. Para ler os dados via JS:
 *      const utms = window.AdsAtivosTracker.get();
 *      // { utm_source: "facebook", utm_medium: "cpc", fbclid: "...", ... }
 */
;(function (window, document) {
  'use strict';

  var LS_KEY     = 'aa_utms_v2';
  var COOKIE_KEY = 'aa_utms';
  var TTL_DAYS   = 30;
  var TTL_MS     = TTL_DAYS * 24 * 3600 * 1000;

  var UTM_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign',
    'utm_content', 'utm_term', 'src', 'fbclid', 'gclid'
  ];

  // ── Helpers de Cookie ──────────────────────────────────────────────────────

  function setCookie(val) {
    var exp = new Date(Date.now() + TTL_DAYS * 86400000).toUTCString();
    document.cookie = COOKIE_KEY + '=' + encodeURIComponent(val) +
      '; expires=' + exp + '; path=/; SameSite=Lax';
  }

  function getCookie() {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE_KEY + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ── Serialização ────────────────────────────────────────────────────────────

  function save(data) {
    var raw = JSON.stringify(data);
    try { localStorage.setItem(LS_KEY, raw); } catch (e) { /* incognito */ }
    setCookie(raw);
  }

  function load() {
    var raw = getCookie() || (function() {
      try { return localStorage.getItem(LS_KEY); } catch(e) { return null; }
    })();
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      if (d._ts && (Date.now() - d._ts) > TTL_MS) return null;
      return d;
    } catch(e) { return null; }
  }

  // ── Referrer Classifier ─────────────────────────────────────────────────────

  function classifyReferrer() {
    var ref = document.referrer;
    if (!ref) return 'direct';
    try {
      var host = (new URL(ref)).hostname.replace(/^www\./,'');
      if (/google\./i.test(host))       return 'organic:google';
      if (/bing\./i.test(host))         return 'organic:bing';
      if (/facebook|fb\.com/i.test(host))  return 'social:facebook';
      if (/instagram/i.test(host))      return 'social:instagram';
      if (/tiktok/i.test(host))         return 'social:tiktok';
      if (/youtube/i.test(host))        return 'social:youtube';
      if (/twitter|x\.com/i.test(host)) return 'social:twitter';
      if (/linkedin/i.test(host))       return 'social:linkedin';
      if (/kwai/i.test(host))           return 'social:kwai';
      if (/t\.me|telegram/i.test(host)) return 'social:telegram';
      return 'referral:' + host;
    } catch(e) {
      return 'referral:' + ref.slice(0, 100);
    }
  }

  // ── Captura da URL ───────────────────────────────────────────────────────────

  function parseUrl() {
    var sp = new URLSearchParams(window.location.search);
    var out = {};
    UTM_KEYS.forEach(function(k) {
      var v = sp.get(k) || sp.get(k.replace('utm_', ''));
      if (v && v.trim()) out[k] = v.trim();
    });
    return out;
  }

  // ── Merge e Persistência ────────────────────────────────────────────────────

  var _cache = null;

  function capture() {
    if (_cache) return _cache;

    var fromUrl  = parseUrl();
    var stored   = load();
    var hasUrl   = UTM_KEYS.some(function(k) { return !!fromUrl[k]; });

    var merged   = {
      utm_source:   fromUrl.utm_source   || (stored && stored.utm_source)   || null,
      utm_medium:   fromUrl.utm_medium   || (stored && stored.utm_medium)   || null,
      utm_campaign: fromUrl.utm_campaign || (stored && stored.utm_campaign) || null,
      utm_content:  fromUrl.utm_content  || (stored && stored.utm_content)  || null,
      utm_term:     fromUrl.utm_term     || (stored && stored.utm_term)     || null,
      src:          fromUrl.src          || (stored && stored.src)          || null,
      fbclid:       fromUrl.fbclid       || (stored && stored.fbclid)       || null,
      gclid:        fromUrl.gclid        || (stored && stored.gclid)        || null,
      referrer:     (stored && stored.referrer) || classifyReferrer(),
      _ts:          hasUrl ? Date.now() : ((stored && stored._ts) || Date.now())
    };

    if (hasUrl || !stored) save(merged);
    _cache = merged;
    return merged;
  }

  // ── Injeção em formulários ───────────────────────────────────────────────────

  function injectForm(form) {
    var data = capture();
    var fields = [
      'utm_source', 'utm_medium', 'utm_campaign',
      'utm_content', 'utm_term', 'src', 'fbclid', 'gclid', 'aa_referrer'
    ];
    fields.forEach(function(name) {
      var key = name === 'aa_referrer' ? 'referrer' : name;
      var val = data[key];
      if (!val) return;

      // Tenta preencher campo existente
      var existing = form.querySelector('[name="' + name + '"]') ||
                     form.querySelector('#' + name);
      if (existing) {
        existing.value = val;
        return;
      }

      // Cria hidden input
      var input    = document.createElement('input');
      input.type   = 'hidden';
      input.name   = name;
      input.id     = name;
      input.value  = val;
      form.appendChild(input);
    });
  }

  function injectAllForms() {
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      injectForm(forms[i]);
    }
  }

  // ── Evento purchase ──────────────────────────────────────────────────────────

  function firePurchase(params) {
    var data = capture();
    // GTM dataLayer
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({
        event: 'purchase',
        ecommerce: {
          transaction_id: params.orderId,
          value:          params.value,
          currency:       params.currency || 'BRL',
          items: [{ item_id: params.productId, item_name: params.productName, price: params.value, quantity: 1 }],
        },
        utm_data: {
          source:   data.utm_source,
          medium:   data.utm_medium,
          campaign: data.utm_campaign,
          content:  data.utm_content,
          fbclid:   data.fbclid,
          gclid:    data.gclid,
        }
      });
    }
    // Meta Pixel
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'Purchase', {
        value:        params.value,
        currency:     params.currency || 'BRL',
        content_ids:  [params.productId],
        content_type: 'product',
      });
    }
  }

  // ── API pública ──────────────────────────────────────────────────────────────

  window.AdsAtivosTracker = {
    /** Retorna os UTMs capturados da sessão atual */
    get: capture,

    /** Injeta UTMs como hidden inputs em um formulário específico */
    inject: injectForm,

    /** Injeta UTMs em TODOS os formulários da página */
    injectAll: injectAllForms,

    /** Dispara eventos de compra no GTM / Meta Pixel */
    purchase: firePurchase,

    /** Limpa todos os dados persistidos */
    clear: function() {
      try { localStorage.removeItem(LS_KEY); } catch(e) {}
      document.cookie = COOKIE_KEY + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      _cache = null;
    }
  };

  // ── Auto-inicialização ───────────────────────────────────────────────────────

  // Captura UTMs imediatamente
  capture();

  // Injeta em formulários quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAllForms);
  } else {
    injectAllForms();
  }

  // Observa novos formulários adicionados dinamicamente (SPAs / modal checkout)
  if (typeof MutationObserver !== 'undefined') {
    var obs = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'FORM') {
            injectForm(node);
          } else {
            var forms = node.querySelectorAll && node.querySelectorAll('form');
            if (forms) {
              for (var i = 0; i < forms.length; i++) injectForm(forms[i]);
            }
          }
        });
      });
    });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

})(window, document);
