/**
 * Integração ReceitaWS — GET {base}/{cnpj14} com Authorization: Bearer &lt;token&gt;
 *
 * Token **somente** em variável de ambiente (nunca no código nem em commits):
 *   RECEITAWS_API_TOKEN=…
 *   ou RECEITA_WS_BEARER_TOKEN=…
 *
 * Base opcional (padrão oficial):
 *   RECEITAWS_API_BASE=https://receitaws.com.br/v1/cnpj
 */
import { sanitizeAdsCoreAddressFromParts, sanitizeAdsCoreTextField } from '@/lib/ads-core-text-sanitize'
import type { ConsultaCnpjResult } from '@/lib/receita-cnpj-types'

function receitawsBaseUrl(): string {
  const raw = process.env.RECEITAWS_API_BASE?.trim()
  if (raw) return raw.replace(/\/$/, '')
  return 'https://receitaws.com.br/v1/cnpj'
}

function receitawsBearer(): string | null {
  const t = process.env.RECEITAWS_API_TOKEN || process.env.RECEITA_WS_BEARER_TOKEN
  return t?.trim() || null
}

/** Telefone: string direta ou combinação DDD + número (variações do JSON). */
function pickTelefone(j: Record<string, unknown>): string | null {
  const tel = j.telefone
  if (typeof tel === 'string' && tel.trim()) return sanitizeAdsCoreTextField(tel)
  const ddd = sanitizeAdsCoreTextField(j.ddd as string)
  const tel1 = sanitizeAdsCoreTextField(j.telefone1 as string)
  if (ddd && tel1) return sanitizeAdsCoreTextField(`${ddd} ${tel1}`)
  const alt = j.telefone_principal
  if (typeof alt === 'string' && alt.trim()) return sanitizeAdsCoreTextField(alt)
  return null
}

function parseAtividadesSecundarias(j: Record<string, unknown>): string[] {
  const sec = j.atividades_secundarias
  if (!Array.isArray(sec)) return []
  const out: string[] = []
  for (const item of sec) {
    if (item && typeof item === 'object' && 'code' in item) {
      const c = (item as { code?: string }).code
      if (c?.trim()) out.push(c.trim())
    }
  }
  return [...new Set(out)]
}

function primaryCnae(j: Record<string, unknown>): { code: string | null; text: string | null } {
  const ap = j.atividade_principal
  if (!Array.isArray(ap) || ap.length === 0) return { code: null, text: null }
  const first = ap[0]
  if (!first || typeof first !== 'object') return { code: null, text: null }
  const o = first as { code?: string; text?: string }
  return {
    code: o.code?.trim() || null,
    text: o.text?.trim() || null,
  }
}

/**
 * Consulta CNPJ na ReceitaWS com Bearer. Retorna null se token ausente, HTTP erro ou status ERROR.
 */
export async function consultarCnpjReceitaWs(cnpj14: string): Promise<ConsultaCnpjResult | null> {
  const token = receitawsBearer()
  if (!token) return null

  const d = cnpj14.replace(/\D/g, '')
  if (d.length !== 14) return null

  const url = `${receitawsBaseUrl()}/${d}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      next: { revalidate: 0 },
    })
  } catch {
    return null
  }

  if (!res.ok) return null

  let j: Record<string, unknown>
  try {
    j = (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }

  if (j.status === 'ERROR') {
    if (process.env.NODE_ENV === 'development' && typeof j.message === 'string') {
      console.warn('[receitaws]', j.message)
    }
    return null
  }
  if (typeof j.message === 'string' && j.message.toLowerCase().includes('too many requests')) return null

  const situacaoRaw = sanitizeAdsCoreTextField(j.situacao as string) || ''
  const statusReceita = situacaoRaw.toUpperCase() || 'DESCONHECIDA'

  const { code: cnaeCode, text: cnaeText } = primaryCnae(j)

  const cepDigits = j.cep != null ? String(j.cep).replace(/\D/g, '') : ''
  const cepLabel =
    cepDigits.length >= 8 ? `CEP ${cepDigits}` : j.cep != null ? sanitizeAdsCoreTextField(String(j.cep)) : null

  const logradouroRaw = sanitizeAdsCoreTextField(j.logradouro as string)
  const numeroRaw = sanitizeAdsCoreTextField(j.numero as string)
  const bairroRaw = sanitizeAdsCoreTextField(j.bairro as string)
  const cidadeRaw = sanitizeAdsCoreTextField(j.municipio as string)
  const ufRaw = sanitizeAdsCoreTextField(j.uf as string)?.toUpperCase().slice(0, 2) || null
  const cepOnly = cepDigits.length >= 8 ? cepDigits : null

  const asPart = (v: unknown): string | null | undefined =>
    v == null ? null : typeof v === 'string' ? v : String(v)

  const endereco = sanitizeAdsCoreAddressFromParts([
    asPart(j.logradouro),
    asPart(j.numero),
    asPart(j.complemento),
    asPart(j.bairro),
    asPart(j.municipio),
    asPart(j.uf),
    cepLabel,
  ])

  return {
    cnpj: d,
    razaoSocial: sanitizeAdsCoreTextField(j.nome as string),
    nomeFantasia: sanitizeAdsCoreTextField(j.fantasia as string),
    endereco,
    logradouro: logradouroRaw,
    numero: numeroRaw,
    bairro: bairroRaw,
    cidade: cidadeRaw,
    estado: ufRaw,
    cep: cepOnly,
    emailEmpresa: sanitizeAdsCoreTextField(j.email as string)?.toLowerCase() || null,
    telefone: pickTelefone(j),
    cnae: cnaeCode,
    cnaeDescricao: cnaeText,
    cnaeSecundarios: parseAtividadesSecundarias(j),
    statusReceita,
    source: 'receitaws',
  }
}

export function isReceitaWsConfigured(): boolean {
  return !!receitawsBearer()
}
