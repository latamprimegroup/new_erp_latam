import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { Prisma, TrackerOfferPlatform, TrackerOfferStatus, TrackerSalePaymentState } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { trackerOfferPayUrl, trackerOfferPostbackUrl } from '@/lib/ads-tracker/offer-urls'

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const
const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

function platformOk(s: string): s is TrackerOfferPlatform {
  return Object.values(TrackerOfferPlatform).includes(s as TrackerOfferPlatform)
}

function statusOk(s: string): s is TrackerOfferStatus {
  return Object.values(TrackerOfferStatus).includes(s as TrackerOfferStatus)
}

function slugBaseFromName(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 36)
  return s || 'oferta'
}

async function uniquePaySlug(base: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const slug = `${base}-${randomBytes(2).toString('hex')}`
    const clash = await prisma.trackerOffer.findUnique({ where: { paySlug: slug } })
    if (!clash) return slug
  }
  return `pay-${randomBytes(8).toString('hex')}`
}

export async function GET(req: Request) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const includeArchived = searchParams.get('includeArchived') === '1'
  const where = includeArchived ? {} : { status: { not: TrackerOfferStatus.ARCHIVED } }

  const offers = await prisma.trackerOffer.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })

  const approvedAgg = await prisma.trackerOfferSaleSignal.groupBy({
    by: ['offerId'],
    where: {
      countedForRevenue: true,
      paymentState: TrackerSalePaymentState.APPROVED,
    },
    _count: { _all: true },
    _sum: { amountGross: true },
  })

  const gclidAgg = await prisma.trackerOfferSaleSignal.groupBy({
    by: ['offerId'],
    where: {
      countedForRevenue: true,
      paymentState: TrackerSalePaymentState.APPROVED,
      gclid: { not: null },
    },
    _count: { _all: true },
  })

  const revMap = new Map<string, Prisma.Decimal>()
  const apprMap = new Map<string, number>()
  const gclMap = new Map<string, number>()
  for (const r of approvedAgg) {
    revMap.set(r.offerId, r._sum.amountGross ?? new Prisma.Decimal(0))
    apprMap.set(r.offerId, r._count._all)
  }
  for (const r of gclidAgg) {
    gclMap.set(r.offerId, r._count._all)
  }

  const payload = offers.map((o) => {
    const totalApproved = apprMap.get(o.id) ?? 0
    const withGclid = gclMap.get(o.id) ?? 0
    const gclidMatchPct = totalApproved > 0 ? withGclid / totalApproved : null
    const trackingLossAlert = totalApproved >= 5 && gclidMatchPct != null && gclidMatchPct < 0.35

    return {
      id: o.id,
      name: o.name,
      platform: o.platform,
      status: o.status,
      postbackPublicToken: o.postbackPublicToken,
      clickIdField: o.clickIdField,
      checkoutTargetUrl: o.checkoutTargetUrl,
      paySlug: o.paySlug,
      googleOfflineDelayMinutes: o.googleOfflineDelayMinutes,
      referenceGrossBrl: o.referenceGrossBrl?.toFixed(2) ?? null,
      lastWebhookAt: o.lastWebhookAt?.toISOString() ?? null,
      lastWebhookOk: o.lastWebhookOk,
      revenueTotal: (revMap.get(o.id) ?? new Prisma.Decimal(0)).toFixed(2),
      approvedSalesCount: totalApproved,
      gclidMatchedSalesCount: withGclid,
      gclidMatchPct,
      trackingLossAlert,
      postbackUrl: trackerOfferPostbackUrl(o.postbackPublicToken),
      payUrl: trackerOfferPayUrl(o.paySlug),
      updatedAt: o.updatedAt.toISOString(),
    }
  })

  return NextResponse.json({ offers: payload })
}

export async function POST(req: Request) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  let body: {
    name?: string
    platform?: string
    checkoutTargetUrl?: string
    clickIdField?: string
    googleOfflineDelayMinutes?: number
    referenceGrossBrl?: number | null
    status?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  const checkoutTargetUrl =
    typeof body.checkoutTargetUrl === 'string' ? body.checkoutTargetUrl.trim().slice(0, 2000) : ''
  if (!name || !checkoutTargetUrl) {
    return NextResponse.json({ error: 'name e checkoutTargetUrl obrigatórios' }, { status: 400 })
  }

  try {
    new URL(checkoutTargetUrl)
  } catch {
    return NextResponse.json({ error: 'checkoutTargetUrl inválida' }, { status: 400 })
  }

  const platform =
    body.platform && platformOk(body.platform) ? body.platform : TrackerOfferPlatform.OTHER
  const status = body.status && statusOk(body.status) ? body.status : TrackerOfferStatus.ACTIVE
  const clickIdField =
    typeof body.clickIdField === 'string' && body.clickIdField.trim()
      ? body.clickIdField.trim().slice(0, 120)
      : 'auto'
  const delay =
    typeof body.googleOfflineDelayMinutes === 'number' &&
    Number.isFinite(body.googleOfflineDelayMinutes) &&
    body.googleOfflineDelayMinutes >= 0 &&
    body.googleOfflineDelayMinutes <= 24 * 60
      ? Math.floor(body.googleOfflineDelayMinutes)
      : 120

  const postbackPublicToken = randomBytes(24).toString('hex')
  const webhookSecret = randomBytes(32).toString('hex')
  const paySlug = await uniquePaySlug(slugBaseFromName(name))

  let referenceGrossBrl: Prisma.Decimal | null = null
  if (body.referenceGrossBrl != null && Number.isFinite(body.referenceGrossBrl)) {
    const v = Number(body.referenceGrossBrl)
    if (v > 0 && v < 1e12) referenceGrossBrl = new Prisma.Decimal(v.toFixed(2))
  }

  const row = await prisma.trackerOffer.create({
    data: {
      name,
      platform,
      status,
      postbackPublicToken,
      webhookSecret,
      clickIdField,
      checkoutTargetUrl,
      paySlug,
      googleOfflineDelayMinutes: delay,
      referenceGrossBrl,
    },
  })

  return NextResponse.json({
    id: row.id,
    postbackUrl: trackerOfferPostbackUrl(postbackPublicToken),
    payUrl: trackerOfferPayUrl(paySlug),
    webhookSecret,
    warning:
      'Guarde o segredo num cofre (1Password). Não voltará a ser mostrado na UI; use HMAC opcional com cabeçalho X-Tracker-Signature.',
  })
}
