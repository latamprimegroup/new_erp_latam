/**
 * Google Tag Manager — snippets reutilizáveis (ERP + HTML estático de landing).
 * O ID efetivo vem de ClientProfile.gtmId (por cliente); NEXT_PUBLIC_GTM_ID é fallback opcional.
 */

const GTM_ID_RE = /^GTM-[A-Z0-9]+$/i

export function normalizeGtmId(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  return GTM_ID_RE.test(t) ? t.toUpperCase() : null
}

/** Script padrão GTM (inserir o mais cedo possível no head; no Next usar Script afterInteractive). */
export function buildGtmHeadInlineScript(gtmId: string): string {
  const id = normalizeGtmId(gtmId)
  if (!id) return ''
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`
}

export function buildGtmNoscriptIframe(gtmId: string): string {
  const id = normalizeGtmId(gtmId)
  if (!id) return ''
  return `<iframe src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe>`
}

/**
 * Rastreamento global de cliques WhatsApp → dataLayer (HTML estático / preview).
 * Compatível com DOM dinâmico (MutationObserver).
 */
export function buildWhatsAppDataLayerInlineScript(): string {
  return `(function(){
  function pushWa(){
    window.dataLayer=window.dataLayer||[];
  }
  function onClick(e){
    pushWa();
    var el=e.target;
    while(el&&el!==document.body){
      if(el.tagName==='A'&&el.getAttribute('href')){
        var h=el.getAttribute('href')||'';
        if(h.indexOf('wa.me')>=0||h.indexOf('api.whatsapp.com')>=0){
          window.dataLayer.push({
            event:'whatsapp_click',
            contact_method:'whatsapp',
            timestamp:new Date().toISOString()
          });
          break;
        }
      }
      el=el.parentElement;
    }
  }
  function bind(){
    document.addEventListener('click',onClick,true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();`
}

/** Injeta GTM + rastreamento WhatsApp em HTML completo (ex.: saída de IA). */
export function injectGtmIntoHtml(html: string, gtmId: string | null | undefined): string {
  const id = normalizeGtmId(gtmId)
  if (!id) return html
  const headBlock = [
    `<script>window.dataLayer=window.dataLayer||[];</script>`,
    `<script>${buildGtmHeadInlineScript(id)}</script>`,
    `<script>${buildWhatsAppDataLayerInlineScript()}</script>`,
  ].join('\n')

  let out = html
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${headBlock}\n</head>`)
  } else if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n${headBlock}`)
  } else {
    out = `${headBlock}\n${out}`
  }

  const ns = `<noscript>${buildGtmNoscriptIframe(id)}</noscript>`
  if (/<body[^>]*>/i.test(out)) {
    out = out.replace(/<body([^>]*)>/i, `<body$1>${ns}`)
  }
  return out
}
