/**
 * GET /api/admin/login-audit
 * Lista os logs de auditoria de login.
 * Filtros: ?email=&ip=&success=true/false&limit=50&page=1
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const email   = searchParams.get('email')   || undefined
  const ip      = searchParams.get('ip')      || undefined
  const success = searchParams.get('success')
  const limit   = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
  const page    = Math.max(1, parseInt(searchParams.get('page') || '1', 10))

  const where = {
    ...(email   ? { email:   { contains: email } }     : {}),
    ...(ip      ? { ip:      { contains: ip } }        : {}),
    ...(success !== null && success !== '' ? { success: success === 'true' } : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.loginAuditLog.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit, take: limit,
      include: { user: { select: { name: true, role: true } } },
    }),
    prisma.loginAuditLog.count({ where }),
  ])

  // Agrupar IPs suspeitos (mais de 5 falhas em 24h)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const suspectIps = await prisma.loginAuditLog.groupBy({
    by: ['ip'],
    where: { success: false, createdAt: { gte: since24h } },
    _count: { ip: true },
    having: { ip: { _count: { gt: 5 } } },
    orderBy: { _count: { ip: 'desc' } },
  })

  return NextResponse.json({ logs, total, page, limit, suspectIps })
}
