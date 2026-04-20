import { NextResponse } from 'next/server'
import { Prisma, TrackerOfferPlatform, TrackerOfferStatus } from '@prisma/client'
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const o = await prisma.trackerOffer.findUnique({ where: { id } })
  if (!o) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({
    offer: {
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
      postbackUrl: trackerOfferPostbackUrl(o.postbackPublicToken),
      payUrl: trackerOfferPayUrl(o.paySlug),
      webhookSecretMasked: '•••••••• (só disponível na criação)',
      updatedAt: o.updatedAt.toISOString(),
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const prev = await prisma.trackerOffer.findUnique({ where: { id } })
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
  if (typeof body.platform === 'string' && platformOk(body.platform)) data.platform = body.platform
  if (typeof body.status === 'string' && statusOk(body.status)) data.status = body.status
  if (typeof body.checkoutTargetUrl === 'string') {
    const u = body.checkoutTargetUrl.trim().slice(0, 2000)
    try {
      new URL(u)
      data.checkoutTargetUrl = u
    } catch {
      return NextResponse.json({ error: 'checkoutTargetUrl inválida' }, { status: 400 })
    }
  }
  if (typeof body.clickIdField === 'string') {
    const c = body.clickIdField.trim().slice(0, 120)
    if (c) data.clickIdField = c
  }
  if (typeof body.googleOfflineDelayMinutes === 'number') {
    const d = Math.floor(body.googleOfflineDelayMinutes)
    if (d >= 0 && d <= 24 * 60) data.googleOfflineDelayMinutes = d
  }
  if (body.referenceGrossBrl === null) {
    data.referenceGrossBrl = null
  } else if (typeof body.referenceGrossBrl === 'number' && Number.isFinite(body.referenceGrossBrl)) {
    const v = Number(body.referenceGrossBrl)
    if (v > 0 && v < 1e12) {
      data.referenceGrossBrl = new Prisma.Decimal(v.toFixed(2))
    }
  }
  if (typeof body.paySlug === 'string') {
    const s = body.paySlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80)
    if (s.length >= 3) {
      const clash = await prisma.trackerOffer.findFirst({ where: { paySlug: s, NOT: { id } } })
      if (clash) return NextResponse.json({ error: 'paySlug já em uso' }, { status: 400 })
      data.paySlug = s
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sem alterações' }, { status: 400 })
  }

  await prisma.trackerOffer.update({ where: { id }, data: data as object })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    await prisma.trackerOffer.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
