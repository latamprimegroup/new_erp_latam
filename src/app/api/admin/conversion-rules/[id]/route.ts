import { NextResponse } from 'next/server'
import {
  Prisma,
  TrackerConversionEventKind,
  TrackerConversionUpsellMode,
  TrackerConversionValueMode,
} from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const
const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

function eventKindOk(s: string): s is TrackerConversionEventKind {
  return Object.values(TrackerConversionEventKind).includes(s as TrackerConversionEventKind)
}

function upsellOk(s: string): s is TrackerConversionUpsellMode {
  return Object.values(TrackerConversionUpsellMode).includes(s as TrackerConversionUpsellMode)
}

function valueModeOk(s: string): s is TrackerConversionValueMode {
  return Object.values(TrackerConversionValueMode).includes(s as TrackerConversionValueMode)
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const r = await prisma.trackerConversionRule.findUnique({
    where: { id },
    include: { offer: { select: { id: true, name: true } } },
  })
  if (!r) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({
    rule: {
      id: r.id,
      name: r.name,
      slug: r.slug,
      active: r.active,
      eventKind: r.eventKind,
      offerId: r.offerId,
      offerName: r.offer?.name ?? null,
      onlyApprovedPurchases: r.onlyApprovedPurchases,
      upsellMode: r.upsellMode,
      valueMode: r.valueMode,
      platformFeePercent: r.platformFeePercent?.toString() ?? null,
      conversionWeightPercent: r.conversionWeightPercent,
      googleAdsCustomerId: r.googleAdsCustomerId,
      googleConversionActionId: r.googleConversionActionId,
      googleConversionLabel: r.googleConversionLabel,
      delayMinutesBeforeSend: r.delayMinutesBeforeSend,
      backendAction: r.backendAction,
      earlySignalMinSecondsOnPage: r.earlySignalMinSecondsOnPage,
      updatedAt: r.updatedAt.toISOString(),
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const prev = await prisma.trackerConversionRule.findUnique({ where: { id } })
  if (!prev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const n = body.name.trim().slice(0, 200)
    if (n) data.name = n
  }
  if (typeof body.active === 'boolean') data.active = body.active
  if (typeof body.eventKind === 'string' && eventKindOk(body.eventKind)) data.eventKind = body.eventKind
  if (typeof body.onlyApprovedPurchases === 'boolean') data.onlyApprovedPurchases = body.onlyApprovedPurchases
  if (typeof body.upsellMode === 'string' && upsellOk(body.upsellMode)) data.upsellMode = body.upsellMode
  if (typeof body.valueMode === 'string' && valueModeOk(body.valueMode)) data.valueMode = body.valueMode

  if (body.platformFeePercent === null) {
    data.platformFeePercent = null
  } else if (body.platformFeePercent != null && String(body.platformFeePercent).trim() !== '') {
    data.platformFeePercent = new Prisma.Decimal(String(body.platformFeePercent).replace(',', '.'))
  }

  if (typeof body.conversionWeightPercent === 'number') {
    data.conversionWeightPercent = Math.min(100, Math.max(0, Math.floor(body.conversionWeightPercent)))
  }

  if (body.googleAdsCustomerId === null) data.googleAdsCustomerId = null
  else if (typeof body.googleAdsCustomerId === 'string') {
    data.googleAdsCustomerId = body.googleAdsCustomerId.replace(/\D/g, '').slice(0, 32) || null
  }

  if (body.googleConversionActionId === null) data.googleConversionActionId = null
  else if (typeof body.googleConversionActionId === 'string') {
    data.googleConversionActionId = body.googleConversionActionId.trim().slice(0, 32) || null
  }

  if (body.googleConversionLabel === null) data.googleConversionLabel = null
  else if (typeof body.googleConversionLabel === 'string') {
    data.googleConversionLabel = body.googleConversionLabel.trim().slice(0, 255) || null
  }

  if (typeof body.delayMinutesBeforeSend === 'number') {
    data.delayMinutesBeforeSend = Math.min(24 * 60, Math.max(0, Math.floor(body.delayMinutesBeforeSend)))
  }

  if (typeof body.backendAction === 'string') {
    data.backendAction = body.backendAction.trim().slice(0, 64)
  }

  if (body.offerId === null) {
    data.offerId = null
  } else if (typeof body.offerId === 'string' && body.offerId.trim()) {
    const o = await prisma.trackerOffer.findUnique({ where: { id: body.offerId.trim() } })
    if (!o) return NextResponse.json({ error: 'Oferta não encontrada' }, { status: 400 })
    data.offerId = body.offerId.trim()
  }

  if (body.earlySignalMinSecondsOnPage === null) {
    data.earlySignalMinSecondsOnPage = null
  } else if (typeof body.earlySignalMinSecondsOnPage === 'number') {
    data.earlySignalMinSecondsOnPage =
      body.earlySignalMinSecondsOnPage > 0 ? Math.floor(body.earlySignalMinSecondsOnPage) : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sem alterações' }, { status: 400 })
  }

  await prisma.trackerConversionRule.update({ where: { id }, data: data as object })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    await prisma.trackerConversionRule.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
