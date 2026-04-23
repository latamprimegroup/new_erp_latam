/**
 * Asset Intake Parser
 * Transforma texto bruto do WhatsApp/Telegram em registros estruturados de ativos.
 *
 * Suporta múltiplos formatos:
 *   1. Campo:valor  — "Gasto: 238k | Nicho: Imobiliária | Ano: 2012 ..."
 *   2. Lista numer. — "1. Gasto: 238k ..."
 *   3. Bloco vazio  — separado por linha em branco
 *   4. Tabela TSV   — "AA-G12-HS-001\tDiamond Real Estate\t238k BRL\t2012\t..."
 *   5. Tabela pipes — "AA-G12-HS-001 | Diamond Real Estate | 238k BRL | 2012 ..."
 *   6. ID pré-fmt   — reutiliza ID "AA-xxx" se já presente no texto
 *
 * Nomenclatura resultante segue taxonomia Ads Ativos:
 *   AA-G12-HS-001 = Google | Ano 2012 | High Spend | Seq 001
 *
 * Authority Tags:
 *   O campo "Nicho" é mapeado para uma tag de autoridade em inglês,
 *   ocultando a operação anterior e reforçando o posicionamento Ads Ativos.
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
  realId:         string | null // ID real do fornecedor (ex: 722-617-3875)
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
  realId?: string
}

/** Extrai campos de uma linha ou bloco */
function extractFields(text: string): RawFields {
  const fields: RawFields = {}

  const patterns: [keyof RawFields, RegExp][] = [
    ['realId',      /(?:^|\|)\s*ID\s*[:=]\s*([\d\-]{5,30})/im],
    ['gasto',       /(?:gasto|spend|spent|investimento|inv\.?)\s*[:=]\s*([^\|\n,]+)/i],
    ['nicho',       /(?:nicho|niche|segmento|setor|ramo|area|área|mercado)\s*[:=]\s*([^\|\n,]+)/i],
    ['ano',         /(?:ano|year|criacao|criação|criado em)\s*[:=]\s*(\d{4})/i],
    ['faturamento', /(?:faturamento|fat|doc|documento|cnpj|cpf|pj|pf)\s*[:=]\s*([^\|\n,]+)/i],
    ['pagamento',   /(?:pagamento|pag|pgt|payment|forma de pag)\s*[:=]\s*([^\|\n,]+)/i],
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

/**
 * Divide o texto em blocos — um bloco por ativo.
 *
 * Estratégias (em ordem de prioridade):
 *  1. Lista numerada: "1. campo | campo"
 *  2. Uma linha por ativo (2+ campos na mesma linha)
 *  3. Blocos separados por "ID:" no início — formato WhatsApp multi-linha
 *  4. Blocos separados por linha em branco
 */
function splitBlocks(text: string): string[] {
  // Preserva linhas em branco para detecção de separadores
  const rawLines = text.split('\n').map((l) => l.trim())
  const nonEmpty = rawLines.filter(Boolean)

  if (nonEmpty.length === 0) return []

  // ── 1. Lista numerada ────────────────────────────────────────────────────
  const isNumbered = nonEmpty.some(
    (l) => /^[\d]+[.)]\s/.test(l) || /^[🔹🔸•\-]\s*\d+[.)]\s/.test(l),
  )
  if (isNumbered) {
    const blocks: string[] = []
    let current = ''
    for (const line of nonEmpty) {
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

  // ── 2. Uma linha por ativo (2+ campos separados por | ou :) ──────────────
  const isSingleLine =
    nonEmpty.length > 1 &&
    nonEmpty.every((l) => (l.match(/[:=]/g) ?? []).length >= 2)
  if (isSingleLine) return nonEmpty

  // ── 3. Blocos iniciados por "ID: ..." (formato WhatsApp multi-linha) ─────
  //    Detecta se pelo menos 2 linhas começam com "ID:"
  const idLineCount = nonEmpty.filter((l) => /^ID\s*[:=]/i.test(l)).length
  if (idLineCount >= 2) {
    const blocks: string[] = []
    let current = ''
    for (const line of nonEmpty) {
      if (/^ID\s*[:=]/i.test(line) && current.trim()) {
        blocks.push(current.trim())
        current = line
      } else {
        current += (current ? ' | ' : '') + line
      }
    }
    if (current.trim()) blocks.push(current.trim())
    return blocks.filter((b) => b.length > 5)
  }

  // ── 4. Blocos separados por linha em branco ──────────────────────────────
  //    Usa rawLines (com linhas em branco) para detectar separadores
  const blocks: string[] = []
  let current = ''
  for (const line of rawLines) {
    if (!line) {
      if (current.trim()) { blocks.push(current.trim()); current = '' }
    } else {
      current += (current ? ' | ' : '') + line
    }
  }
  if (current.trim()) blocks.push(current.trim())

  // Se só gerou 1 bloco mas tem muitos campos, tenta separar por preço isolado
  // (linha com apenas um valor monetário = delimitador de bloco tipo "1.480,00")
  if (blocks.length <= 1 && nonEmpty.length > 5) {
    const priceLineRx = /^R?\$?\s*[\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?$/
    const reBlocks: string[] = []
    let cur = ''
    for (const line of nonEmpty) {
      if (priceLineRx.test(line) && cur.trim()) {
        reBlocks.push(cur.trim() + ' | Valor: ' + line)
        cur = ''
      } else {
        cur += (cur ? ' | ' : '') + line
      }
    }
    if (cur.trim()) reBlocks.push(cur.trim())
    if (reBlocks.length > 1) return reBlocks.filter((b) => b.length > 5)
  }

  return blocks.filter((b) => b.length > 5)
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser de Formato de Tabela (João Titanium / ERP export)
// ─────────────────────────────────────────────────────────────────────────────

/** Regex para ID Ads Ativos pré-formatado: AA-G12-HS-001 */
const ADS_ID_RX = /\bAA-[A-Z][0-9]{2}-(?:HS|MS|LS|DS|USD)-\d{3,4}\b/

/** Detecta se o texto é uma tabela TSV ou pipe com IDs pré-gerados */
function isPreformattedTable(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim())
  const withIds = lines.filter((l) => ADS_ID_RX.test(l))
  return withIds.length >= 2
}

/**
 * Analisa uma linha de tabela no formato:
 * "AA-G12-HS-001 | Diamond Real Estate | 238k BRL | 2012 | Imobiliária / Pag. Manual / Verif. OK | Disponível"
 * ou TSV com tab como separador.
 */
function parseTableRow(line: string): {
  prebuiltId: string | null; displayName: string | null
  rawSpend: string | null; year: number | null; details: string | null
} {
  // Tenta extrair ID Ads Ativos se presente
  const idMatch     = line.match(ADS_ID_RX)
  const prebuiltId  = idMatch ? idMatch[0] : null

  // Separa por tab ou por 2+ espaços ou por pipe
  const sep    = line.includes('\t') ? '\t' : line.includes('|') ? '|' : '  '
  const cols   = line.split(sep).map((c) => c.trim()).filter(Boolean)

  if (cols.length < 2) return { prebuiltId, displayName: null, rawSpend: null, year: null, details: null }

  // Localiza cada coluna pelo conteúdo
  let displayName: string | null = null
  let rawSpend:    string | null = null
  let year:        number | null = null
  let details:     string | null = null

  for (const col of cols) {
    // Ano (4 dígitos entre 2000-2029)
    if (!year && /^20[0-2][0-9]$/.test(col)) { year = parseInt(col, 10); continue }
    // Spend (valor com k, m, $)
    if (!rawSpend && /\d[\d.,]*\s*[kmKM]?\s*(BRL|USD|R\$|\$)?/.test(col) && !/^AA-/.test(col) && !/^\d{4}$/.test(col)) {
      rawSpend = col; continue
    }
    // Nome comercial (não é ID, não é spend, não é ano, tem letras)
    if (!displayName && /[a-zA-ZÀ-ÿ]{3,}/.test(col) && !ADS_ID_RX.test(col) && col.length > 4 && !/^\d/.test(col)) {
      displayName = col; continue
    }
    // Detalhes técnicos (campo mais longo restante)
    if (!details && col.length > 10) details = col
  }

  return { prebuiltId, displayName, rawSpend, year, details }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authority Tags — Nicho → Posicionamento de Autoridade (sem expor operação)
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHORITY_TAGS: Record<string, string> = {
  'imobiliaria': 'Autoridade Real Estate',    'imobiliária': 'Autoridade Real Estate',
  'intercambio': 'Autoridade Educação Global', 'intercâmbio': 'Autoridade Educação Global',
  'arames': 'Autoridade Indústria B2B',       'industrial': 'Autoridade Indústria B2B',
  'implante capilar': 'Autoridade Saúde Premium', 'epi': 'Autoridade Safety & Compliance',
  'advogado': 'Autoridade Jurídico',           'juridico': 'Autoridade Jurídico',
  'jurídico': 'Autoridade Jurídico',           'calcados': 'Autoridade Varejo',
  'calçados': 'Autoridade Varejo',             'academia': 'Autoridade Fitness',
  'vazamento': 'Autoridade Serviços',          'bar': 'Autoridade Entretenimento',
  'auto': 'Autoridade Automotivo',             'colegio': 'Autoridade Educação',
  'colégio': 'Autoridade Educação',            'estetica': 'Autoridade Beleza',
  'estética': 'Autoridade Beleza',             'desentupidora': 'Autoridade Serviços',
  'hyundai': 'Autoridade Automotivo',          'saude': 'Autoridade Saúde',
  'saúde': 'Autoridade Saúde',
}

/** Mapeia nicho bruto para tag de autoridade White Label */
export function nichoToAuthorityTag(nicho: string): string {
  const key = nicho.toLowerCase().trim()
  // Tenta match parcial
  for (const [k, v] of Object.entries(AUTHORITY_TAGS)) {
    if (key.includes(k)) return v
  }
  return `Autoridade ${normalizeNiche(nicho)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processa texto bruto e retorna array de ativos para revisão.
 * Não salva nada no banco — apenas previsualize.
 *
 * Detecta automaticamente se é formato tabela (com IDs pré-gerados),
 * lista numerada, ou bloco campo:valor.
 *
 * @param text     Texto copiado do WhatsApp/Telegram ou planilha
 * @param platform Plataforma dominante (auto-detectada se omitida)
 * @param startSeq Número sequencial inicial para geração de IDs
 */
export function parseAssetText(text: string, platform?: Platform, startSeq = 1): ParsedAssetRow[] {
  const detectedPlatform = platform ?? detectPlatform(text)

  // ── Modo tabela pré-formatada (com IDs AA-xxx gerados pelo ERP) ──────────
  if (isPreformattedTable(text)) {
    return parsePreformattedTable(text, detectedPlatform, startSeq)
  }

  // ── Modo texto bruto (WhatsApp/Telegram campo:valor) ─────────────────────
  const blocks  = splitBlocks(text)
  const results: ParsedAssetRow[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block    = blocks[i]
    const warnings: string[] = []
    const fields   = extractFields(block)

    if (!fields.gasto && !fields.nicho && !fields.ano) continue

    const { value: spendValue, currency } = fields.gasto
      ? parseSpendValue(fields.gasto)
      : { value: 0, currency: 'BRL' as const }

    const year       = fields.ano ? parseInt(fields.ano, 10) : null
    const spendClass = classifySpend(spendValue, currency)
    const rawNiche   = (fields.nicho ?? 'Geral').trim()
    const seq        = startSeq + i
    const adsId      = generateIntakeId(detectedPlatform, year, spendClass, seq)
    const displayName = generateDisplayName(rawNiche, spendClass, year, currency)
    const suggestedPrice = estimatePrice(spendValue, currency)
    const authorityTag   = nichoToAuthorityTag(rawNiche)

    const spendFmt = currency === 'USD'
      ? `$${(spendValue / 1000).toFixed(1)}k`
      : spendValue >= 1000 ? `R$${(spendValue / 1000).toFixed(0)}k` : `R$${spendValue}`

    const description = [
      `Conta de anúncios ${detectedPlatform} — ${authorityTag}`,
      year    ? `Criada em ${year}` : null,
      `Gasto histórico: ${spendFmt}`,
      fields.verificacao ? `Verificação: ${fields.verificacao}` : null,
      fields.aquecimento ? `Aquecimento: ${fields.aquecimento}` : null,
      fields.faturamento ? `Faturamento: ${fields.faturamento}` : null,
    ].filter(Boolean).join(' | ')

    if (!fields.gasto) warnings.push('Valor de gasto não encontrado')
    if (!fields.nicho) warnings.push('Nicho não detectado — usando "Geral"')

    results.push({
      rawNiche, rawSpend: fields.gasto ?? '', year, spendValue, currency,
      faturamento: fields.faturamento ?? null, pagamento: fields.pagamento ?? null,
      verificacao: fields.verificacao ?? null, aquecimento: fields.aquecimento ?? null,
      realId: fields.realId ?? null,
      platform: detectedPlatform, rawLine: block,
      adsId, displayName, description, spendClass, suggestedPrice,
      tags: buildTags(rawNiche, spendClass, currency, fields.verificacao ?? null, year) + `,${authorityTag.toLowerCase().replace(/\s+/g,'-')}`,
      warnings,
    })
  }

  return results
}

/**
 * Parser para tabelas com IDs Ads Ativos pré-gerados.
 * Reutiliza o ID existente em vez de gerar novo.
 */
function parsePreformattedTable(text: string, platform: Platform, startSeq: number): ParsedAssetRow[] {
  const lines   = text.split('\n').filter((l) => l.trim() && ADS_ID_RX.test(l))
  const results: ParsedAssetRow[] = []

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i]
    const warnings: string[] = []
    const table   = parseTableRow(line)
    const fields  = extractFields(line)

    // Combina dados da tabela + extração de campos
    const rawSpend = table.rawSpend ?? fields.gasto ?? ''
    const { value: spendValue, currency } = rawSpend
      ? parseSpendValue(rawSpend)
      : { value: 0, currency: 'BRL' as const }

    const year        = table.year ?? (fields.ano ? parseInt(fields.ano, 10) : null)
    const spendClass  = classifySpend(spendValue, currency)

    // Extrai nicho dos detalhes técnicos ou do campo nicho
    const detailNicho = table.details ? extractNichoFromDetails(table.details) : null
    const rawNiche    = fields.nicho ?? detailNicho ?? 'Geral'
    const authorityTag = nichoToAuthorityTag(rawNiche)

    // Usa ID pré-gerado ou gera novo
    const adsId       = table.prebuiltId ?? generateIntakeId(platform, year, spendClass, startSeq + i)
    const displayName = table.displayName ?? generateDisplayName(rawNiche, spendClass, year, currency)
    const suggestedPrice = estimatePrice(spendValue, currency)

    const spendFmt = currency === 'USD'
      ? `$${(spendValue / 1000).toFixed(2)}k USD`
      : spendValue >= 1000 ? `R$${(spendValue / 1000).toFixed(1)}k` : `R$${spendValue}`

    // Extrai verificacao/pagamento dos detalhes
    const hasVerif    = /verif\.|verificad|ok/i.test(table.details ?? '')
    const hasCnpj     = /cnpj/i.test(table.details ?? '')
    const hasPagAuto  = /autom[aá]tico/i.test(table.details ?? '')

    const description = [
      `${platform} — ${authorityTag}`,
      year    ? `Criada em ${year}` : null,
      `Gasto histórico: ${spendFmt}`,
      hasVerif ? 'Verificação: OK' : null,
      hasCnpj  ? 'CNPJ Verificado' : null,
    ].filter(Boolean).join(' | ')

    if (!rawSpend) warnings.push('Gasto não detectado na tabela')

    results.push({
      rawNiche, rawSpend, year, spendValue, currency,
      faturamento: hasCnpj ? 'CNPJ' : (fields.faturamento ?? null),
      pagamento:   hasPagAuto ? 'Automático' : (fields.pagamento ?? 'Manual'),
      verificacao: hasVerif ? 'OK' : (fields.verificacao ?? null),
      aquecimento: fields.aquecimento ?? null,
      realId: fields.realId ?? null,
      platform, rawLine: line,
      adsId,
      displayName,
      description,
      spendClass,
      suggestedPrice,
      tags: buildTags(rawNiche, spendClass, currency, hasVerif ? 'OK' : null, year) + `,${authorityTag.toLowerCase().replace(/\s+/g,'-')}`,
      warnings,
    })
  }

  return results
}

/** Extrai o nicho a partir do campo de detalhes técnicos (internos) */
function extractNichoFromDetails(details: string): string | null {
  // Pega a primeira palavra/frase antes do "/"
  const part = details.split('/')[0].trim()
  if (part.length > 2 && part.length < 50) return part
  return null
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
