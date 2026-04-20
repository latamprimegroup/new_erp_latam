import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { probeLandingLatencyMs } from '@/lib/ads-tracker/probe-latency'

const MAX = 12

/**
 * POST — Atualiza latência para várias campanhas (limite {MAX} por pedido).
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  let body: { ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string').slice(0, MAX) : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids obrigatório (máx. ' + MAX + ')' }, { status: 400 })
  }

  const rows = await prisma.adsTrackerCampaign.findMany({ where: { id: { in: ids } } })
  const now = new Date()
  const results: { id: string; lastLatencyMs: number | null }[] = []

  for (const r of rows) {
    const ms = await probeLandingLatencyMs(r.landingUrl)
    await prisma.adsTrackerCampaign.update({
      where: { id: r.id },
      data: { lastLatencyMs: ms, lastLatencyCheckedAt: now },
    })
    results.push({ id: r.id, lastLatencyMs: ms })
  }

  return NextResponse.json({ results, checkedAt: now.toISOString() })
}
