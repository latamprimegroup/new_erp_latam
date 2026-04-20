import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { parseTrafficShieldLogsQuery } from '@/lib/traffic-shield/access-log-query'
import { automationHintFromUserAgent, auditStyleAlertFromUa } from '@/lib/traffic-shield/user-agent-hints'

const ROLES_READ = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * GET — Exportar lista de IPv4 (um por linha) para colar em exclusões / relatórios.
 * Query: mesmos filtros de /logs (hours, gclid, blocked, uniId, ip) +
 *   automation=1 — só IPs cujo UA dispara assinatura de automatismo/auditoria.
 */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES_READ])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const { where } = parseTrafficShieldLogsQuery(searchParams)
  const automationOnly = searchParams.get('automation') === '1'

  const rows = await prisma.trafficShieldAccessLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 4000,
    select: { ip: true, userAgent: true },
  })

  const ips: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (automationOnly) {
      const ua = r.userAgent
      if (!automationHintFromUserAgent(ua) && !auditStyleAlertFromUa(ua)) continue
    }
    if (!IPV4.test(r.ip)) continue
    if (seen.has(r.ip)) continue
    seen.add(r.ip)
    ips.push(r.ip)
  }

  const body = ips.join('\n') + (ips.length ? '\n' : '')
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="traffic-shield-ip-list.txt"',
    },
  })
}
