/** Injeta widget WhatsApp (estilo Join.Chat) + dataLayer antes de </body> em HTML estático (landings). */
export function injectWhatsAppWidgetBeforeBodyClose(html: string, telephone: string, niche: string): string {
  const digits = telephone.replace(/\D/g, '')
  if (digits.length < 10) return html
  const safeNiche = String(niche || 'seus serviços').replace(/[<>]/g, '').slice(0, 180)
  const snippet = `
<div id="erp-wa-widget-root" style="position:fixed;bottom:20px;right:20px;z-index:99999;font-family:system-ui,sans-serif">
  <a id="erp-wa-btn" href="#" target="_blank" rel="noopener noreferrer"
     style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:9999px;background:#25D366;box-shadow:0 8px 24px rgba(0,0,0,.2);text-decoration:none"
     aria-label="WhatsApp">
    <svg width="28" height="28" viewBox="0 0 32 32" fill="white"><path d="M16 3C9.383 3 4 8.383 4 15c0 2.386.672 4.61 1.825 6.5L4 29l7.61-1.975A11.94 11.94 0 0016 27c6.617 0 12-5.383 12-12S22.617 3 16 3z"/></svg>
  </a>
</div>
<script>
(function(){
  var phone=${JSON.stringify(digits)};
  var niche=${JSON.stringify(safeNiche)};
  var btn=document.getElementById('erp-wa-btn');
  if(!btn)return;
  var text='Olá! Gostaria de mais informações sobre '+niche+'.';
  btn.href='https://wa.me/'+phone+'?text='+encodeURIComponent(text);
  btn.addEventListener('click',function(){
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({event:'whatsapp_click',source:'joinchat',contact_method:'whatsapp',timestamp:new Date().toISOString()});
  },true);
})();
</script>`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}\n</body>`)
  }
  return html + snippet
}
