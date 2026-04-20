import { NextResponse } from 'next/server'
import { TrackerCheckoutParamMode } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_CHECKOUT_FORWARDED_KEYS,
  normalizeForwardedKeys,
} from '@/lib/ads-tracker/checkout-defaults'

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const
const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

function paramModeOk(s: string): s is TrackerCheckoutParamMode {
  return s === 'PRESERVE_ALL_INBOUND' || s === 'ALLOWLIST_ONLY'
}

export async function GET(req: Request) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const offerId = searchParams.get('offerId')?.trim()
  if (!offerId) {
    return NextResponse.json({ error: 'offerId obrigatório' }, { status: 400 })
  }

  const offer = await prisma.trackerOffer.findUnique({ where: { id: offerId } })
  if (!offer) return NextResponse.json({ error: 'Oferta não encontrada' }, { status: 404 })

  const row = await prisma.trackerCheckoutSettings.findUnique({ where: { offerId } })
  if (!row) {
    return NextResponse.json({
      persisted: false,
      settings: {
        offerId,
        forwardedParamKeys: DEFAULT_CHECKOUT_FORWARDED_KEYS,
        paramMode: 'ALLOWLIST_ONLY' as TrackerCheckoutParamMode,
        useEphemeralLinks: false,
        ephemeralTtlMinutes: 60,
        ephemeralMaxUses: 1,
        pixelBackupDelayMs: null as number | null,
      },
    })
  }

  return NextResponse.json({
    persisted: true,
    settings: {
      offerId: row.offerId,
      forwardedParamKeys: normalizeForwardedKeys(row.forwardedParamKeys),
      paramMode: row.paramMode,
      useEphemeralLinks: row.useEphemeralLinks,
      ephemeralTtlMinutes: row.ephemeralTtlMinutes,
      ephemeralMaxUses: row.ephemeralMaxUses,
      pixelBackupDelayMs: row.pixelBackupDelayMs,
    },
  })
}

export async function PATCH(req: Request) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  let body: {
    offerId?: string
    forwardedParamKeys?: unknown
    paramMode?: string
    useEphemeralLinks?: boolean
    ephemeralTtlMinutes?: number
    ephemeralMaxUses?: number
    pixelBackupDelayMs?: number | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const offerId = typeof body.offerId === 'string' ? body.offerId.trim() : ''
  if (!offerId) return NextResponse.json({ error: 'offerId obrigatório' }, { status: 400 })

  const offer = await prisma.trackerOffer.findUnique({ where: { id: offerId } })
  if (!offer) return NextResponse.json({ error: 'Oferta não encontrada' }, { status: 404 })

  const keys = normalizeForwardedKeys(body.forwardedParamKeys)
  const paramMode =
    body.paramMode && paramModeOk(body.paramMode) ? body.paramMode : TrackerCheckoutParamMode.ALLOWLIST_ONLY

  const useEphemeralLinks = Boolean(body.useEphemeralLinks)
  const ephemeralTtlMinutes =
    typeof body.ephemeralTtlMinutes === 'number' &&
    Number.isFinite(body.ephemeralTtlMinutes) &&
    body.ephemeralTtlMinutes >= 5 &&
    body.ephemeralTtlMinutes <= 7 * 24 * 60
      ? Math.floor(body.ephemeralTtlMinutes)
      : 60
  const ephemeralMaxUses =
    typeof body.ephemeralMaxUses === 'number' &&
    Number.isFinite(body.ephemeralMaxUses) &&
    body.ephemeralMaxUses >= 1 &&
    body.ephemeralMaxUses <= 100
      ? Math.floor(body.ephemeralMaxUses)
      : 1

  let pixelBackupDelayMs: number | null | undefined = undefined
  if (body.pixelBackupDelayMs === null) {
    pixelBackupDelayMs = null
  } else if (typeof body.pixelBackupDelayMs === 'number' && Number.isFinite(body.pixelBackupDelayMs)) {
    const p = Math.floor(body.pixelBackupDelayMs)
    pixelBackupDelayMs = p >= 0 && p <= 120_000 ? p : null
  }

  const payload = {
    forwardedParamKeys: keys,
    paramMode,
    useEphemeralLinks,
    ephemeralTtlMinutes,
    ephemeralMaxUses,
    ...(pixelBackupDelayMs !== undefined ? { pixelBackupDelayMs } : {}),
  }

  await prisma.trackerCheckoutSettings.upsert({
    where: { offerId },
    create: {
      offerId,
      forwardedParamKeys: keys,
      paramMode,
      useEphemeralLinks,
      ephemeralTtlMinutes,
      ephemeralMaxUses,
      pixelBackupDelayMs: pixelBackupDelayMs ?? null,
    },
    update: payload,
  })

  return NextResponse.json({ ok: true })
}
