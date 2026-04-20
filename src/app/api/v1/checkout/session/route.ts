import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyLeadsIngestSecret } from '@/lib/intelligence-leads-ingest'
import { upsertCheckoutSessionFromWebhook } from '@/lib/intelligence-checkout-rescue'

const bodySchema = z.object({
  email: z.string().email().max(254),
  event: z.enum(['initiated', 'payment_pending', 'approved', 'abandoned']),
  gateway: z.string().max(32).optional(),
  external_ref: z.string().max(200).optional(),
  externalRef: z.string().max(200).optional(),
  value_brl: z.union([z.number(), z.string()]).optional(),
  valueBrl: z.union([z.number(), z.string()]).optional(),
  metadata: z.record(z.any()).optional(),
})

/**
 * POST /api/v1/checkout/session — abandono / aprovação (mesmo secret dos leads).
 * Envie external_ref estável por tentativa de compra para correlacionar eventos.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/v1/checkout/session',
    auth: 'Igual a POST /api/v1/leads (Bearer / X-Leads-Token)',
    events: ['initiated', 'payment_pending', 'approved', 'abandoned'],
  })
}

export async function POST(req: NextRequest) {
  if (!verifyLeadsIngestSecret(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'email e event obrigatórios' }, { status: 400 })
  }
  const rawV = parsed.data.value_brl ?? parsed.data.valueBrl
  let valueBrl: number | null = null
  if (rawV !== undefined && rawV !== null) {
    const n = typeof rawV === 'number' ? rawV : Number(String(rawV).replace(',', '.'))
    if (Number.isFinite(n)) valueBrl = n
  }
  try {
    const out = await upsertCheckoutSessionFromWebhook({
      email: parsed.data.email,
      event: parsed.data.event,
      gatewayCode: parsed.data.gateway,
      externalRef: parsed.data.external_ref ?? parsed.data.externalRef,
      valueBrl,
      metadata: parsed.data.metadata,
    })
    return NextResponse.json({ ok: true, ...out })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
