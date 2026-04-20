import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  parseTrafficShieldLogsQuery,
  trafficShieldFraudIpSet,
  trafficShieldLogToDto,
} from '@/lib/traffic-shield/access-log-query'

const ROLES_READ = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

/**
 * GET — Logs granulares para auditoria (Módulo 09).
 * Query: take, skip, hours (1–168), gclid=1, blocked=1, uniId, ip
 */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES_READ])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const { where, take, skip } = parseTrafficShieldLogsQuery(searchParams)

  const fraudWindowHours = 6
  const [fraudIps, total, rows] = await Promise.all([
    trafficShieldFraudIpSet(fraudWindowHours),
    prisma.trafficShieldAccessLog.count({ where }),
    prisma.trafficShieldAccessLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
  ])

  return NextResponse.json({
    logs: rows.map((r) => trafficShieldLogToDto(r, fraudIps)),
    total,
    fraudWindowHours,
    disclaimer:
      'Heurísticas (UA, IP em vários contextos) são sinais operacionais — não substituem revisão humana nem configuram automaticamente exclusões no Google Ads.',
  })
}
