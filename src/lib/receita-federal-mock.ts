/**
 * Consulta CNPJ — ordem de provedores:
 * 1) ReceitaWS (RECEITAWS_API_TOKEN ou RECEITA_WS_BEARER_TOKEN)
 * 2) RECEITA_CNPJ_API_URL + RECEITA_CNPJ_API_KEY (API genérica compatível)
 * 3) CNPJ.ws comercial (CNPJ_WS_COMMERCIAL_TOKEN)
 * 4) CNPJ.ws pública (ADS_CORE_CNPJ_WS_PUBLIC=true)
 * 5) Mock determinístico (dev)
 */
import type { ConsultaCnpjResult } from '@/lib/receita-cnpj-types'
import { consultarCnpjReceitaWs } from '@/lib/receita-ws'
import { sanitizeAdsCoreAddress, sanitizeAdsCoreTextField } from '@/lib/ads-core-text-sanitize'

export type { ConsultaCnpjResult } from '@/lib/receita-cnpj-types'

function parseSecundariosFromApi(j: Record<string, unknown>): string[] {
  const out: string[] = []
  const pushCode = (x: unknown) => {
    if (typeof x === 'string' && x.trim()) out.push(x.trim())
    else if (x && typeof x === 'object' && 'code' in (x as object)) {
      const c = (x as { code?: string }).code
      if (c?.trim()) out.push(c.trim())
    }
  }
  const sec = j.atividades_secundarias ?? j.cnaes_secundarios ?? j.secondary_activities
  if (Array.isArray(sec)) {
    for (const item of sec) pushCode(item)
  }
  return [...new Set(out)]
}

function secundariosFromCnpjWsEst(sec: unknown): string[] {
  const out: string[] = []
  if (!Array.isArray(sec)) return out
  for (const item of sec) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const sub = o.subclasse
    const id = o.id
    if (typeof sub === 'string' && sub.trim()) out.push(sub.trim())
    else if (typeof id === 'string' && id.trim()) out.push(id.trim())
  }
  return [...new Set(out)]
}

function mapCnpjWsResponse(j: Record<string, unknown>, d: string): ConsultaCnpjResult | null {
  const est = j.estabelecimento as Record<string, unknown> | undefined
  if (!est) return null
  const ap = est.atividade_principal as Record<string, unknown> | undefined
  const razao = sanitizeAdsCoreTextField(j.razao_social as string)
  const fantasia = sanitizeAdsCoreTextField(est.nome_fantasia as string)
  const cidade = est.cidade as Record<string, unknown> | undefined
  const estado = est.estado as Record<string, unknown> | undefined
  const logradouro = [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ').trim()
  const parts = [logradouro, est.numero, est.bairro, cidade?.nome, estado?.sigla, est.cep ? `CEP ${est.cep}` : null].filter(
    Boolean
  )
  const endereco = sanitizeAdsCoreAddress(parts.length ? String(parts.join(', ')) : null)
  const telA = [est.ddd1, est.telefone1].filter(Boolean).join('')
  const telB = [est.ddd2, est.telefone2].filter(Boolean).join('')
  const telefone = sanitizeAdsCoreTextField([telA, telB].filter(Boolean).join(' / ') || null)
  const situacao = String(est.situacao_cadastral || '').trim()
  const up = situacao.toUpperCase()
  const statusReceita = up.includes('ATIV') ? 'ATIVA' : up || 'DESCONHECIDA'

  const cepDigits = est.cep != null ? String(est.cep).replace(/\D/g, '') : ''
  const logradouroStr = logradouro || null
  const numeroStr = est.numero != null ? sanitizeAdsCoreTextField(String(est.numero)) : null
  const bairroStr = est.bairro != null ? sanitizeAdsCoreTextField(String(est.bairro)) : null
  const cidadeNome = cidade?.nome != null ? sanitizeAdsCoreTextField(String(cidade.nome)) : null
  const ufSigla = estado?.sigla != null ? sanitizeAdsCoreTextField(String(estado.sigla))?.toUpperCase().slice(0, 2) : null

  return {
    cnpj: (est.cnpj as string) || d,
    razaoSocial: razao,
    nomeFantasia: fantasia,
    endereco,
    logradouro: logradouroStr,
    numero: numeroStr,
    bairro: bairroStr,
    cidade: cidadeNome,
    estado: ufSigla,
    cep: cepDigits.length >= 8 ? cepDigits : null,
    emailEmpresa: sanitizeAdsCoreTextField(est.email as string)?.toLowerCase() || null,
    telefone,
    cnae: sanitizeAdsCoreTextField((ap?.subclasse as string) || (ap?.id as string) || null),
    cnaeDescricao: sanitizeAdsCoreTextField((ap?.descricao as string) || null),
    cnaeSecundarios: secundariosFromCnpjWsEst(est.atividades_secundarias),
    statusReceita,
    source: 'cnpjws',
  }
}

async function fetchCnpjWs(d: string, commercialToken?: string): Promise<ConsultaCnpjResult | null> {
  const url = commercialToken
    ? `https://comercial.cnpj.ws/cnpj/${d}?token=${encodeURIComponent(commercialToken)}`
    : `https://publica.cnpj.ws/cnpj/${d}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  })
  if (!res.ok) return null
  const j = (await res.json()) as Record<string, unknown>
  return mapCnpjWsResponse(j, d)
}

async function consultarCnpjCustomApi(d: string): Promise<ConsultaCnpjResult | null> {
  const useReal = process.env.RECEITA_CNPJ_API_URL && process.env.RECEITA_CNPJ_API_KEY
  if (!useReal) return null
  try {
    const url = `${process.env.RECEITA_CNPJ_API_URL!.replace(/\/$/, '')}/${d}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.RECEITA_CNPJ_API_KEY}` },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    return {
      cnpj: d,
      razaoSocial: sanitizeAdsCoreTextField((j.razao_social as string) || (j.razaoSocial as string)),
      nomeFantasia: sanitizeAdsCoreTextField((j.nome_fantasia as string) || (j.nomeFantasia as string)),
      endereco: sanitizeAdsCoreAddress((j.logradouro as string) || (j.endereco as string)),
      emailEmpresa: sanitizeAdsCoreTextField(j.email as string)?.toLowerCase() || null,
      telefone: sanitizeAdsCoreTextField(typeof j.telefone === 'string' ? j.telefone : null),
      cnae: sanitizeAdsCoreTextField((j.cnae_fiscal as string) || (j.cnae as string)),
      cnaeDescricao: sanitizeAdsCoreTextField(
        (j.cnae_fiscal_descricao as string) || (j.atividade_principal as string) || (j.cnaeDescricao as string)
      ),
      cnaeSecundarios: parseSecundariosFromApi(j),
      statusReceita: sanitizeAdsCoreTextField((j.situacao as string) || (j.status as string) || 'ATIVA') || 'ATIVA',
      source: 'api',
    }
  } catch {
    return null
  }
}

export async function consultarCnpjReceita(cnpjDigits: string): Promise<ConsultaCnpjResult | null> {
  const d = cnpjDigits.replace(/\D/g, '')
  if (d.length !== 14) return null

  const receitaWs = await consultarCnpjReceitaWs(d)
  if (receitaWs) return receitaWs

  const custom = await consultarCnpjCustomApi(d)
  if (custom) return custom

  const commercial = process.env.CNPJ_WS_COMMERCIAL_TOKEN
  if (commercial) {
    try {
      const r = await fetchCnpjWs(d, commercial)
      if (r) return r
    } catch {
      /* próximo */
    }
  }

  if (process.env.ADS_CORE_CNPJ_WS_PUBLIC === 'true') {
    try {
      const r = await fetchCnpjWs(d)
      if (r) return r
    } catch {
      /* mock */
    }
  }

  const suffix = d.slice(-4)
  const n = parseInt(suffix, 10) % 900 + 100
  const main = `47${(n % 90).toString().padStart(2, '0')}-1/00`
  const secDigit = ((n + 3) % 90).toString().padStart(2, '0')
  const sec = `56${secDigit}0/00`
  return {
    cnpj: d,
    razaoSocial: `EMPRESA MOCK LTDA ${suffix}`,
    nomeFantasia: `Fantasia ${suffix}`,
    endereco: `Rua Exemplo, ${n} — São Paulo/SP`,
    logradouro: 'Rua Exemplo',
    numero: String(n),
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01310100',
    emailEmpresa: `contato${suffix}@empresa-mock.com.br`,
    telefone: `(11) 9${suffix.slice(0, 4)}-${suffix}`,
    cnae: main,
    cnaeDescricao: 'Comércio varejista especializado de equipamentos de informática (mock)',
    cnaeSecundarios: [sec],
    statusReceita: 'ATIVA',
    source: 'mock',
  }
}
