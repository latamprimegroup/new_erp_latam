import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function readSupportOnlineFlag(): Promise<boolean> {
  const raw = process.env.WAR_ROOM_SUPPORT_OPERATORS_ONLINE?.trim().toLowerCase()
  if (raw === '1' || raw === 'true' || raw === 'yes') return true
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: 'war_room_support_operators_online' },
      select: { value: true },
    })
    const v = row?.value?.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  } catch {
    return false
  }
}

/**
 * Checklist de sucesso — etapas calculadas a partir de dados reais (equivalente a user_progress).
 * Persistência futura: coluna em client_profiles ou tabela dedicada se quiseres overrides manuais.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const [
    uniAccessCount,
    deliveredOrInUseCount,
    linkedUniOnOperationalCount,
    lplReplicate,
    lplUnlock,
    shieldLinkCount,
    shieldDomain,
    approvedSales,
  ] = await Promise.all([
    prisma.clientMentoradoUniAccess.count({ where: { clientId: client.id } }),
    prisma.stockAccount.count({
      where: {
        clientId: client.id,
        deletedAt: null,
        status: { in: ['DELIVERED', 'IN_USE'] },
      },
    }),
    prisma.stockAccount.count({
      where: {
        clientId: client.id,
        deletedAt: null,
        status: { in: ['DELIVERED', 'IN_USE', 'CRITICAL'] },
        mentoradoLinkedUniId: { not: null },
      },
    }),
    prisma.liveProofLabReplicateLog.count({ where: { clientId: client.id } }),
    prisma.liveProofLabTemplateUnlock.count({ where: { clientId: client.id } }),
    prisma.mentoradoShieldTrackerLink.count({ where: { clientId: client.id } }),
    prisma.landingDomain.findFirst({
      where: { clientId: client.id, shieldEnabled: true },
      select: { id: true },
    }),
    prisma.trackerOfferSaleSignal.count({
      where: {
        paymentState: 'APPROVED',
        countedForRevenue: true,
        offer: { mentoradoShieldLink: { clientId: client.id } },
      },
    }),
  ])

  const hasDeliveredAsset = deliveredOrInUseCount > 0
  const hasUniLinked = uniAccessCount > 0 || linkedUniOnOperationalCount > 0
  const hasOfferPlaybook = lplReplicate > 0 || lplUnlock > 0
  const hasShield = shieldLinkCount > 0 || shieldDomain != null
  const hasFirstSale = approvedSales > 0

  const stepIdentity = hasUniLinked
  const stepAsset = stepIdentity && hasDeliveredAsset
  const stepOffer = stepAsset && hasOfferPlaybook
  const stepShield = stepOffer && hasShield
  const stepSale = stepShield && hasFirstSale

  const flags = [stepIdentity, stepAsset, stepOffer, stepShield, stepSale]
  let consecutiveDone = 0
  for (const f of flags) {
    if (!f) break
    consecutiveDone += 1
  }

  const supportOnline = await readSupportOnlineFlag()

  return NextResponse.json({
    checklist: {
      totalSteps: 5,
      consecutiveDone,
      fraction: consecutiveDone / 5,
      steps: [
        {
          id: 'identity',
          done: stepIdentity,
          href: '/dashboard/cliente/ads-war-room',
        },
        {
          id: 'asset',
          done: stepAsset,
          href: '/dashboard/cliente/armory',
        },
        {
          id: 'offer',
          done: stepOffer,
          href: '/dashboard/cliente/live-proof-labs',
        },
        {
          id: 'shield',
          done: stepShield,
          href: '/dashboard/cliente/shield-tracker',
        },
        {
          id: 'sale',
          done: stepSale,
          href: '/dashboard/cliente/profit-board',
        },
      ],
    },
    warTeam: {
      supportOnline,
      operators: [
        { id: 'gustavo', name: 'Gustavo' },
        { id: 'francielle', name: 'Francielle' },
      ],
    },
  })
}
