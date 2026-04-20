import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const u = await prisma.vaultIndustrialUnit.findUnique({ where: { id }, select: { id: true } })
  if (!u) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const take = Math.min(100, Math.max(1, Number(searchParams.get('take') || '40') || 40))

  const rows = await prisma.vaultIndustrialUnitActivityLog.findMany({
    where: { uniId: id },
    orderBy: { createdAt: 'desc' },
    take,
  })

  return NextResponse.json({
    logs: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
