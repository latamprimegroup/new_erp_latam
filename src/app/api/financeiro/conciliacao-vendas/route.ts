/**
 * Conciliação Comercial → Financeiro
 *
 * GET  — Lista vendas PAID/DELIVERED que ainda não têm lançamento de receita reconciliado.
 * POST — Aciona manualmente o bridge para uma venda específica.
 * PATCH /[orderId] — Marca o FinancialEntry como reconciled (comprovante recebido).
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handleSaleToFinancialBridge } from '@/lib/commercial-financial-bridge'
import { audit } from '@/lib/audit'

const ALLOWED = ['ADMIN', 'FINANCE']

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'pending' // 'pending' | 'all'
  const limit = 100

  // Busca pedidos PAID ou DELIVERED
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
    },
    orderBy: { paidAt: 'desc' },
    take: limit,
    include: {
      client: {
        select: {
          clientCode: true,
          user: { select: { name: true, email: true } },
        },
      },
      seller: { select: { name: true, email: true } },
      financialEntries: {
        where: { type: 'INCOME', category: 'RECEITA_COMERCIAL' },
        select: { id: true, reconciled: true, entryStatus: true, value: true, paymentDate: true },
      },
    },
  })

  const enriched = orders.map((o) => {
    const incomeEntry = o.financialEntries[0] ?? null
    return {
      orderId:       o.id,
      clientCode:    o.client?.clientCode,
      clientName:    o.client?.user?.name ?? o.client?.user?.email,
      sellerName:    o.seller?.name ?? o.seller?.email ?? null,
      product:       o.product,
      quantity:      o.quantity,
      value:         Number(o.value),
      currency:      o.currency,
      status:        o.status,
      paymentMethod: o.paymentMethod,
      paidAt:        o.paidAt,
      createdAt:     o.createdAt,
      incomeEntry,
      hasBridgeEntry:   !!incomeEntry,
      isReconciled:     incomeEntry?.reconciled ?? false,
      needsAction:      !incomeEntry || !incomeEntry.reconciled,
    }
  })

  const result = mode === 'pending' ? enriched.filter((o) => o.needsAction) : enriched

  const stats = {
    total:        enriched.length,
    pending:      enriched.filter((o) => o.needsAction).length,
    reconciled:   enriched.filter((o) => o.isReconciled).length,
    noBridge:     enriched.filter((o) => !o.hasBridgeEntry).length,
    totalValue:   enriched.reduce((s, o) => s + o.value, 0),
    pendingValue: enriched.filter((o) => o.needsAction).reduce((s, o) => s + o.value, 0),
  }

  return NextResponse.json({ orders: result, stats })
}

const triggerSchema = z.object({ orderId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = triggerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'orderId obrigatório' }, { status: 422 })

  const result = await handleSaleToFinancialBridge(parsed.data.orderId, 'manual_finance_trigger')

  if (!result.ok && !result.skipped)
    return NextResponse.json({ error: result.reason }, { status: 422 })

  return NextResponse.json(result)
}

const patchSchema = z.object({
  orderId:        z.string().min(1),
  paymentMethod:  z.string().optional(),
  paymentDate:    z.string().datetime().optional(),
  notes:          z.string().max(500).optional(),
})

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const { orderId, paymentDate, notes } = parsed.data

  // Busca a entrada de receita vinculada ao pedido
  const entry = await prisma.financialEntry.findFirst({
    where: { orderId, type: 'INCOME', category: 'RECEITA_COMERCIAL' },
  })

  if (!entry) {
    // Não existe entrada — dispara bridge primeiro
    await handleSaleToFinancialBridge(orderId, 'manual_reconcile')
    const newEntry = await prisma.financialEntry.findFirst({
      where: { orderId, type: 'INCOME', category: 'RECEITA_COMERCIAL' },
    })
    if (!newEntry) return NextResponse.json({ error: 'Não foi possível criar o lançamento' }, { status: 422 })
  }

  const updated = await prisma.financialEntry.updateMany({
    where: { orderId, type: 'INCOME', category: 'RECEITA_COMERCIAL' },
    data: {
      reconciled:   true,
      entryStatus:  'PAID',
      paymentDate:  paymentDate ? new Date(paymentDate) : new Date(),
      ...(notes ? { description: notes } : {}),
    },
  })

  await audit({
    userId:   session.user.id,
    action:   'sale_reconciled',
    entity:   'Order',
    entityId: orderId,
    details:  { updatedCount: updated.count, paymentDate, by: session.user.email },
  })

  return NextResponse.json({ ok: true, updatedEntries: updated.count })
}
