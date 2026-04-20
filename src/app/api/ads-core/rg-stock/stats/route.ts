import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const [disponivel, emUso, utilizado] = await Promise.all([
    prisma.adsCoreRgStock.count({ where: { status: 'DISPONIVEL' } }),
    prisma.adsCoreRgStock.count({ where: { status: 'EM_USO' } }),
    prisma.adsCoreRgStock.count({ where: { status: 'UTILIZADO' } }),
  ])

  return NextResponse.json({ disponivel, emUso, utilizado })
}
