import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PRODUCTION_MANAGER']
/** Percentual de divergência que dispara alerta de auditoria para o CEO */
const CEO_ALERT_THRESHOLD_PCT = 10

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const check = await prisma.inventoryCheck.findUnique({
    where: { id: params.id },
    include: { items: true },
  })
  if (!check) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (check.status !== 'ABERTO')
    return NextResponse.json({ error: 'Inventário já finalizado ou cancelado' }, { status: 409 })
  if (session.user.role === 'PRODUCTION_MANAGER' && check.managerId !== session.user.id)
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const countedItems = check.items.filter((i) => i.physicalStock !== null)
  if (countedItems.length === 0)
    return NextResponse.json({ error: 'Nenhum item foi contado' }, { status: 422 })

  // Itens com divergência obrigam motivo
  const missingReason = countedItems.filter(
    (i) => (i.difference ?? 0) !== 0 && !i.reason
  )
  if (missingReason.length > 0)
    return NextResponse.json({
      error: `${missingReason.length} item(s) com divergência sem motivo informado`,
      itemIds: missingReason.map((i) => i.id),
    }, { status: 422 })

  // Calcular impacto financeiro e divergência máxima
  let totalValueImpact = 0
  let maxDivergencePct = 0

  const movements = countedItems
    .filter((i) => (i.difference ?? 0) !== 0)
    .map((i) => {
      const diff = i.difference ?? 0
      const cost = Number(i.unitCost ?? 0)
      totalValueImpact += diff * cost

      if (i.systemStock > 0) {
        const pct = Math.abs((diff / i.systemStock) * 100)
        if (pct > maxDivergencePct) maxDivergencePct = pct
      }

      return {
        checkId: params.id,
        itemName: i.itemName,
        category: i.itemCategory,
        quantity: Math.abs(diff),
        movType: diff > 0 ? 'ENTRADA_INVENTARIO' : 'SAIDA_INVENTARIO',
        reason: i.reason ?? null,
        unitCost: i.unitCost ?? null,
        managerId: session.user.id,
      }
    })

  const ceoAlertTriggered = maxDivergencePct >= CEO_ALERT_THRESHOLD_PCT

  await prisma.$transaction([
    // Criar movimentos de estoque
    ...(movements.length > 0
      ? [prisma.stockMovement.createMany({ data: movements })]
      : []),
    // Finalizar o inventário
    prisma.inventoryCheck.update({
      where: { id: params.id },
      data: {
        status: 'FINALIZADO',
        finalizedAt: new Date(),
        totalValueImpact,
        maxDivergencePct,
        ceoAlertTriggered,
      },
    }),
    // Gerar notificação de alerta CEO se necessário
    ...(ceoAlertTriggered
      ? [prisma.auditLog.create({
          data: {
            action: 'INVENTORY_CEO_ALERT',
            entity: 'InventoryCheck',
            entityId: params.id,
            userId: session.user.id,
            details: JSON.stringify({
              title: check.title,
              maxDivergencePct: maxDivergencePct.toFixed(1),
              totalValueImpact: totalValueImpact.toFixed(2),
            }),
          },
        })]
      : []),
  ])

  return NextResponse.json({
    success: true,
    totalValueImpact,
    maxDivergencePct,
    ceoAlertTriggered,
    movementsCreated: movements.length,
  })
}
