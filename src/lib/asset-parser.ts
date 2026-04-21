/**
 * Asset Intake Parser
 * Transforma texto bruto do WhatsApp/Telegram em registros estruturados de ativos.
 *
 * Suporta múltiplos formatos:
 *   - Linha por campo: "Gasto: 238k | Nicho: Imobiliária | Ano: 2012 ..."
 *   - Lista numerada:  "1. Gasto: 238k ..."
 *   - Bloco por ativo separado por linha em branco
 *   - Formato tabular com pipes
 *
 * Nomenclatura resultante segue taxonomia Ads Ativos:
 *   AA-G12-HS-001 = Google | Ano 2012 | High Spend | Seq 001
 */

import { prisma } from '@/lib/prisma'
import type { AssetCategory } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type ParsedAssetRow = {
  /** Dados extraídos do texto bruto */
  rawNiche:       string
  rawSpend:       string
  year:           number | null
  spendValue:     number        // valor numérico do gasto
  currency:       'BRL' | 'USD'
  faturamento:    string | null // CNPJ | CPF | Ambos | null
  pagamento:      string | null
  verificacao:    string | null // 2FA | Email | SMS | null
  aquecimento:    string | null // "30 dias" | "60 dias" | null
  platform:       Platform
  rawLine:        string        // linha original para auditoria

  /** Gerado pelo transformador */
  adsId:          string        // AA-G12-HS-001
  displayName:    string        // "Diamond Real Estate - High Spend"
  description:    string
  spendClass:     SpendClass
  suggestedPrice: number        // preço sugerido em BRL
  tags:           string

  /** Erros de parsing, se houver */
  warnings:       string[]
}

export type Platform  = 'GOOGLE' | 'META' | 'TIKTOK' | 'TWITTER' | 'GENERIC'
export type SpendClass = 'HS' | 'MS' | 'LS' | 'DS'   // High/Mid/Low/Dollar

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_PREFIX: Record<Platform, string> = {
  GOOGLE:  'G',
  META:    'M',
  TIKTOK:  'T',
  TWITTER: 'X',
  GENERIC: 'A',
}

const SPEND_CLASS_LABEL: Record<SpendClass, string> = {
  HS: 'Diamond',
  MS: 'Gold',
  LS: 'Silver',
  DS: 'Global Dollar',
}

const NICHE_TRANSLATIONS: Record<string, string> = {
  'imobiliaria': 'Real Estate',    'imobiliária': 'Real Estate',
  'desentupidora': 'Plumbing',     'hyundai': 'Automotive',
  'automovel': 'Automotive',       'automóvel': 'Automotive',
  'saude': 'Healthcare',           'saúde': 'Healthcare',
  'ecommerce': 'E-Commerce',       'e-commerce': 'E-Commerce',
  'educacao': 'Education',         'educação': 'Education',
  'financeiro': 'Finance',         'juridico': 'Legal',
  'jurídico': 'Legal',             'restaurante': 'Food & Beverage',
  'varejo': 'Retail',              'tecnologia': 'Technology',
  'construcao': 'Construction',    'construção': 'Construction',
  'turismo': 'Tourism',            'clinica': 'Healthcare',
  'clínica': 'Healthcare',         'dentista': 'Healthcare',
  'seguro': 'Insurance',           'logistica': 'Logistics',
  'logística': 'Logistics',        'agencia': 'Agency',
  'agência': 'Agency',             'fitness': 'Fitness',
  'marketing': 'Marketing',        'infoprodu': 'Digital Products',
  'infoproduto': 'Digital Products','games': 'Gaming',
  'crypto': 'Crypto',              'cripto': 'Crypto',
  'moda': 'Fashion',               'beleza': 'Beauty',
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de extração
// ─────────────────────────────────────────────────────────────────────────────

/** Converte "238k", "3.2k", "$3.2k", "R$238.000", "238000" → número */
function parseSpendValue(raw: string): { value: number; currency: 'BRL' | 'USD' } {
  const clean   = raw.trim().replace(/\s/g, '')
  const isDollar = clean.includes('$') && !clean.toLowerCase().includes('r$') && !clean.toLowerCase().includes('r $')
  const noCurr  = clean.replace(/[R\$USD\s]/gi, '').replace(',', '.')
  let   value   = 0

  if (/^[\d.]+k$/i.test(noCurr)) {
    value = parseFloat(noCurr) * 1000
  } else if (/^[\d.]+m$/i.test(noCurr)) {
    value = parseFloat(noCurr) * 1_000_000
  } else {
    value = parseFloat(noCurr.replace(/\./g, '').replace(',', '.')) || 0
  }

  return { value, currency: isDollar ? 'USD' : 'BRL' }
}

/** Detecta plataforma a partir de keywords no texto */
function detectPlatform(text: string): Platform {
  const t = text.toLowerCase()
  if (t.includes('google') || t.includes('goog') || t.includes('ads.google')) return 'GOOGLE'
  if (t.includes('meta') || t.includes('facebook') || t.includes('fb') || t.includes('instagram')) return 'META'
  if (t.includes('tiktok') || t.includes('tik tok')) return 'TIKTOK'
  if (t.includes('twitter') || t.includes('x.com')) return 'TWITTER'
  return 'GENERIC'
}

/** Normaliza nicho para inglês comercial */
function normalizeNiche(niche: string): string {
  const key = niche.toLowerCase().trim()
  return NICHE_TRANSLATIONS[key] ?? capitalize(niche)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Classifica o gasto em tier */
function classifySpend(value: number, currency: 'BRL' | 'USD'): SpendClass {
  if (currency === 'USD')  return 'DS'
  if (value >= 100_000)    return 'HS'
  if (value >= 10_000)     return 'MS'
  return 'LS'
}

/** Gera nome comercial: "Diamond Real Estate - High Spend (2012)" */
function generateDisplayName(niche: string, spendClass: SpendClass, year: number | null, currency: 'BRL' | 'USD'): string {
  const tier   = SPEND_CLASS_LABEL[spendClass]
  const nicheEn = normalizeNiche(niche)
  const yrStr  = year ? ` (${year})` : ''
  const curr   = currency === 'USD' ? ' USD' : ''
  return `${tier} ${nicheEn}${curr}${yrStr}`
}

/** Gera ID no formato AA-G12-HS-001 */
function generateIntakeId(platform: Platform, year: number | null, spendClass: SpendClass, seq: number): string {
  const pfx = PLATFORM_PREFIX[platform]
  const yr  = year ? String(year).slice(-2) : '00'
  const seqStr = String(seq).padStart(3, '0')
  return `AA-${pfx}${yr}-${spendClass}-${seqStr}`
}

/** Gera preço sugerido estimado baseado em spend e tier */
function estimatePrice(value: number, currency: 'BRL' | 'USD'): number {
  const inBRL = currency === 'USD' ? value * 5.5 : value
  // Tabela de markup por faixa
  if (inBRL >= 500_000) return Math.round(inBRL * 0.02)   // 2% do gasto
  if (inBRL >= 200_000) return Math.round(inBRL * 0.025)
  if (inBRL >= 100_000) return Math.round(inBRL * 0.03)
  if (inBRL >= 10_000)  return Math.round(inBRL * 0.05)
  if (currency === 'USD') return Math.round(value * 80)   // flat USD premium
  return Math.round(inBRL * 0.1)
}

/** Gera tags automáticas */
function buildTags(niche: string, spendClass: SpendClass, currency: 'BRL' | 'USD', verificacao: string | null, year: number | null): string {
  const tags = [normalizeNiche(niche).toLowerCase()]
  if (spendClass === 'HS') tags.push('high-spend', 'diamond')
  if (spendClass === 'MS') tags.push('mid-spend', 'gold')
  if (spendClass === 'DS') tags.push('usd', 'dolar', 'global')
  if (verificacao && verificacao.toLowerCase().includes('2fa')) tags.push('2fa-verified')
  if (year && year < 2015) tags.push('conta-antiga', 'vintage')
  if (year && year >= 2020) tags.push('conta-recente')
  return tags.join(',')
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser Principal
// ─────────────────────────────────────────────────────────────────────────────

type RawFields = {
  gasto?: string; nicho?: string; ano?: string; faturamento?: string
  pagamento?: string; verificacao?: string; aquecimento?: string
}

/** Extrai campos de uma linha ou bloco */
function extractFields(text: string): RawFields {
  const fields: RawFields = {}

  const patterns: [keyof RawFields, RegExp][] = [
    ['gasto',       /(?:gasto|spend|spent|investimento|inv\.?)\s*[:=]\s*([^\|\n,]+)/i],
    ['nicho',       /(?:nicho|niche|segmento|setor|ramo|area|área|mercado)\s*[:=]\s*([^\|\n,]+)/i],
    ['ano',         /(?:ano|year|criacao|criação|criado em)\s*[:=]\s*(\d{4})/i],
    ['faturamento', /(?:faturamento|fat|doc|documento|cnpj|cpf|pj|pf)\s*[:=]\s*([^\|\n,]+)/i],
    ['pagamento',   /(?:pagamento|pgt|payment|forma de pag)\s*[:=]\s*([^\|\n,]+)/i],
    ['verificacao', /(?:verifica[cç][aã]o|verif|2fa|auth)\s*[:=]\s*([^\|\n,]+)/i],
    ['aquecimento', /(?:aquecimento|warm|warmup|warm-up)\s*[:=]\s*([^\|\n,]+)/i],
  ]

  for (const [key, rx] of patterns) {
    const m = text.match(rx)
    if (m) fields[key] = m[1].trim()
  }

  // Tenta extrair ano de 4 dígitos inline se não encontrou
  if (!fields.ano) {
    const yrM = text.match(/\b(20[0-2][0-9]|201[0-9]|200[0-9])\b/)
    if (yrM) fields.ano = yrM[1]
  }

  // Tenta extrair gasto inline (número com k/m)
  if (!fields.gasto) {
    const spM = text.match(/(?:R\$|USD?|\$)?\s*(\d[\d.,]*\s*[kmKM]?)\s*(?:de gasto|gasto|spent|investido)?/i)
    if (spM && spM[1]) fields.gasto = spM[1]
  }

  // Tenta CNPJ inline
  if (!fields.faturamento) {
    if (/cnpj/i.test(text))      fields.faturamento = 'CNPJ'
    else if (/cpf/i.test(text))  fields.faturamento = 'CPF'
  }

  // Verifica 2FA inline
  if (!fields.verificacao) {
    if (/2fa|two.?factor/i.test(text)) fields.verificacao = '2FA'
    else if (/verificad[oa]/i.test(text)) fields.verificacao = 'Verificado'
  }

  return fields
}

/** Divide o texto em blocos (um por ativo) */
function splitBlocks(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Detecta se é lista numerada (1. / 1) / 🔹1.)
  const isNumbered = lines.some((l) => /^[\d]+[.)]\s/.test(l) || /^[🔹🔸•\-]\s*\d+[.)]\s/.test(l))

  if (isNumbered) {
    // Agrupa por número
    const blocks: string[] = []
    let current = ''
    for (const line of lines) {
      if (/^[\d]+[.)]\s/.test(line) || /^[🔹🔸•\-]\s*\d+[.)]\s/.test(line)) {
        if (current) blocks.push(current)
        current = line
      } else {
        current += ' | ' + line
      }
    }
    if (current) blocks.push(current)
    return blocks
  }

  // Detecta se cada linha é um ativo separado (tem pelo menos 2 campos)
  const isSingleLine = lines.every((l) => (l.match(/[:=]/g) ?? []).length >= 2)
  if (isSingleLine) return lines

  // Separa por linhas em branco
  const blocks: string[] = []
  let current = ''
  for (const line of lines) {
    if (!line) {
      if (current.trim()) blocks.push(current.trim())
      current = ''
    } else {
      current += (current ? ' | ' : '') + line
    }
  }
  if (current.trim()) blocks.push(current.trim())
  return blocks.filter((b) => b.length > 5)
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processa texto bruto e retorna array de ativos para revisão.
 * Não salva nada no banco — apenas previsualize.
 *
 * @param text    Texto copiado do WhatsApp/Telegram
 * @param platform Plataforma dominante (auto-detectada se omitida)
 * @param startSeq Número sequencial inicial para geração de IDs
 */
export function parseAssetText(text: string, platform?: Platform, startSeq = 1): ParsedAssetRow[] {
  const detectedPlatform = platform ?? detectPlatform(text)
  const blocks = splitBlocks(text)
  const results: ParsedAssetRow[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block    = blocks[i]
    const warnings: string[] = []
    const fields   = extractFields(block)

    if (!fields.gasto && !fields.nicho && !fields.ano) {
      warnings.push('Linha ignorada: nenhum campo reconhecido')
      continue
    }

    const { value: spendValue, currency } = fields.gasto
      ? parseSpendValue(fields.gasto)
      : { value: 0, currency: 'BRL' as const }

    const year      = fields.ano ? parseInt(fields.ano, 10) : null
    const spendClass = classifySpend(spendValue, currency)
    const rawNiche  = (fields.nicho ?? 'Geral').trim()
    const seq       = startSeq + i
    const adsId     = generateIntakeId(detectedPlatform, year, spendClass, seq)
    const displayName = generateDisplayName(rawNiche, spendClass, year, currency)
    const suggestedPrice = estimatePrice(spendValue, currency)

    const spendFmt = currency === 'USD'
      ? `$${(spendValue / 1000).toFixed(1)}k`
      : spendValue >= 1000
        ? `R$${(spendValue / 1000).toFixed(0)}k`
        : `R$${spendValue}`

    const description = [
      `Conta de anúncios ${detectedPlatform} — ${rawNiche}`,
      year    ? `Criada em ${year}` : null,
      `Gasto histórico: ${spendFmt}`,
      fields.verificacao ? `Verificação: ${fields.verificacao}` : null,
      fields.aquecimento ? `Aquecimento: ${fields.aquecimento}` : null,
      fields.faturamento ? `Faturamento: ${fields.faturamento}` : null,
    ].filter(Boolean).join(' | ')

    if (!fields.gasto) warnings.push('Valor de gasto não encontrado — preço estimado como R$0')
    if (!fields.nicho) warnings.push('Nicho não detectado — usando "Geral"')

    results.push({
      rawNiche, rawSpend: fields.gasto ?? '', year, spendValue, currency,
      faturamento: fields.faturamento ?? null, pagamento: fields.pagamento ?? null,
      verificacao: fields.verificacao ?? null, aquecimento: fields.aquecimento ?? null,
      platform: detectedPlatform, rawLine: block,
      adsId, displayName, description, spendClass, suggestedPrice,
      tags: buildTags(rawNiche, spendClass, currency, fields.verificacao ?? null, year),
      warnings,
    })
  }

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// Gerador de Catálogo para Comunidades
// ─────────────────────────────────────────────────────────────────────────────

const TIER_EMOJI: Record<SpendClass, string> = { HS: '💎', MS: '🥇', LS: '🥈', DS: '💵' }

/**
 * Gera bloco de texto para Telegram/WhatsApp a partir de uma lista de ativos.
 * Nunca expõe fornecedor, custo ou ID interno.
 */
export function generateCatalog(assets: Pick<ParsedAssetRow, 'adsId' | 'displayName' | 'spendClass' | 'currency' | 'spendValue' | 'verificacao' | 'faturamento' | 'year'>[]): string {
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  const lines = assets.map((a) => {
    const tier    = TIER_EMOJI[a.spendClass]
    const spend   = a.currency === 'USD' ? `$${(a.spendValue / 1000).toFixed(1)}k` : `+${Math.round(a.spendValue / 1000)}k BRL`
    const verif   = a.verificacao ? ` | ✅ ${a.verificacao}` : ''
    const fat     = a.faturamento ? ` | ${a.faturamento}` : ''
    const yr      = a.year ? ` | Ano ${a.year}` : ''
    return `${tier} *${a.adsId}* — ${a.displayName}\n   💸 Gasto: ${spend}${yr}${verif}${fat}`
  }).join('\n\n')

  return [
    `🔥 *NOVOS ATIVOS — ADS ATIVOS* 🔥`,
    `📅 ${date}`,
    `${'═'.repeat(32)}`,
    ``,
    lines,
    ``,
    `${'═'.repeat(32)}`,
    `📩 *Consulte o valor no privado com o ID*`,
    `📦 Pronta entrega | Identidade exclusiva Ads Ativos`,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert de Fornecedor (auto-create João Titanium)
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertVendor(name: string, contact?: { whatsapp?: string; email?: string }) {
  const existing = await prisma.vendor.findFirst({ where: { name: { contains: name } } })
  if (existing) return existing

  return prisma.vendor.create({
    data: {
      name,
      category: 'CONTAS',
      rating:   7,
      contactInfo: contact ?? {},
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento de categoria
// ─────────────────────────────────────────────────────────────────────────────

export function platformToCategory(_platform: Platform): AssetCategory {
  return 'CONTAS'
}
