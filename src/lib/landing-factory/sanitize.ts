/**
 * Sanitização de inputs do briefing - anti-injection
 */
const MAX_LENGTHS = {
  nomeEmpresa: 200,
  nomeFantasia: 200,
  nicho: 200,
  subnicho: 200,
  cidade: 100,
  estado: 2,
  cnpj: 18,
  endereco: 300,
  telefone: 20,
  whatsapp: 20,
  email: 150,
  horarioAtendimento: 100,
  servicos: 5000,
  diferenciais: 3000,
  objetivo: 50,
  objetivoOutro: 200,
  tipoCliente: 500,
  problemasDemandas: 1000,
  perfilCliente: 2000,
  restricoes: 1000,
  publicoAlvo: 500,
  dor: 3000,
  solucao: 3000,
  ofertaUnica: 2000,
} as const

/** Remove tags HTML e caracteres perigosos */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .trim()
}

/** Sanitiza texto genérico */
export function sanitizeText(value: string, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return stripHtml(value).slice(0, maxLen)
}

/** Sanitiza telefone/WhatsApp (apenas números) */
export function sanitizePhone(value: string, maxLen = 20): string {
  if (typeof value !== 'string') return ''
  const digits = value.replace(/\D/g, '')
  return digits.slice(0, maxLen)
}

/** Sanitiza email */
export function sanitizeEmail(value: string): string {
  if (typeof value !== 'string') return ''
  const v = stripHtml(value).slice(0, 150)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ''
}

/** Sanitiza CNPJ (apenas números) */
export function sanitizeCnpj(value: string): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\D/g, '').slice(0, 14)
}

export interface SanitizedBriefing {
  nomeEmpresa: string
  nomeFantasia: string | null
  nicho: string
  subnicho: string | null
  cidade: string
  estado: string
  cnpj: string | null
  endereco: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  horarioAtendimento: string | null
  servicos: string
  anosExperiencia: number | null
  diferenciais: string | null
  objetivo: string | null
  objetivoOutro: string | null
  tipoCliente: string | null
  problemasDemandas: string | null
  perfilCliente: string | null
  restricoes: string | null
  publicoAlvo: string | null
  dor: string | null
  solucao: string | null
  ofertaUnica: string | null
}

export function sanitizeBriefing(input: Record<string, unknown>): SanitizedBriefing {
  const wa = sanitizePhone(String(input.whatsapp ?? ''), 20)
  return {
    nomeEmpresa: sanitizeText(String(input.nomeEmpresa ?? ''), MAX_LENGTHS.nomeEmpresa),
    nomeFantasia: (() => {
      const v = sanitizeText(String(input.nomeFantasia ?? ''), MAX_LENGTHS.nomeFantasia)
      return v || null
    })(),
    nicho: sanitizeText(String(input.nicho ?? ''), MAX_LENGTHS.nicho),
    subnicho: (() => {
      const v = sanitizeText(String(input.subnicho ?? ''), MAX_LENGTHS.subnicho)
      return v || null
    })(),
    cidade: sanitizeText(String(input.cidade ?? ''), MAX_LENGTHS.cidade),
    estado: sanitizeText(String(input.estado ?? ''), MAX_LENGTHS.estado).slice(0, 2).toUpperCase(),
    cnpj: (() => {
      const v = sanitizeCnpj(String(input.cnpj ?? ''))
      return v.length >= 14 ? v : null
    })(),
    endereco: (() => {
      const v = sanitizeText(String(input.endereco ?? ''), MAX_LENGTHS.endereco)
      return v || null
    })(),
    telefone: (() => {
      const v = sanitizePhone(String(input.telefone ?? ''))
      return v.length >= 10 ? v : null
    })(),
    whatsapp: wa.length >= 10 ? wa : null,
    email: (() => {
      const v = sanitizeEmail(String(input.email ?? ''))
      return v || null
    })(),
    horarioAtendimento: (() => {
      const v = sanitizeText(String(input.horarioAtendimento ?? ''), MAX_LENGTHS.horarioAtendimento)
      return v || null
    })(),
    servicos: sanitizeText(String(input.servicos ?? ''), MAX_LENGTHS.servicos),
    anosExperiencia: (() => {
      const n = parseInt(String(input.anosExperiencia ?? ''), 10)
      return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
    })(),
    diferenciais: (() => {
      const v = sanitizeText(String(input.diferenciais ?? ''), MAX_LENGTHS.diferenciais)
      return v || null
    })(),
    objetivo: (() => {
      const v = sanitizeText(String(input.objetivo ?? ''), 50)
      const opts = ['LIGACOES', 'WHATSAPP', 'ORCAMENTO', 'AGENDAMENTO', 'PRESENCIAL', 'OUTRO']
      return opts.includes(v) ? v : (v ? 'OUTRO' : null)
    })(),
    objetivoOutro: (() => {
      const v = sanitizeText(String(input.objetivoOutro ?? ''), MAX_LENGTHS.objetivoOutro)
      return v || null
    })(),
    tipoCliente: (() => {
      const v = sanitizeText(String(input.tipoCliente ?? ''), MAX_LENGTHS.tipoCliente)
      return v || null
    })(),
    problemasDemandas: (() => {
      const v = sanitizeText(String(input.problemasDemandas ?? ''), MAX_LENGTHS.problemasDemandas)
      return v || null
    })(),
    perfilCliente: (() => {
      const v = sanitizeText(String(input.perfilCliente ?? ''), MAX_LENGTHS.perfilCliente)
      return v || null
    })(),
    restricoes: (() => {
      const v = sanitizeText(String(input.restricoes ?? ''), MAX_LENGTHS.restricoes)
      return v || null
    })(),
    publicoAlvo: (() => {
      const v = sanitizeText(String(input.publicoAlvo ?? ''), MAX_LENGTHS.publicoAlvo)
      return v || null
    })(),
    dor: (() => {
      const v = sanitizeText(String(input.dor ?? ''), MAX_LENGTHS.dor)
      return v || null
    })(),
    solucao: (() => {
      const v = sanitizeText(String(input.solucao ?? ''), MAX_LENGTHS.solucao)
      return v || null
    })(),
    ofertaUnica: (() => {
      const v = sanitizeText(String(input.ofertaUnica ?? ''), MAX_LENGTHS.ofertaUnica)
      return v || null
    })(),
  }
}
