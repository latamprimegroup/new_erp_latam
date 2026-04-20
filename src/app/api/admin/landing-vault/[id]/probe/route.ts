import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { probeLandingLatencyMs } from '@/lib/ads-tracker/probe-latency'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/** POST — Mede tempo de resposta HTTP (aproximação; não é LCP real). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const row = await prisma.trackerLandingVault.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const p1 = await probeLandingLatencyMs(row.primaryUrl)
  let p2: number | null = null
  if (row.secondaryUrl?.trim()) {
    p2 = await probeLandingLatencyMs(row.secondaryUrl)
  }

  const now = new Date()
  await prisma.trackerLandingVault.update({
    where: { id },
    data: {
      lastProbeMsPrimary: p1,
      lastProbeMsSecondary: p2,
      lastProbeAt: now,
    },
  })

  return NextResponse.json({
    lastProbeMsPrimary: p1,
    lastProbeMsSecondary: p2,
    lastProbeAt: now.toISOString(),
    note: 'Valor medido no servidor (TTFB aproximado). LCP real exige browser ou CrUX.',
  })
}
