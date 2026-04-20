import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { trafficShieldFraudIpSet, trafficShieldLogToDto } from '@/lib/traffic-shield/access-log-query'

const ROLES_READ = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES_READ])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const row = await prisma.trafficShieldAccessLog.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const fraudIps = await trafficShieldFraudIpSet(6)
  return NextResponse.json({ log: trafficShieldLogToDto(row, fraudIps) })
}
