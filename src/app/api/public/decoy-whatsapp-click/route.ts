import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function normalizeString(value: string | null, maxLen: number) {
  const safe = String(value ?? '').trim()
  if (!safe) return null
  return safe.slice(0, maxLen)
}

function readClientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || null
  )
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const input = body as {
    source?: string
    reason?: string
    code?: string
    token?: string
    checkoutId?: string
    listingId?: string
    referrer?: string
  }

  const payload = {
    source: normalizeString(input.source ?? null, 80),
    reason: normalizeString(input.reason ?? null, 120),
    code: normalizeString(input.code ?? null, 80),
    token: normalizeString(input.token ?? null, 140),
    checkoutId: normalizeString(input.checkoutId ?? null, 140),
    listingId: normalizeString(input.listingId ?? null, 140),
    referrer: normalizeString(input.referrer ?? null, 400),
    userAgent: normalizeString(req.headers.get('user-agent'), 400),
    ip: normalizeString(readClientIp(req), 45),
  }

  await prisma.auditLog.create({
    data: {
      action: 'QUICK_SALE_DECOY_WHATSAPP_CLICK',
      entity: 'DecoyLanding',
      entityId: payload.code ?? payload.token ?? null,
      userId: null,
      details: payload,
      ip: payload.ip,
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

