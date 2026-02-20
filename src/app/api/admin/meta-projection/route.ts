/**
 * Motor de Projeção de Meta em Tempo Real
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER'])
  if (!auth.ok) return auth.response

  const userIdParam = req.nextUrl.searchParams.get('userId')
  const userId = userIdParam ?? (auth.ok && auth.session ? auth.session.user?.id : null)
  if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const diasNoMes = endOfMonth.getDate()
  const diasDecorridos = now.getDate()
  const diasRestantes = Math.max(0, diasNoMes - diasDecorridos)

  const [goal, prodCount, g2Count] = await Promise.all([
    prisma.goal.findFirst({
      where: {
        userId,
        periodStart: { lte: endOfMonth },
        periodEnd: { gte: startOfMonth },
        status: 'active',
      },
    }),
    prisma.productionAccount.count({
      where: {
        producerId: userId,
        status: 'APPROVED',
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
    }),
    prisma.productionG2.count({
      where: {
        creatorId: userId,
        deletedAt: null,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
      },
    }),
  ])

  const producaoAtual = prodCount + g2Count
  const metaMensal = goal?.monthlyTarget ?? 330
  const producaoDiariaNecessaria = diasRestantes > 0 ? Math.ceil((metaMensal - producaoAtual) / diasRestantes) : 0
  const producaoDiariaMedia = diasDecorridos > 0 ? producaoAtual / diasDecorridos : 0
  const projecaoFechamento = Math.round(producaoDiariaMedia * diasNoMes)
  const riscoNaoBater = producaoAtual < (metaMensal / diasNoMes) * diasDecorridos * 0.8
  const acimaMedia = producaoAtual >= (metaMensal / diasNoMes) * diasDecorridos * 1.1
  const bonusEstimado = goal?.bonus && producaoAtual >= metaMensal ? Number(goal.bonus) : 0
  const progressoPct = metaMensal > 0 ? Math.min(100, Math.round((producaoAtual / metaMensal) * 100)) : 0

  return NextResponse.json({
    userId,
    metaMensal,
    producaoAtual,
    diasRestantes,
    diasDecorridos,
    producaoDiariaNecessaria,
    producaoDiariaMedia: Math.round(producaoDiariaMedia * 10) / 10,
    projecaoFechamento,
    progressoPct,
    riscoNaoBater,
    acimaMedia,
    bonusEstimado,
  })
}
