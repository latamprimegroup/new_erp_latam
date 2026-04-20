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

async function ensureDefaultPurchaseRule() {
  const n = await prisma.trackerConversionRule.count()
  if (n > 0) return
  await prisma.trackerConversionRule.create({
    data: {
      slug: 'purchase_aprovada_padrao',
      name: 'Purchase — aprovada (padrão)',
      active: false,
      eventKind: TrackerConversionEventKind.PURCHASE,
      onlyApprovedPurchases: true,
      upsellMode: TrackerConversionUpsellMode.INCLUDE_ALL,
      valueMode: TrackerConversionValueMode.FULL_GROSS,
      conversionWeightPercent: 100,
      delayMinutesBeforeSend: 60,
      backendAction: 'OFFLINE_GCLIC_UPLOAD',
    },
  })
}

function eventKindOk(s: string): s is TrackerConversionEventKind {
  return Object.values(TrackerConversionEventKind).includes(s as TrackerConversionEventKind)
}

function upsellOk(s: string): s is TrackerConversionUpsellMode {
  return Object.values(TrackerConversionUpsellMode).includes(s as TrackerConversionUpsellMode)
}

function valueModeOk(s: string): s is TrackerConversionValueMode {
  return Object.values(TrackerConversionValueMode).includes(s as TrackerConversionValueMode)
}

export async function GET() {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  await ensureDefaultPurchaseRule()

  const rows = await prisma.trackerConversionRule.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    take: 100,
    include: {
      offer: { select: { id: true, name: true } },
      _count: { select: { dispatches: true } },
    },
  })

  return NextResponse.json({
    rules: rows.map((r) => ({
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
      dispatchCount: r._count.dispatches,
      updatedAt: r.updatedAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  if (!name) return NextResponse.json({ error: 'name obrigatório' }, { status: 400 })

  let slug =
    typeof body.slug === 'string' && body.slug.trim()
      ? body.slug.trim().toLowerCase().slice(0, 80)
      : name
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 80)
  if (!/^[a-z0-9_]{2,80}$/.test(slug)) {
    return NextResponse.json({ error: 'slug inválido' }, { status: 400 })
  }

  const clash = await prisma.trackerConversionRule.findUnique({ where: { slug } })
  if (clash) return NextResponse.json({ error: 'slug já existe' }, { status: 400 })

  let offerId: string | null =
    typeof body.offerId === 'string' && body.offerId.trim() ? body.offerId.trim() : null
  if (offerId) {
    const o = await prisma.trackerOffer.findUnique({ where: { id: offerId } })
    if (!o) return NextResponse.json({ error: 'Oferta não encontrada' }, { status: 400 })
  }

  const eventKind =
    typeof body.eventKind === 'string' && eventKindOk(body.eventKind)
      ? body.eventKind
      : TrackerConversionEventKind.PURCHASE

  const row = await prisma.trackerConversionRule.create({
    data: {
      name,
      slug,
      active: Boolean(body.active),
      eventKind,
      offerId,
      onlyApprovedPurchases: body.onlyApprovedPurchases !== false,
      upsellMode:
        typeof body.upsellMode === 'string' && upsellOk(body.upsellMode)
          ? body.upsellMode
          : TrackerConversionUpsellMode.INCLUDE_ALL,
      valueMode:
        typeof body.valueMode === 'string' && valueModeOk(body.valueMode)
          ? body.valueMode
          : TrackerConversionValueMode.FULL_GROSS,
      platformFeePercent:
        body.platformFeePercent != null && String(body.platformFeePercent).trim() !== ''
          ? new Prisma.Decimal(String(body.platformFeePercent).replace(',', '.'))
          : null,
      conversionWeightPercent:
        typeof body.conversionWeightPercent === 'number'
          ? Math.min(100, Math.max(0, Math.floor(body.conversionWeightPercent)))
          : 100,
      googleAdsCustomerId:
        typeof body.googleAdsCustomerId === 'string' ? body.googleAdsCustomerId.replace(/\D/g, '').slice(0, 32) : null,
      googleConversionActionId:
        typeof body.googleConversionActionId === 'string'
          ? body.googleConversionActionId.trim().slice(0, 32)
          : null,
      googleConversionLabel:
        typeof body.googleConversionLabel === 'string' ? body.googleConversionLabel.trim().slice(0, 255) : null,
      delayMinutesBeforeSend:
        typeof body.delayMinutesBeforeSend === 'number' && body.delayMinutesBeforeSend >= 0
          ? Math.min(24 * 60, Math.floor(body.delayMinutesBeforeSend))
          : 60,
      backendAction:
        typeof body.backendAction === 'string' ? body.backendAction.trim().slice(0, 64) : 'OFFLINE_GCLIC_UPLOAD',
      earlySignalMinSecondsOnPage:
        typeof body.earlySignalMinSecondsOnPage === 'number' && body.earlySignalMinSecondsOnPage > 0
          ? Math.floor(body.earlySignalMinSecondsOnPage)
          : null,
    },
  })

  return NextResponse.json({ id: row.id })
}
