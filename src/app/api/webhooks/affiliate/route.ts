/**
 * Pixel Hydra — ingestão de postbacks (Hotmart, Kiwify, genérico).
 * Autenticação: header X-OS-Webhook-Secret = AFFILIATE_WEBHOOK_SECRET
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  extractDeviceCategory,
  extractGclidFromPayload,
  extractUniId,
  inferPaymentStatus,
} from '@/lib/ads-tracker/s2s-payload'

export const runtime = 'nodejs'

function extractExternalId(body: Record<string, unknown>): string | null {
  const tryKeys = (o: unknown, keys: string[]): string | null => {
    if (!o || typeof o !== 'object') return null
    const r = o as Record<string, unknown>
    for (const k of keys) {
      const v = r[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number') return String(v)
    }
    return null
  }
  return (
    tryKeys(body, ['id', 'event_id', 'transaction_id', 'purchase_id']) ||
    tryKeys(body.data as unknown, ['id', 'transaction', 'purchase_id']) ||
    null
  )
}

function extractRoiBrl(body: Record<string, unknown>): number | null {
  const v =
    body.commission_value ??
    body.value ??
    (typeof body.data === 'object' && body.data !== null
      ? (body.data as Record<string, unknown>).commission_value
      : null)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

export async function POST(req: NextRequest) {
  const secret = process.env.AFFILIATE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'AFFILIATE_WEBHOOK_SECRET não configurado' }, { status: 503 })
  }
  if (req.headers.get('x-os-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const provider = req.nextUrl.searchParams.get('provider')?.trim() || 'generic'
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const externalId = extractExternalId(body)
  const roiValueBrl = extractRoiBrl(body)

  const gclid = extractGclidFromPayload(body)
  const deviceCategory = extractDeviceCategory(body)
  const paymentStatus = inferPaymentStatus(body)
  let uniId = extractUniId(body)
  if (uniId) {
    const uni = await prisma.vaultIndustrialUnit.findUnique({ where: { id: uniId }, select: { id: true } })
    if (!uni) uniId = null
  }

  const row = await prisma.affiliateWebhookEvent.create({
    data: {
      provider,
      externalId,
      payload: body as Prisma.InputJsonValue,
      roiValueBrl: roiValueBrl != null ? roiValueBrl : undefined,
      processed: false,
      gclid: gclid ?? undefined,
      deviceCategory,
      paymentStatus,
      uniId: uniId ?? undefined,
    },
  })

  return NextResponse.json({ ok: true, id: row.id })
}
