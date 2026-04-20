import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getProductionConfig } from '@/lib/production-payment'

/**
 * GET - Lista contas aprovadas do dia que ainda não foram conferidas pelo gerente.
 * Produção Account (APPROVED) + Production G2 (APROVADA ou ENVIADA_ESTOQUE) sem validatedAt.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get('date') // YYYY-MM-DD
  const date = dateParam ? new Date(dateParam + 'T12:00:00') : new Date()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
  const dateStr = date.toISOString().slice(0, 10)

  const payConfig = await getProductionConfig()

  const [
    approvedProdDay,
    approvedG2Day,
    validatedProdDay,
    validatedG2Day,
    historico,
  ] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        status: 'APPROVED',
        deletedAt: null,
        updatedAt: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.productionG2.count({
      where: {
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        archivedAt: null,
        deletedAt: null,
        approvedAt: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.productionAccount.count({
      where: {
        status: 'APPROVED',
        deletedAt: null,
        validatedAt: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.productionG2.count({
      where: {
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        archivedAt: null,
        deletedAt: null,
        validatedAt: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.auditLog.findMany({
      where: { action: 'production_validated_by_manager' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ])

  const [accounts, g2Items] = await Promise.all([
    prisma.productionAccount.findMany({
      where: {
        status: 'APPROVED',
        validatedAt: null,
        deletedAt: null,
        updatedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { producer: { select: { id: true, name: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.productionG2.findMany({
      where: {
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        archivedAt: null,
        deletedAt: null,
        validatedAt: null,
        approvedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy: { approvedAt: 'desc' },
    }),
  ])

  const byProducer: Record<string, { producer: { id: string; name: string | null; email: string }; accounts: typeof accounts; g2Items: typeof g2Items }> = {}

  for (const a of accounts) {
    const key = a.producerId
    if (!byProducer[key]) {
      byProducer[key] = {
        producer: a.producer,
        accounts: [],
        g2Items: [],
      }
    }
    byProducer[key].accounts.push(a)
  }
  for (const g of g2Items) {
    const key = g.creatorId
    if (!byProducer[key]) {
      byProducer[key] = {
        producer: g.creator,
        accounts: [],
        g2Items: [],
      }
    }
    byProducer[key].g2Items.push(g)
  }

  const approvedSameDay = approvedProdDay + approvedG2Day
  const validatedSameDay = validatedProdDay + validatedG2Day
  const pendingConference = accounts.length + g2Items.length
  const lowEfficiencyValidation =
    pendingConference >= 3 &&
    approvedSameDay > 0 &&
    pendingConference / approvedSameDay >= 0.35

  return NextResponse.json({
    date: dateStr,
    pending: {
      accounts: accounts.length,
      g2Items: g2Items.length,
      total: pendingConference,
    },
    items: { accounts, g2Items },
    byProducer: Object.values(byProducer).filter((p) => p.accounts.length > 0 || p.g2Items.length > 0),
    pay: {
      valorPorConta: payConfig.valorPorConta,
      nota:
        payConfig.valorPorConta > 0
          ? 'Total estimado = contas selecionadas × valor por conta (bônus por faixa no fechamento mensal).'
          : 'Configure produção_valor_por_conta para estimar valores; bônus continua por faixa no fechamento.',
    },
    efficiency: {
      approvedSameDay,
      validatedSameDay,
      pendingConference,
      lowEfficiencyValidation,
    },
    historicoConferencias: historico.map((h) => ({
      id: h.id,
      createdAt: h.createdAt.toISOString(),
      userName: h.user?.name || h.user?.email || '—',
      userId: h.userId,
      details: h.details,
    })),
  })
}
