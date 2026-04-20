/**
 * Geração de HTML via IA (OpenAI/Anthropic)
 * Fallback: template estático quando API não configurada
 */
import { injectGtmIntoHtml } from '@/lib/gtm'
import { injectWhatsAppWidgetBeforeBodyClose } from '@/lib/joinchat-html'
import { applyLandingInfra, type LandingInfraOptions } from '@/lib/landing-injections'
import { buildLandingPagePrompt } from './prompt'
import type { SanitizedBriefing } from './sanitize'

const OPENAI_API = process.env.OPENAI_API_KEY
const ANTHROPIC_API = process.env.ANTHROPIC_API_KEY

async function callOpenAI(prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.5,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI: ${res.status} - ${err}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content ?? ''
  return extractHtml(content)
}

async function callAnthropic(prompt: string): Promise<string> {
  const res = await fetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic: ${res.status} - ${err}`)
  }
  const data = (await res.json()) as { content?: { text?: string }[] }
  const text = data.content?.[0]?.text ?? ''
  return extractHtml(text)
}

function extractHtml(raw: string): string {
  const start = raw.indexOf('<!DOCTYPE') >= 0 ? raw.indexOf('<!DOCTYPE') : raw.indexOf('<html')
  const endTag = raw.lastIndexOf('</html>')
  if (start >= 0 && endTag > start) {
    return raw.slice(start, endTag + 7)
  }
  if (raw.includes('<html')) {
    const s = raw.indexOf('<html')
    const e = raw.lastIndexOf('</html>') + 7
    return raw.slice(s, e)
  }
  return raw
}

function buildStaticTemplate(briefing: SanitizedBriefing, gtmId?: string | null): string {
  const nome = briefing.nomeFantasia || briefing.nomeEmpresa || briefing.nicho
  const wa = briefing.whatsapp
    ? `https://wa.me/55${String(briefing.whatsapp).replace(/^55/, '')}`
    : null
  const servicos = briefing.servicos
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const oferta = briefing.ofertaUnica || briefing.objetivo || 'Entre em contato'
  const sub = briefing.solucao || briefing.objetivo || ''

  const legalName = briefing.nomeEmpresa || nome
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: legalName,
    areaServed: `${briefing.cidade}-${briefing.estado}`,
    telephone: briefing.telefone || briefing.whatsapp || undefined,
    address: briefing.endereco
      ? {
          '@type': 'PostalAddress',
          streetAddress: briefing.endereco,
          addressLocality: briefing.cidade,
          addressRegion: briefing.estado,
          addressCountry: 'BR',
        }
      : undefined,
  }

  const raw = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${briefing.nicho} em ${briefing.cidade} - ${nome}. ${oferta}">
  <title>${nome} - ${briefing.nicho} | ${briefing.cidade}</title>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
  <header class="bg-white shadow-sm">
    <div class="max-w-4xl mx-auto px-4 py-4">
      <h1 class="text-xl font-bold text-gray-900">${nome}</h1>
      <p class="text-sm text-gray-500">${briefing.nicho} · ${briefing.cidade}/${briefing.estado}</p>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-12">
    <section class="text-center mb-12">
      <h2 class="text-3xl font-bold text-gray-900 mb-4">${oferta}</h2>
      <p class="text-lg text-gray-600 mb-6">${sub}</p>
      <p class="text-xs text-gray-500 mb-4">Comunicacao institucional. Sem promessas absolutas de resultado.</p>
      ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">Fale conosco no WhatsApp</a>` : ''}
    </section>
    <section class="mb-12">
      <h3 class="text-xl font-semibold mb-4">Nossos Serviços</h3>
      <ul class="space-y-2">${servicos.map((s) => `<li class="text-gray-600">• ${s}</li>`).join('')}</ul>
    </section>
    ${briefing.perfilCliente ? `<section class="mb-12"><h3 class="text-xl font-semibold mb-2">Para quem é</h3><p class="text-gray-600">${briefing.perfilCliente}</p></section>` : ''}
  </main>
  <footer class="bg-gray-100 mt-16 py-8">
    <div class="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500">
      <p>${nome} · ${briefing.cidade}/${briefing.estado}</p>
      ${briefing.whatsapp ? `<p>WhatsApp: ${briefing.whatsapp}</p>` : ''}
      ${briefing.horarioAtendimento ? `<p>${briefing.horarioAtendimento}</p>` : ''}
      <p class="mt-2">Rodape legal: informacoes sujeitas a analise tecnica e comercial.</p>
      <p class="mt-4"><a href="#termos" class="underline">Termos de Uso</a> · <a href="#privacidade" class="underline">Política de Privacidade</a></p>
    </div>
  </footer>
</body>
</html>`
  let out = injectGtmIntoHtml(raw, gtmId)
  out = injectWhatsAppWidgetBeforeBodyClose(
    out,
    briefing.whatsapp || '',
    briefing.nicho || briefing.nomeEmpresa || 'seus serviços'
  )
  return out
}

export type GenerateLandingOptions = {
  /** Container GTM do cliente (ClientProfile.gtmId); injeta tags + whatsapp_click no HTML. */
  gtmId?: string | null
  /** Ecossistema: Vturb, rodapé, tracking, tema */
  infra?: LandingInfraOptions
}

export async function generateLandingHtml(
  briefing: SanitizedBriefing,
  options?: GenerateLandingOptions
): Promise<string> {
  const gtmId = options?.gtmId ?? null
  const prompt = buildLandingPagePrompt(briefing)

  const nicheLine = briefing.nicho || briefing.nomeEmpresa || 'seus serviços'

  const applyInfra = (rawHtml: string) => {
    const infra = options?.infra
    if (!infra) return rawHtml
    return applyLandingInfra(rawHtml, infra)
  }

  if (OPENAI_API) {
    const html = await callOpenAI(prompt)
    let out = injectGtmIntoHtml(html, gtmId)
    out = injectWhatsAppWidgetBeforeBodyClose(out, briefing.whatsapp || '', nicheLine)
    return applyInfra(out)
  }
  if (ANTHROPIC_API) {
    const html = await callAnthropic(prompt)
    let out = injectGtmIntoHtml(html, gtmId)
    out = injectWhatsAppWidgetBeforeBodyClose(out, briefing.whatsapp || '', nicheLine)
    return applyInfra(out)
  }

  return applyInfra(buildStaticTemplate(briefing, gtmId))
}
