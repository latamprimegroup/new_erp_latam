/**
 * Integração com API de CNPJ (Receita Federal / Brasil API)
 * Fonte: Brasil API - https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 * Alternativa: ReceitaWS
 */

const BRASIL_API_CNPJ = 'https://brasilapi.com.br/api/cnpj/v1'
const RECEITAWS_CNPJ = 'https://www.receitaws.com.br/v1/cnpj'

/** Situação cadastral "ATIVA" (texto Brasil API / ReceitaWS). */
export const CNPJ_SITUACAO_ATIVA_RE = /^ativa$/i

export type CnpjApiResponse = {
  cnpj: string
  razao_social: string
  nome_fantasia?: string
  cnae_fiscal: number
  cnae_fiscal_descricao?: string
  cnaes_secundarios?: Array<{ codigo: number; descricao: string }>
  situacao_cadastral?: number
  descricao_situacao_cadastral?: string
  data_situacao_cadastral?: string
  email?: string
  telefone?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  uf?: string
  cep?: string
}

export type CnpjNormalized = {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  cnae: string
  cnaeDescricao: string | null
  cnaesSecundarios: Array<{ codigo: number; descricao: string }>
  situacaoCadastral: string | null
  dataSituacaoCadastral: string | null
  municipio: string | null
  uf: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
}

function cleanCnpj(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Normaliza resposta da API para o formato interno
 */
function normalizeBrasilApi(data: CnpjApiResponse & Record<string, unknown>): CnpjNormalized {
  const cnaeSec = (data.cnaes_secundarios as CnpjApiResponse['cnaes_secundarios']) || []
  const cepRaw = data.cep != null ? String(data.cep) : ''
  return {
    cnpj: cleanCnpj(String(data.cnpj)),
    razaoSocial: String(data.razao_social || ''),
    nomeFantasia: data.nome_fantasia ? String(data.nome_fantasia) : null,
    cnae: String(data.cnae_fiscal || ''),
    cnaeDescricao: data.cnae_fiscal_descricao ? String(data.cnae_fiscal_descricao) : null,
    cnaesSecundarios: Array.isArray(cnaeSec) ? cnaeSec : [],
    situacaoCadastral: data.descricao_situacao_cadastral ? String(data.descricao_situacao_cadastral) : null,
    dataSituacaoCadastral: data.data_situacao_cadastral ? String(data.data_situacao_cadastral) : null,
    municipio: data.municipio != null ? String(data.municipio) : null,
    uf: data.uf != null ? String(data.uf) : null,
    cep: cepRaw ? cepRaw.replace(/\D/g, '') : null,
    logradouro: data.logradouro != null ? String(data.logradouro) : null,
    numero: data.numero != null ? String(data.numero) : null,
    complemento: data.complemento != null ? String(data.complemento) : null,
    bairro: data.bairro != null ? String(data.bairro) : null,
  }
}

function normalizeReceitaWs(data: Record<string, unknown>): CnpjNormalized {
  const atividades = (data.atividades_secundarias as Array<{ code: string; text: string }>) || []
  const atividadePrincipal = (data.atividade_principal as Array<{ code: string; text: string }>)?.[0]
  const cepStr = data.cep != null ? String(data.cep) : ''
  return {
    cnpj: cleanCnpj(String(data.cnpj || '')),
    razaoSocial: String(data.nome || data.razao_social || ''),
    nomeFantasia: data.fantasia ? String(data.fantasia) : null,
    cnae: atividadePrincipal?.code ? String(atividadePrincipal.code) : '',
    cnaeDescricao: atividadePrincipal?.text ? String(atividadePrincipal.text) : null,
    cnaesSecundarios: atividades.map((a) => ({ codigo: parseInt(a.code, 10) || 0, descricao: a.text || '' })),
    situacaoCadastral: data.situacao ? String(data.situacao) : null,
    dataSituacaoCadastral: data.data_situacao ? String(data.data_situacao) : null,
    municipio: data.municipio != null ? String(data.municipio) : null,
    uf: data.uf != null ? String(data.uf) : null,
    cep: cepStr ? cepStr.replace(/\D/g, '') : null,
    logradouro: data.logradouro != null ? String(data.logradouro) : null,
    numero: data.numero != null ? String(data.numero) : null,
    complemento: data.complemento != null ? String(data.complemento) : null,
    bairro: data.bairro != null ? String(data.bairro) : null,
  }
}

/**
 * Consulta CNPJ na Brasil API (primary)
 */
export async function fetchCnpjBrasilApi(cnpj: string): Promise<CnpjNormalized | null> {
  const cnpjClean = cleanCnpj(cnpj)
  if (cnpjClean.length !== 14) return null

  const url = `${BRASIL_API_CNPJ}/${cnpjClean}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return null

  const data = (await res.json()) as CnpjApiResponse & Record<string, unknown>
  if (!data?.cnpj) return null

  return normalizeBrasilApi(data)
}

/** Consulta CNPJ na Brasil API sem cache HTTP (ingestão / Gatekeeper). */
export async function fetchCnpjBrasilApiNoStore(cnpj: string): Promise<CnpjNormalized | null> {
  const cnpjClean = cleanCnpj(cnpj)
  if (cnpjClean.length !== 14) return null

  const url = `${BRASIL_API_CNPJ}/${cnpjClean}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null

  const data = (await res.json()) as CnpjApiResponse & Record<string, unknown>
  if (!data?.cnpj) return null

  return normalizeBrasilApi(data)
}

/**
 * Consulta CNPJ na ReceitaWS (fallback)
 */
export async function fetchCnpjReceitaWs(cnpj: string): Promise<CnpjNormalized | null> {
  const cnpjClean = cleanCnpj(cnpj)
  if (cnpjClean.length !== 14) return null

  const url = `${RECEITAWS_CNPJ}/${cnpjClean}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return null

  const data = (await res.json()) as Record<string, unknown>
  if (data.status === 'ERROR' || !data.cnpj) return null

  return normalizeReceitaWs(data)
}

/**
 * Consulta CNPJ com fallback automático
 */
export async function fetchCnpjReceitaFederal(cnpj: string): Promise<CnpjNormalized | null> {
  const fromBrasil = await fetchCnpjBrasilApi(cnpj)
  if (fromBrasil) return fromBrasil

  const fromReceitaWs = await fetchCnpjReceitaWs(cnpj)
  return fromReceitaWs
}
