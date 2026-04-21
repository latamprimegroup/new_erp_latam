/**
 * PATCH /api/vendas/ativos/orders/[id]/status
 * Máquina de estados da OS de ativo com triggers automáticos.
 *
 * Transições e permissões:
 *   PENDING_APPROVAL     → APPROVED | CANCELED      (ADMIN only)
 *   APPROVED             → AWAITING_PAYMENT         (ADMIN/COMMERCIAL)
 *   AWAITING_PAYMENT     → CLIENT_PAID | CANCELED   (ADMIN/FINANCE/COMMERCIAL)
 *   CLIENT_PAID          → VENDOR_PAYMENT_SENT      (ADMIN/FINANCE)
 *   VENDOR_PAYMENT_SENT  → VENDOR_PAID              (ADMIN/FINANCE)
 *   VENDOR_PAID          → DELIVERING               (ADMIN/DELIVERER)
 *   DELIVERING           → DELIVERED                (ADMIN/DELIVERER)
 *   DELIVERED            → (terminal)
 *   CANCELED             → (terminal)
 *
 * Triggers automáticos:
 *   CLIENT_PAID  → notifica FINANCE para pagar fornecedor
 *   VENDOR_PAID  → libera credenciais (flag no asset)
 *   DELIVERED    → baixa de estoque (asset.status = DELIVERED)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import type { AssetSalesOrderStatus } from '@prisma/client'

type Transition = { allowed: string[] }

const TRANSITIONS: Record<AssetSalesOrderStatus, Record<string, Transition>> = {
  PENDING_APPROVAL:    { APPROVED: { allowed: ['ADMIN'] }, CANCELED: { allowed: ['ADMIN', 'COMMERCIAL'] } },
  APPROVED:            { AWAITING_PAYMENT: { allowed: ['ADMIN', 'COMMERCIAL'] } },
  AWAITING_PAYMENT:    { CLIENT_PAID: { allowed: ['ADMIN', 'FINANCE', 'COMMERCIAL'] }, CANCELED: { allowed: ['ADMIN', 'FINANCE', 'COMMERCIAL'] } },
  CLIENT_PAID:         { VENDOR_PAYMENT_SENT: { allowed: ['ADMIN', 'FINANCE'] } },
  VENDOR_PAYMENT_SENT: { VENDOR_PAID: { allowed: ['ADMIN', 'FINANCE'] } },
  VENDOR_PAID:         { DELIVERING: { allowed: ['ADMIN', 'DELIVERER'] } },
  DELIVERING:          { DELIVERED: { allowed: ['ADMIN', 'DELIVERER'] } },
  DELIVERED:           {},
  CANCELED:            {},
}

const patchSchema = z.object({
  status:        z.enum(['PENDING_APPROVAL','APPROVED','AWAITING_PAYMENT','CLIENT_PAID','VENDOR_PAYMENT_SENT','VENDOR_PAID','DELIVERING','DELIVERED','CANCELED']),
  notes:         z.string().max(500).optional(),
  approvalNotes: z.string().max(500).optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const order = await prisma.assetSalesOrder.findUnique({
    where:   { id: params.id },
    include: { asset: { select: { id: true, adsId: true, vendorId: true, costPrice: true } }, seller: { select: { id: true, email: true } } },
  })
  if (!order) return NextResponse.json({ error: 'OS não encontrada' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const { status: newStatus, notes, approvalNotes } = parsed.data
  const allowedTransitions = TRANSITIONS[order.status] ?? {}
  const transition = allowedTransitions[newStatus]

  if (!transition)
    return NextResponse.json({ error: `Transição ${order.status} → ${newStatus} não permitida` }, { status: 422 })
  if (!transition.allowed.includes(session.user.role))
    return NextResponse.json({ error: `Role ${session.user.role} não pode executar esta transição` }, { status: 403 })

  const now = new Date()
  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'CLIENT_PAID')    updates.clientPaidAt  = now
  if (newStatus === 'VENDOR_PAID')    updates.vendorPaidAt  = now
  if (newStatus === 'DELIVERED')      updates.deliveredAt   = now
  if (approvalNotes)                  updates.approvalNotes = approvalNotes
  if (newStatus === 'APPROVED')       updates.approvedById  = session.user.id

  const updated = await prisma.assetSalesOrder.update({
    where: { id: params.id },
    data:  updates,
  })

  await prisma.assetSalesOrderMovement.create({
    data: { orderId: params.id, fromStatus: order.status, toStatus: newStatus, notes: notes ?? `${newStatus} por ${session.user.email}`, userId: session.user.id },
  })

  // ── Triggers automáticos ───────────────────────────────────────────────────

  // 1. Cliente pagou → notifica FINANCE para pagar fornecedor
  if (newStatus === 'CLIENT_PAID') {
    const finances = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'FINANCE'] } }, select: { id: true } })
    await Promise.all(finances.map((f) =>
      notify({
        userId:  f.id,
        title:   '💰 Cliente Pagou — Pagar Fornecedor',
        message: `OS ${params.id.slice(-8)} | Ativo ${(order.asset as { adsId: string }).adsId} | Custo: R$ ${Number(order.costSnapshot).toFixed(2)} | Fornecedor: aguardando pagamento`,
        link:    `/dashboard/compras?tab=orders`,
      })
    ))
  }

  // 2. Fornecedor pago → credenciais liberadas para Entrega
  if (newStatus === 'VENDOR_PAID') {
    const deliverers = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'DELIVERER'] } }, select: { id: true } })
    await Promise.all(deliverers.map((d) =>
      notify({
        userId:  d.id,
        title:   '🔓 Credenciais Liberadas para Entrega',
        message: `OS ${params.id.slice(-8)} | Ativo ${(order.asset as { adsId: string }).adsId} | Fornecedor confirmou pagamento. Dados disponíveis para entrega.`,
        link:    `/dashboard/compras?tab=orders`,
      })
    ))
  }

  // 3. Entregue → baixa de estoque (asset.status = DELIVERED)
  if (newStatus === 'DELIVERED') {
    await prisma.asset.update({
      where: { id: order.asset.id },
      data:  { status: 'DELIVERED', deliveredAt: now },
    })
    await prisma.assetMovement.create({
      data: {
        assetId:    order.asset.id,
        fromStatus: 'SOLD',
        toStatus:   'DELIVERED',
        reason:     `Baixa automática — OS ${params.id.slice(-8)} entregue`,
        userId:     session.user.id,
      },
    })
  }

  // 4. Cancelado → libera o ativo de volta para AVAILABLE
  if (newStatus === 'CANCELED') {
    await prisma.asset.update({ where: { id: order.asset.id }, data: { status: 'AVAILABLE' } })
    await prisma.assetMovement.create({
      data: { assetId: order.asset.id, fromStatus: 'SOLD', toStatus: 'AVAILABLE', reason: `OS ${params.id.slice(-8)} cancelada`, userId: session.user.id },
    })
  }

  return NextResponse.json(updated)
}
