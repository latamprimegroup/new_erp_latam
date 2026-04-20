/**
 * Templates mínimos de lander — substituição de pixel e hash de vídeo (Video Order).
 */
export const PROVISIONING_TEMPLATE_KEYS = ['VSL-A', 'QUIZ-B', 'LEAD-C'] as const
export type ProvisioningTemplateKey = (typeof PROVISIONING_TEMPLATE_KEYS)[number]

export function buildLanderHtml(
  templateKey: string,
  domain: string,
  opts: { metaPixelId: string | null; videoVariantHash: string }
): string {
  const pixel = opts.metaPixelId?.trim() || ''
  const vh = opts.videoVariantHash
  const base = `https://${domain}`

  if (templateKey === 'QUIZ-B') {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Quiz — ${domain}</title>
${pixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');</script>` : ''}
</head><body style="font-family:system-ui,sans-serif;background:#0a0a0f;color:#e4e4e7;padding:1.5rem;">
<h1>Quiz</h1><p>Domínio: ${domain}</p><p>Video variant (hash): <code>${vh}</code></p><p><a href="${base}">Home</a></p>
</body></html>`
  }

  if (templateKey === 'LEAD-C') {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Lead — ${domain}</title></head>
<body style="background:#09090b;color:#fafafa;padding:2rem;font-family:system-ui;">
<h2>Captura</h2><p>Ref vídeo: ${vh}</p>
${pixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');</script>` : ''}
</body></html>`
  }

  // VSL-A default
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>VSL — ${domain}</title>
${pixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');</script>` : ''}
<style>body{font-family:system-ui;background:#09090b;color:#f4f4f5;margin:0;padding:2rem;line-height:1.5}.badge{display:inline-block;padding:.25rem .6rem;border-radius:6px;background:rgba(34,211,238,.15);border:1px solid rgba(34,211,238,.4);font-size:12px}</style>
</head><body>
<span class="badge">Video Order · ${vh.slice(0, 12)}…</span>
<h1>Página VSL</h1><p>Domínio provisionado: <strong>${domain}</strong></p>
<p>Master key + hash único reduzem padrão repetido de mídia.</p>
</body></html>`
}
