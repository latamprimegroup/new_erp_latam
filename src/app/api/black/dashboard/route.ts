import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPlugPlayConfig, calculateMonthlyAmount } from '@/lib/plugplay-payment'

/**
 * Retorna todos os indicadores do módulo Plug & Play Black.
 * Colaborador: apenas seus dados.
 * Admin: dados globais + por colaborador.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const isPlugPlay = session.user?.role === 'PLUG_PLAY'
  const isAdmin = session.user?.role === 'ADMIN'
  if (!isPlugPlay && !isAdmin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const where: { collaboratorId?: string } = {}
  if (isPlugPlay) where.collaboratorId = session.user!.id!

  const ops = await prisma.blackOperation.findMany({
    where,
    include: {
      collaborator: { select: { id: true, name: true, email: true } },
      payment: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const payments = await prisma.blackPayment.findMany({
    where: isAdmin ? {} : { collaboratorId: session.user!.id! },
    include: {
      operation: { select: { niche: true, wentLiveAt: true } },
      collaborator: { select: { name: true, email: true } },
    },
  })

  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Agregados por status
  const byStatus = {
    DRAFT: ops.filter((o) => o.status === 'DRAFT').length,
    EM_AQUECIMENTO: ops.filter((o) => o.status === 'EM_AQUECIMENTO').length,
    EM_CONFIG: ops.filter((o) => o.status === 'EM_CONFIG').length,
    LIVE: ops.filter((o) => o.status === 'LIVE').length,
    SURVIVED_24H: ops.filter((o) => o.status === 'SURVIVED_24H').length,
    BANNED: ops.filter((o) => o.status === 'BANNED').length,
  }

  const emPreparacao = byStatus.DRAFT + byStatus.EM_AQUECIMENTO + byStatus.EM_CONFIG
  const subiram = byStatus.LIVE + byStatus.SURVIVED_24H + byStatus.BANNED
  const taxaSucesso = subiram > 0 ? Math.round((byStatus.SURVIVED_24H / subiram) * 100) : 0

  // Operações criadas nos últimos 7 dias
  const ultimos7Dias = ops.filter((o) => new Date(o.createdAt) >= sevenDaysAgo).length

  // Operações LIVE há mais de 24h (elegíveis para processar pagamento)
  const elegiveis24h = ops.filter((o) => {
    if (o.status !== 'LIVE' || !o.wentLiveAt) return false
    const live = new Date(o.wentLiveAt)
    return (now.getTime() - live.getTime()) / (1000 * 60 * 60) >= 24
  }).length

  // Tempo médio até ban (em horas) - apenas operações BANNED com wentLiveAt e bannedAt
  const bannedComTempo = ops.filter((o) => o.status === 'BANNED' && o.wentLiveAt && o.bannedAt)
  const tempoMedioBanHoras =
    bannedComTempo.length > 0
      ? Math.round(
          bannedComTempo.reduce((s, o) => {
            const live = new Date(o.wentLiveAt!).getTime()
            const banned = new Date(o.bannedAt!).getTime()
            return s + (banned - live) / (1000 * 60 * 60)
          }, 0) / bannedComTempo.length
        )
      : null

  // Por nicho
  const porNicho = ops.reduce<Record<string, { total: number; live: number; survived: number; banned: number }>>(
    (acc, o) => {
      const n = o.niche || 'Sem nicho'
      if (!acc[n]) acc[n] = { total: 0, live: 0, survived: 0, banned: 0 }
      acc[n].total++
      if (o.status === 'LIVE') acc[n].live++
      if (o.status === 'SURVIVED_24H') acc[n].survived++
      if (o.status === 'BANNED') acc[n].banned++
      return acc
    },
    {}
  )

  const totalPending = payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.amount), 0)
  const totalPaid = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount), 0)
  const countPending = payments.filter((p) => p.status === 'PENDING').length

  // Metas e previsão (salário + bônus) - apenas para colaborador (contas SURVIVED_24h no mês)
  const config = await getPlugPlayConfig()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const survivedMonthCount = ops.filter((o) => {
    if (o.status !== 'SURVIVED_24H') return false
    const up = new Date(o.updatedAt)
    return up >= startOfMonth && up <= endOfMonth
  }).length
  const previsao = isPlugPlay ? calculateMonthlyAmount(survivedMonthCount, config) : null
  const percentMeta = config.metaMensal > 0 ? Math.min(100, Math.round((survivedMonthCount / config.metaMensal) * 100)) : 0
  const percentElite = config.metaElite > 0 ? Math.min(100, Math.round((survivedMonthCount / config.metaElite) * 100)) : 0

  // Por colaborador (apenas admin)
  let porColaborador: Array<{
    collaboratorId: string
    name: string | null
    email: string
    total: number
    live: number
    survived: number
    banned: number
    pending: number
    paid: number
  }> = []

  if (isAdmin) {
    const colaboradores = Array.from(new Set(ops.map((o) => o.collaboratorId)))
    porColaborador = colaboradores.map((cid) => {
      const userOps = ops.filter((o) => o.collaboratorId === cid)
      const coll = userOps[0]?.collaborator
      const userPayments = payments.filter((p) => p.collaboratorId === cid)
      const survMonth = userOps.filter((o) => {
        if (o.status !== 'SURVIVED_24H') return false
        const up = new Date(o.updatedAt)
        return up >= startOfMonth && up <= endOfMonth
      }).length
      const prev = calculateMonthlyAmount(survMonth, config)
      return {
        collaboratorId: cid,
        name: coll?.name ?? null,
        email: coll?.email ?? '',
        total: userOps.length,
        live: userOps.filter((o) => o.status === 'LIVE').length,
        survived: userOps.filter((o) => o.status === 'SURVIVED_24H').length,
        survivedMes: survMonth,
        previsaoTotal: prev.total,
        tier: prev.tier,
        banned: userOps.filter((o) => o.status === 'BANNED').length,
        pending: userPayments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.amount), 0),
        paid: userPayments.filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount), 0),
      }
    })
  }

  return NextResponse.json({
    summary: {
      totalOperacoes: ops.length,
      emPreparacao,
      noAr: byStatus.LIVE,
      sobreviveu24h: byStatus.SURVIVED_24H,
      survivedMes: survivedMonthCount,
      banidas: byStatus.BANNED,
      taxaSucesso,
      ultimos7Dias,
      elegiveis24h,
      tempoMedioBanHoras,
      previsaoMes: previsao ? { ...previsao, percentMeta, percentElite } : null,
      config: { salarioBase: config.salarioBase, metaMensal: config.metaMensal, metaElite: config.metaElite },
    },
    byStatus,
    porNicho: Object.entries(porNicho).map(([nicho, data]) => ({ nicho, ...data })),
    payments: {
      totalPending,
      totalPaid,
      countPending,
    },
    porColaborador: isAdmin ? porColaborador : undefined,
  })
}
