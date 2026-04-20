import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const u = new URL(req.url)
  const take = Math.min(200, Math.max(10, Number(u.searchParams.get('take')) || 80))

  const checks = await prisma.trackerDomainReputationCheck.findMany({
    orderBy: { checkedAt: 'desc' },
    take,
  })
  const checksOut = checks.map((c) => ({
    id: c.id,
    domainHost: c.domainHost,
    status: c.status,
    detail: c.detail,
    panicTriggered: c.panicTriggered,
    checkedAt: c.checkedAt.toISOString(),
  }))

  const warningRows = await prisma.trackerDomainReputationCheck.findMany({
    where: { status: 'WARNING' },
    orderBy: { checkedAt: 'desc' },
    take: 200,
    select: { domainHost: true, checkedAt: true, detail: true },
  })
  const seen = new Set<string>()
  const warningHosts: { domainHost: string; checkedAt: Date; detail: string | null }[] = []
  for (const c of warningRows) {
    if (seen.has(c.domainHost)) continue
    seen.add(c.domainHost)
    warningHosts.push(c)
    if (warningHosts.length >= 50) break
  }

  return NextResponse.json({
    checks: checksOut,
    warningHosts: warningHosts.map((w) => ({
      ...w,
      checkedAt: w.checkedAt.toISOString(),
    })),
  })
}
