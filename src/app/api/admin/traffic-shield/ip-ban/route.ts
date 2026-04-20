import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { pushTrafficShieldConfigToEdge } from '@/lib/traffic-shield/push-config'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => {
    const n = Number(p)
    return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === p
  })
}

function isValidIpv4Cidr(s: string): boolean {
  if (!s.includes('/')) return isValidIpv4(s)
  const [addr, maskStr] = s.split('/')
  const mask = Number(maskStr)
  return isValidIpv4(addr) && Number.isInteger(mask) && mask >= 8 && mask <= 32
}

/**
 * POST — Bloqueio manual de IP (lista enviada ao edge no próximo push).
 * Body: { ip: string, note?: string, push?: boolean }
 */
export async function POST(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  let body: { ip?: string; note?: string; push?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const raw = typeof body.ip === 'string' ? body.ip.trim() : ''
  if (!raw || raw.length > 64) {
    return NextResponse.json({ error: 'ip inválido' }, { status: 400 })
  }

  const ip = raw
  if (!isValidIpv4Cidr(ip)) {
    return NextResponse.json({ error: 'Use IPv4 ou CIDR IPv4 (ex.: 203.0.113.10 ou 203.0.113.0/24)' }, { status: 400 })
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 400) || null : null
  const uid = auth.session.user.id

  await prisma.trafficShieldIpBlock.upsert({
    where: { cidrOrIp: ip },
    create: {
      cidrOrIp: ip,
      note,
      active: true,
      createdById: uid,
    },
    update: {
      note: note ?? undefined,
      active: true,
    },
  })

  let pushResult: Awaited<ReturnType<typeof pushTrafficShieldConfigToEdge>> | null = null
  if (body.push !== false) {
    pushResult = await pushTrafficShieldConfigToEdge()
  }

  return NextResponse.json({ ok: true, ip, push: pushResult })
}
