import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getClientUniIds } from '@/lib/cliente/profit-board'

const bodySchema = z.object({
  currentDailyBudget: z.number().positive().max(1e9),
  proposedIncreasePercent: z.number().min(-90).max(300),
  /** ROI real % (opcional) — só para copy da resposta */
  roiRealPercent: z.number().finite().optional().nullable(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const uniIds = await getClientUniIds(client.id)
  const since24h = new Date(Date.now() - 24 * 3600 * 1000)
  const [allowed, blocked] =
    uniIds.length === 0
      ? [0, 0]
      : await Promise.all([
          prisma.trafficShieldAccessLog.count({
            where: { uniId: { in: uniIds }, createdAt: { gte: since24h }, verdict: 'ALLOWED' },
          }),
          prisma.trafficShieldAccessLog.count({
            where: { uniId: { in: uniIds }, createdAt: { gte: since24h }, verdict: 'BLOCKED' },
          }),
        ])

  const total = allowed + blocked
  const blockedRatio = total > 0 ? blocked / total : 0

  let safeMaxTodayPercent = 20
  if (blockedRatio > 0.35) safeMaxTodayPercent = 10
  else if (blockedRatio > 0.2) safeMaxTodayPercent = 15

  const warnings: string[] = []
  const hardCapPercent = 20
  const proposed = body.proposedIncreasePercent

  if (proposed > hardCapPercent) {
    warnings.push(
      'Cuidado: risco de flag por atividade incomum nas UNIs — sobe o orçamento em no máximo 20% hoje, salvo orientação humana explícita.',
    )
  }

  if (proposed > safeMaxTodayPercent) {
    warnings.push(
      `Com a saúde atual do shield (${(blockedRatio * 100).toFixed(0)}% bloqueios nas últimas 24h), o teto sugerido para hoje é +${safeMaxTodayPercent}%.`,
    )
  }

  if (uniIds.length === 0) {
    warnings.push('Sem UNIs atribuídas — confirma o acesso Ads Ativos antes de escalar budget.')
  }

  const appliedPercent =
    proposed >= 0 ? Math.min(proposed, safeMaxTodayPercent, hardCapPercent) : proposed
  const proposedBudget = body.currentDailyBudget * (1 + proposed / 100)
  const cappedBudget = body.currentDailyBudget * (1 + appliedPercent / 100)

  let narrative = `Orçamento atual: ${body.currentDailyBudget.toFixed(2)}. Com +${appliedPercent}% (teto operacional hoje): ${cappedBudget.toFixed(2)}.`
  if (body.roiRealPercent != null && Number.isFinite(body.roiRealPercent)) {
    narrative += ` ROI real de referência: ${body.roiRealPercent.toFixed(1)}%.`
  }

  return NextResponse.json({
    uniHealth24h: { allowed, blocked, blockedRatio },
    safeMaxTodayPercent,
    hardCapPercent,
    proposedIncreasePercent: body.proposedIncreasePercent,
    appliedIncreasePercent: appliedPercent,
    proposedBudgetUnchecked: proposedBudget,
    recommendedNextDailyBudget: cappedBudget,
    warnings,
    narrative,
  })
}
