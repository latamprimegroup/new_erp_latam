/**
 * Injeções do ecossistema (Vturb, rodapé compliance, tracking global, tema Black).
 */

export type LandingInfraOptions = {
  templateMode?: 'WHITE' | 'BLACK'
  vturbEmbed?: string | null
  footerHtml?: string | null
  /** Scripts UTMify / Redtrack / pixel — concatenados (global + página) */
  trackingScript?: string | null
}

export function applyLandingInfra(html: string, opts: LandingInfraOptions): string {
  let out = html
  const mode = opts.templateMode === 'BLACK' ? 'BLACK' : 'WHITE'

  if (mode === 'BLACK') {
    const tag = `<style data-aa-ecosystem="black">body{background:#09090b!important;color:#e4e4e7!important} header,footer{background:#18181b!important;border-color:#27272a!important}</style>`
    if (out.includes('</head>')) {
      out = out.replace('</head>', `${tag}</head>`)
    } else {
      out = tag + out
    }
  }

  const chunks: string[] = []
  if (opts.vturbEmbed?.trim()) {
    chunks.push(`<!-- vturb / VSL -->\n${opts.vturbEmbed.trim()}`)
  }
  if (opts.footerHtml?.trim()) {
    chunks.push(
      `<footer class="aa-compliance-footer" style="margin-top:3rem;padding:1.5rem;font-size:12px;opacity:.85;border-top:1px solid rgba(255,255,255,.1)">${opts.footerHtml.trim()}</footer>`
    )
  }
  if (opts.trackingScript?.trim()) {
    chunks.push(`<!-- tracking ecosystem -->\n${opts.trackingScript.trim()}`)
  }

  if (chunks.length === 0) return out

  const block = `\n${chunks.join('\n')}\n`
  if (out.includes('</body>')) {
    return out.replace('</body>', `${block}</body>`)
  }
  return out + block
}

/** Sugestão de rodapé a partir de dados de verificação Google / empresa */
export function suggestComplianceFooter(params: {
  nomeEmpresa: string
  cnpj?: string | null
  cidade: string
  estado: string
}): string {
  const cnpj = params.cnpj?.replace(/\D/g, '')
  const cnpjFmt = cnpj && cnpj.length === 14 ? formatCnpj(cnpj) : params.cnpj || ''
  return [
    params.nomeEmpresa,
    cnpjFmt ? `CNPJ ${cnpjFmt}` : '',
    `${params.cidade}/${params.estado}`,
    'Política de privacidade e termos aplicáveis ao anunciante.',
  ]
    .filter(Boolean)
    .join(' · ')
}

function formatCnpj(d: string): string {
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}
