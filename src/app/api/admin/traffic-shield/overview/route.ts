import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

function hourKeyBr(d: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  return `${h}h`
}

/**
 * GET — KPIs + série 24h + sinais de padrão anómalo (muitos contextos por IP).
 */
export async function GET() {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const since15m = new Date(Date.now() - 15 * 60 * 1000)

  const [total, blocked, allowed] = await Promise.all([
    prisma.trafficShieldAccessLog.count({ where: { createdAt: { gte: since24 } } }),
    prisma.trafficShieldAccessLog.count({ where: { createdAt: { gte: since24 }, verdict: 'BLOCKED' } }),
    prisma.trafficShieldAccessLog.count({ where: { createdAt: { gte: since24 }, verdict: 'ALLOWED' } }),
  ])

  const efficiencyPct = total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0

  const recent = await prisma.trafficShieldAccessLog.findMany({
    where: { createdAt: { gte: since24 } },
    select: { createdAt: true, verdict: true },
  })

  const byHourAllowed = new Map<string, number>()
  const byHourBlocked = new Map<string, number>()
  for (const r of recent) {
    const k = hourKeyBr(r.createdAt)
    if (r.verdict === 'ALLOWED') {
      byHourAllowed.set(k, (byHourAllowed.get(k) ?? 0) + 1)
    } else if (r.verdict === 'BLOCKED') {
      byHourBlocked.set(k, (byHourBlocked.get(k) ?? 0) + 1)
    }
  }

  const hours = [...new Set([...byHourAllowed.keys(), ...byHourBlocked.keys()])].sort((a, b) => {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    return na - nb
  })

  const bar24h = hours.map((hour) => ({
    hour,
    permitidos: byHourAllowed.get(hour) ?? 0,
    retidos: byHourBlocked.get(hour) ?? 0,
  }))

  const multiCtx = await prisma.trafficShieldAccessLog.findMany({
    where: {
      createdAt: { gte: since15m },
      contextKey: { not: null },
    },
    select: { ip: true, contextKey: true },
  })

  const byIp = new Map<string, Set<string>>()
  for (const r of multiCtx) {
    if (!r.contextKey) continue
    const set = byIp.get(r.ip) ?? new Set()
    set.add(r.contextKey)
    byIp.set(r.ip, set)
  }

  const suspiciousIps = [...byIp.entries()]
    .filter(([, set]) => set.size >= 4)
    .map(([ip, set]) => ({
      ip,
      distinctContexts: set.size,
      note: 'Muitos contextos distintos num curto intervalo — rever abuso ou configuração.',
    }))
    .slice(0, 20)

  return NextResponse.json({
    kpis24h: {
      totalAccesses: total,
      filteredAccesses: blocked,
      cleanAccesses: allowed,
      filterEfficiencyPct: efficiencyPct,
    },
    chart24h: bar24h,
    suspiciousIps,
    disclaimer:
      'O ERP regista decisões reportadas pelo edge e distribui listas de bloqueio. Não implementa páginas alternativas nem evasão de revisores de anúncios.',
  })
}
