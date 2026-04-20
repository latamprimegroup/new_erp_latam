import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * POST — Define/atualiza estatísticas diárias do Traffic Shield (cliques bloqueados + economia estimada).
 * Body: { day?: "YYYY-MM-DD" (default hoje UTC), blockedClicks: number, estimatedSavedBrl?: number, avgCpcBrl?: number }
 * Se `estimatedSavedBrl` omitido e `avgCpcBrl` presente: saved = blockedClicks * avgCpcBrl
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  let body: {
    day?: string
    blockedClicks?: number
    estimatedSavedBrl?: number
    avgCpcBrl?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const blocked = typeof body.blockedClicks === 'number' ? Math.max(0, Math.floor(body.blockedClicks)) : 0
  let saved =
    typeof body.estimatedSavedBrl === 'number' && Number.isFinite(body.estimatedSavedBrl)
      ? Math.max(0, body.estimatedSavedBrl)
      : 0
  if (saved === 0 && typeof body.avgCpcBrl === 'number' && body.avgCpcBrl > 0) {
    saved = blocked * body.avgCpcBrl
  }

  const dayStr =
    typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
      ? body.day
      : new Date().toISOString().slice(0, 10)
  const day = new Date(`${dayStr}T12:00:00.000Z`)

  const row = await prisma.adsTrackerShieldDaily.upsert({
    where: { day },
    create: {
      day,
      blockedClicks: blocked,
      estimatedSavedBrl: saved,
    },
    update: {
      blockedClicks: blocked,
      estimatedSavedBrl: saved,
    },
  })

  return NextResponse.json({
    ok: true,
    id: row.id,
    day: dayStr,
    blockedClicks: row.blockedClicks,
    estimatedSavedBrl: Number(row.estimatedSavedBrl),
  })
}
