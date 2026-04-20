import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

const RG_ALERT_THRESHOLD = 100

/**
 * Visão gerente — inventário ADS CORE: nichos ativos, pool de CNPJs sem dono, estoque de pares RG.
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const [
    activeNiches,
    cnpjsDisponiveisPool,
    totalAtivos,
    rgDisponivel,
    rgEmUso,
    rgUtilizado,
  ] = await Promise.all([
    prisma.adsCoreNiche.count({ where: { active: true } }),
    prisma.adsCoreAsset.count({
      where: { producerId: null, statusProducao: 'DISPONIVEL' },
    }),
    prisma.adsCoreAsset.count(),
    prisma.adsCoreRgStock.count({ where: { status: 'DISPONIVEL' } }),
    prisma.adsCoreRgStock.count({ where: { status: 'EM_USO' } }),
    prisma.adsCoreRgStock.count({ where: { status: 'UTILIZADO' } }),
  ])

  return NextResponse.json({
    activeNiches,
    cnpjsDisponiveisPool,
    totalAtivos,
    rgEstoque: {
      disponivel: rgDisponivel,
      emUso: rgEmUso,
      utilizado: rgUtilizado,
    },
    rgAlertaBaixo: rgDisponivel < RG_ALERT_THRESHOLD,
    rgAlertaThreshold: RG_ALERT_THRESHOLD,
  })
}
