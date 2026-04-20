import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { IntelligenceLeadStatus } from '@prisma/client'

/** Bearer ou X-Leads-Token — obrigatório (ECOSYSTEM_LEADS_INGEST_SECRET). */
export function verifyLeadsIngestSecret(req: NextRequest | Request): boolean {
  const secret = process.env.ECOSYSTEM_LEADS_INGEST_SECRET?.trim()
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const tokenHeader = req.headers.get('x-leads-token')?.trim() ?? ''
  return secret.length > 0 && (secret === bearer || secret === tokenHeader)
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s.length ? s : undefined
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = str(obj[k])
    if (v) return v
  }
  return undefined
}

function flattenPayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  const obj = body as Record<string, unknown>
  const flat: Record<string, unknown> = { ...obj }
  if (obj.fields && typeof obj.fields === 'object' && !Array.isArray(obj.fields)) {
    Object.assign(flat, obj.fields as Record<string, unknown>)
  }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    Object.assign(flat, obj.data as Record<string, unknown>)
  }
  return flat
}

const ingestSchema = z.object({
  email: z.string().email().max(254),
  nome: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  whatsapp: z.string().max(30).optional(),
  phone: z.string().max(30).optional(),
  telefone: z.string().max(30).optional(),
  utm_source: z.string().max(120).optional(),
  utm_medium: z.string().max(120).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content: z.string().max(512).optional(),
  utm_term: z.string().max(200).optional(),
  utmContent: z.string().max(512).optional(),
  utmTerm: z.string().max(200).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(200).optional(),
  trust_score: z.union([z.number(), z.string()]).optional(),
  trustScore: z.union([z.number(), z.string()]).optional(),
  status: z.enum(['NOVO', 'QUENTE', 'CLIENTE_ATIVO', 'CHURN']).optional(),
  total_vendas: z.union([z.number(), z.string()]).optional(),
  totalVendas: z.union([z.number(), z.string()]).optional(),
  data_ultima_compra: z.string().optional(),
  lastPurchaseAt: z.string().optional(),
  cpa_brl: z.union([z.number(), z.string()]).optional(),
  cpa: z.union([z.number(), z.string()]).optional(),
  custo_aquisicao: z.union([z.number(), z.string()]).optional(),
})

function truthyCheckout(flat: Record<string, unknown>): boolean {
  const v = flat.checkout_intent ?? flat.clicked_checkout ?? flat.checkout_click
  if (v === true || v === 1) return true
  const s = str(v)
  return s === '1' || s?.toLowerCase() === 'true' || s?.toLowerCase() === 'yes'
}

export type ParsedLeadIngest = {
  email: string
  name: string
  whatsapp: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  status?: IntelligenceLeadStatus
  /** 0–100 opcional (webhook) */
  trustScore?: number
  totalSales?: number
  lastPurchaseAt?: Date | null
  /** LP específica — +10 pts no score */
  landingPageKey?: string | null
  /** Intenção checkout — +20 pts, grava timestamp */
  checkoutIntent?: boolean
  /** Nota livre na timeline (webhook) */
  timelineNote?: string | null
  /** Tags comportamentais (acumulam no JSON behavior_tags) */
  behaviorTagAdds?: string[]
  /** CPA / custo de aquisição atribuído ao lead (BRL) */
  cpaBrl?: number
}

function parseBehaviorTagsFromFlat(flat: Record<string, unknown>): string[] {
  const raw = flat.behavior_tags ?? flat.behaviorTags ?? flat.tags_comportamentais ?? flat.tags
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim().slice(0, 120)).filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;|]/g)
      .map((s) => s.trim().slice(0, 120))
      .filter(Boolean)
  }
  return []
}

export function mergeBehaviorTags(existing: unknown, incoming: string[]): string[] {
  const cur = new Set<string>()
  if (Array.isArray(existing)) {
    for (const x of existing) cur.add(String(x).trim().slice(0, 120))
  } else if (typeof existing === 'string') {
    for (const s of existing.split(/[,;|]/g)) {
      const t = s.trim().slice(0, 120)
      if (t) cur.add(t)
    }
  }
  for (const t of incoming) cur.add(t.slice(0, 120))
  return [...cur].slice(0, 100)
}

function sanitizeName(raw: string): string {
  return raw.replace(/[<>]/g, '').trim().slice(0, 200) || 'Lead'
}

export function parseLeadIngestBody(body: unknown): ParsedLeadIngest {
  const flat = flattenPayload(body)

  const emailRaw =
    pickString(flat, ['email', 'Email', 'e-mail']) ??
    pickString(flat, ['EmailAddress', 'email_address'])
  if (!emailRaw) {
    throw new Error('email_obrigatorio')
  }

  const rawStatus = pickString(flat, ['status'])
  const allowedStatus = ['NOVO', 'QUENTE', 'CLIENTE_ATIVO', 'CHURN'] as const
  const statusOk: IntelligenceLeadStatus | undefined =
    rawStatus && (allowedStatus as readonly string[]).includes(rawStatus)
      ? (rawStatus as IntelligenceLeadStatus)
      : undefined

  const parsed = ingestSchema.parse({
    email: emailRaw.trim().toLowerCase(),
    nome: pickString(flat, ['nome', 'name', 'NOME', 'full_name', 'fullname']),
    name: pickString(flat, ['name', 'nome']),
    whatsapp: pickString(flat, ['whatsapp', 'WhatsApp', 'whats_app']),
    phone: pickString(flat, ['phone', 'telefone', 'tel', 'celular']),
    telefone: pickString(flat, ['telefone', 'phone']),
    utm_source: pickString(flat, ['utm_source', 'utmSource', 'UTM Source']),
    utm_medium: pickString(flat, ['utm_medium', 'utmMedium']),
    utm_campaign: pickString(flat, ['utm_campaign', 'utmCampaign']),
    utm_content: pickString(flat, ['utm_content', 'utmContent']),
    utm_term: pickString(flat, ['utm_term', 'utmTerm']),
    trust_score: flat.trust_score ?? flat.trustScore,
    trustScore: flat.trustScore,
    status: statusOk,
    total_vendas: flat.total_vendas ?? flat.totalVendas,
    totalVendas: flat.totalVendas,
    data_ultima_compra: pickString(flat, ['data_ultima_compra', 'last_purchase_at']),
    lastPurchaseAt: pickString(flat, ['lastPurchaseAt', 'last_purchase_iso']),
    cpa_brl: flat.cpa_brl ?? flat.cpaBrl,
    cpa: flat.cpa,
    custo_aquisicao: flat.custo_aquisicao ?? flat.custoAquisicao,
  })

  const nameRaw = parsed.nome || parsed.name || parsed.email.split('@')[0] || 'Lead'
  const wa = parsed.whatsapp || parsed.phone || parsed.telefone
  const waDigits = wa ? wa.replace(/\D/g, '').slice(0, 20) : ''
  const whatsappOut = waDigits.length >= 10 ? waDigits : null

  let totalSales: number | undefined
  const tv = parsed.total_vendas ?? parsed.totalVendas
  if (tv !== undefined) {
    const n = typeof tv === 'number' ? tv : Number(String(tv).replace(',', '.'))
    if (Number.isFinite(n) && n >= 0) totalSales = Math.round(n * 100) / 100
  }

  let lastPurchaseAt: Date | null | undefined
  const dStr = parsed.data_ultima_compra || parsed.lastPurchaseAt
  if (dStr) {
    const d = new Date(dStr)
    lastPurchaseAt = Number.isNaN(d.getTime()) ? undefined : d
  }

  const utmSource = (parsed.utm_source || parsed.utmSource || null)?.slice(0, 120) ?? null
  const utmMedium = (parsed.utm_medium || parsed.utmMedium || null)?.slice(0, 120) ?? null
  const utmCampaign = (parsed.utm_campaign || parsed.utmCampaign || null)?.slice(0, 200) ?? null
  const utmContent = (parsed.utm_content || parsed.utmContent || null)?.slice(0, 512) ?? null
  const utmTerm = (parsed.utm_term || parsed.utmTerm || null)?.slice(0, 200) ?? null

  const out: ParsedLeadIngest = {
    email: parsed.email.trim().toLowerCase(),
    name: sanitizeName(nameRaw),
    whatsapp: whatsappOut,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
  }

  const tsRaw = parsed.trust_score ?? parsed.trustScore
  if (tsRaw !== undefined && tsRaw !== null && tsRaw !== '') {
    const n = typeof tsRaw === 'number' ? tsRaw : Number(String(tsRaw).replace(',', '.'))
    if (Number.isFinite(n)) out.trustScore = Math.min(100, Math.max(0, Math.round(n)))
  }

  if (parsed.status) out.status = parsed.status
  if (totalSales !== undefined) out.totalSales = totalSales
  if (lastPurchaseAt !== undefined) out.lastPurchaseAt = lastPurchaseAt

  const cpaRaw = parsed.cpa_brl ?? parsed.cpa ?? parsed.custo_aquisicao
  if (cpaRaw !== undefined) {
    const n = typeof cpaRaw === 'number' ? cpaRaw : Number(String(cpaRaw).replace(',', '.'))
    if (Number.isFinite(n) && n >= 0) out.cpaBrl = Math.round(n * 100) / 100
  }

  const lp =
    pickString(flat, ['landing_page_key', 'landing_page', 'lp', 'lp_slug', 'page_slug'])?.slice(0, 120) ?? null
  if (lp) out.landingPageKey = lp

  if (truthyCheckout(flat)) out.checkoutIntent = true

  const note = pickString(flat, ['timeline_note', 'event_note', 'nota', 'mensagem'])
  if (note) out.timelineNote = note.slice(0, 2000)

  const tagAdds = parseBehaviorTagsFromFlat(flat)
  if (tagAdds.length) out.behaviorTagAdds = tagAdds

  return out
}
