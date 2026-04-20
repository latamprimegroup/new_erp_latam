import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeGamificationLifetimeTotals, GAMIFICATION_REWARD_DEFS } from '@/lib/cliente/gamification'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { netProfit } = await computeGamificationLifetimeTotals(client.id)

  const redemptions = await prisma.clientGamificationRedemption.findMany({
    where: { clientId: client.id },
    select: { rewardKey: true, requestedAt: true, fulfilledAt: true },
  })
  const redMap = new Map(redemptions.map((r) => [r.rewardKey, r]))

  const rewards = GAMIFICATION_REWARD_DEFS.map((def) => {
    const unlocked = netProfit >= def.minNetProfitBrl
    const red = redMap.get(def.key)
    return {
      key: def.key,
      titleKey: def.titleKey,
      descKey: def.descKey,
      minNetProfitBrl: def.minNetProfitBrl,
      unlocked,
      redeemRequestedAt: red?.requestedAt.toISOString() ?? null,
      fulfilledAt: red?.fulfilledAt?.toISOString() ?? null,
      canRedeem: unlocked && !red,
    }
  })

  return NextResponse.json({ netProfitBrl: netProfit, rewards })
}
