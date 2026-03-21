import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { registerG2AssetsConsumed } from '@/lib/g2-agent'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notifyAdminsStockAdded } from '@/lib/notifications/admin-events'

/**
 * POST - Reclassifica conta G2 REPROVADA para estoque como Google Verificação Anunciante
 * (melhoria.txt Módulo 2.2 - Reclassificação Automática de Ativos)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const { id } = await params
  const g2 = await prisma.productionG2.findFirst({
    where: { id, deletedAt: null },
    include: { credentials: true },
  })

  if (!g2) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (g2.status !== 'REPROVADA') {
    return NextResponse.json(
      { error: 'Apenas contas reprovadas (G2 Rejeitada) podem ser reclassificadas' },
      { status: 400 }
    )
  }
  if (g2.stockAccountId) {
    return NextResponse.json(
      { error: 'Já reclassificada para estoque' },
      { status: 400 }
    )
  }

  const result = await prisma.$transaction(async (tx) => {
    const stock = await tx.stockAccount.create({
      data: {
        platform: 'GOOGLE_ADS',
        type: 'CONTA_VERIFICADA_ANUNCIANTE', // Google Verificação Anunciante (sem G2)
        source: 'PRODUCTION_G2_RECLASSIFIED',
        status: 'AVAILABLE',
        googleAdsCustomerId: g2.googleAdsCustomerId || undefined,
        niche: null,
        isPlugPlay: false, // G2 rejeitada = não é Plug & Play
      },
    })

    if (g2.emailId) {
      await tx.email.update({ where: { id: g2.emailId }, data: { accountId: stock.id } })
    }
    if (g2.cnpjId) {
      await tx.cnpj.update({ where: { id: g2.cnpjId }, data: { accountId: stock.id } })
    }
    if (g2.paymentProfileId) {
      await tx.paymentProfile.update({ where: { id: g2.paymentProfileId }, data: { accountId: stock.id } })
    }

    await tx.productionG2.update({
      where: { id },
      data: {
        status: 'ENVIADA_ESTOQUE',
        stockAccountId: stock.id,
        sentToStockAt: new Date(),
      },
    })

    await tx.rentedPhoneNumber.updateMany({
      where: { productionG2Id: id },
      data: {
        productionG2Id: null,
        stockAccountId: stock.id,
      },
    })

    await tx.productionG2Log.create({
      data: {
        productionG2Id: id,
        userId: session.user!.id,
        action: 'RECLASSIFY_TO_STOCK',
        details: { stockAccountId: stock.id, type: 'CONTA_VERIFICADA_ANUNCIANTE' },
      },
    })

    return { stockAccountId: stock.id }
  })

  await registerG2AssetsConsumed(id, {
    emailGoogle: g2.credentials?.emailGoogle ?? undefined,
    recoveryEmail: g2.credentials?.recoveryEmail ?? undefined,
    googleAdsCustomerId: g2.googleAdsCustomerId ?? undefined,
    cnpjNumber: g2.cnpjNumber ?? undefined,
    paymentProfileId: g2.paymentProfileId ?? undefined,
  })

  await audit({
    userId: session.user!.id,
    action: 'production_g2_reclassified_to_stock',
    entity: 'ProductionG2',
    entityId: id,
    details: { codeG2: g2.codeG2, stockAccountId: result.stockAccountId, type: 'CONTA_VERIFICADA_ANUNCIANTE' },
  })

  notifyAdminsStockAdded(g2.codeG2, 'GOOGLE_ADS').catch(console.error)

  return NextResponse.json({ ok: true, stockAccountId: result.stockAccountId })
}
