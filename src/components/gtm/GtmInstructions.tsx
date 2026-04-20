/**
 * Instruções para configurar o acionador whatsapp_click no painel do Google Tag Manager.
 */
export function GtmInstructions() {
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <ol className="list-decimal pl-5 space-y-2">
        <li>
          No GTM, abra o container correspondente ao ID que você cadastrou no ERP (
          <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">GTM-XXXXXXX</code>
          ).
        </li>
        <li>
          Crie um <strong>Acionador</strong> do tipo <strong>Evento personalizado</strong> (Custom Event).
        </li>
        <li>
          Nome do evento: <code className="text-xs font-mono bg-emerald-100 dark:bg-emerald-900/40 px-1 rounded">whatsapp_click</code>{' '}
          (exatamente assim — o ERP envia este evento no <code className="text-xs">dataLayer</code> ao clicar em links{' '}
          <code className="text-xs">wa.me</code> ou <code className="text-xs">api.whatsapp.com</code>).
        </li>
        <li>
          Crie uma <strong>Tag</strong> (ex.: Google Ads: conversão ou GA4) e associe ao acionador{' '}
          <code className="text-xs">whatsapp_click</code>.
        </li>
        <li>Publique o container no GTM.</li>
      </ol>
      <p className="text-xs text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-lg p-3 bg-amber-500/10">
        O evento inclui <code className="text-xs">contact_method: &quot;whatsapp&quot;</code> e{' '}
        <code className="text-xs">timestamp</code> em ISO 8601. Use isso para atribuição e lances no Google Ads (Smart
        Bidding).
      </p>
    </div>
  )
}
