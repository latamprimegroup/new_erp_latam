import { NextResponse } from 'next/server'
import { TrafficShieldSpyBlockKind } from '@prisma/client'
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

export async function GET() {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const blocks = await prisma.trafficShieldSpyBlock.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return NextResponse.json({ blocks })
}

/**
 * Body: { kind: 'IP_CIDR' | 'USER_AGENT_SUBSTRING', pattern: string, note?: string, push?: boolean }
 */
export async function POST(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  let body: { kind?: string; pattern?: string; note?: string; push?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const kindRaw = typeof body.kind === 'string' ? body.kind.trim() : ''
  const kind =
    kindRaw === 'IP_CIDR'
      ? TrafficShieldSpyBlockKind.IP_CIDR
      : kindRaw === 'USER_AGENT_SUBSTRING'
        ? TrafficShieldSpyBlockKind.USER_AGENT_SUBSTRING
        : null
  if (!kind) {
    return NextResponse.json({ error: 'kind inválido' }, { status: 400 })
  }

  const pattern = typeof body.pattern === 'string' ? body.pattern.trim() : ''
  if (!pattern) {
    return NextResponse.json({ error: 'pattern vazio' }, { status: 400 })
  }

  if (kind === TrafficShieldSpyBlockKind.IP_CIDR) {
    if (pattern.length > 64 || !isValidIpv4Cidr(pattern)) {
      return NextResponse.json({ error: 'IPv4 ou CIDR IPv4 inválido' }, { status: 400 })
    }
  } else {
    if (pattern.length < 2 || pattern.length > 300) {
      return NextResponse.json({ error: 'substring UA: entre 2 e 300 caracteres' }, { status: 400 })
    }
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null

  const row = await prisma.trafficShieldSpyBlock.create({
    data: { kind, pattern, note, active: true },
  })

  let pushResult: Awaited<ReturnType<typeof pushTrafficShieldConfigToEdge>> | null = null
  if (body.push !== false) {
    pushResult = await pushTrafficShieldConfigToEdge()
  }

  return NextResponse.json({ ok: true, block: row, push: pushResult })
}
