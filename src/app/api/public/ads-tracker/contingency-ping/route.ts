import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const PING_KEY = 'mentorado_contingency_ping'

/**
 * POST — Ping de saúde do servidor de contingência / edge.
 * Authorization: Bearer ADS_TRACKER_CONTINGENCY_PING_SECRET
 * Body opcional: { ok?: boolean, latencyMs?: number, source?: string }
 */
export async function POST(req: Request) {
  const secret = process.env.ADS_TRACKER_CONTINGENCY_PING_SECRET?.trim()
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim()
  if (!secret || auth !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let raw: Record<string, unknown> = {}
  try {
    raw = (await req.json()) as Record<string, unknown>
  } catch {
    /* body vazio */
  }

  const payload = {
    at: new Date().toISOString(),
    ok: typeof raw.ok === 'boolean' ? raw.ok : true,
    latencyMs: typeof raw.latencyMs === 'number' && Number.isFinite(raw.latencyMs) ? raw.latencyMs : null,
    source: typeof raw.source === 'string' ? raw.source.trim().slice(0, 64) : null,
  }

  await prisma.systemSetting.upsert({
    where: { key: PING_KEY },
    create: { key: PING_KEY, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  })

  return NextResponse.json({ ok: true })
}
