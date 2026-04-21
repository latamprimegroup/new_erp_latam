/**
 * Bridge Comercial → Financeiro
 *
 * Disparado quando um pedido muda para status PAID.
 * Cria automaticamente:
 *   1. FinancialEntry de RECEITA (Contas a Receber) — marcado como PAID
 *   2. FinancialEntry de DESPESA (Provisão de Comissão) — marcado como PENDING
 *   3. Notificação in-app para todos os usuários FINANCE/ADMIN
 *   4. AuditLog da integração
 */

import { prisma } from './prisma'
import { audit } from './audit'
import { notify } from './notifications'

/** Taxa de comissão padrão caso o vendedor não tenha uma configurada (5%) */
const DEFAULT_COMMISSION_RATE = 5.0

/** Categorias usadas nos lançamentos automáticos */
const CATEGORY_RECEITA   = 'RECEITA_COMERCIAL'
const CATEGORY_COMISSAO  = 'COMISSOES_VENDEDORES'

/**
 * Função principal da integração Comercial → Financeiro.
 * Idempotente: verifica se já existe lançamento para o pedido antes de criar.
 */
export async function handleSaleToFinancialBridge(
  orderId: string,
  triggeredBy?: string
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        seller: { select: { id: true, name: true, email: true, commissionRate: true } },
      },
    })

    if (!order) return { ok: false, reason: 'Pedido não encontrado' }
    if (order.status !== 'PAID') return { ok: false, reason: 'Bridge só para pedidos PAID' }

    // Idempotência: já existe entrada de receita vinculada a este pedido?
    const existing = await prisma.financialEntry.findFirst({
      where: { orderId, type: 'INCOME', category: CATEGORY_RECEITA },
    })
    if (existing) return { ok: true, skipped: true, reason: 'Lançamento já criado anteriormente' }

    const orderValue = Number(order.value)
    const clientCode = order.client?.clientCode ?? null
    const clientName = order.client?.user?.name ?? order.client?.user?.email ?? 'Cliente'
    const sellerName = order.seller?.name ?? null
    const originTag  = `comercial_venda_${orderId}`

    // ── 1. Lançamento de Receita (Contas a Receber) ──────────────────────────
    const incomeEntry = await prisma.financialEntry.create({
      data: {
        type:          'INCOME',
        category:      CATEGORY_RECEITA,
        costCenter:    clientCode ?? undefined,
        value:         orderValue,
        currency:      order.currency ?? 'BRL',
        date:          order.paidAt ?? new Date(),
        dueDate:       order.paidAt ?? new Date(),
        paymentDate:   order.paidAt ?? new Date(),
        entryStatus:   'PAID',
        paymentMethod: (order.paymentMethod as 'PIX' | 'BOLETO' | 'TED' | 'OUTRO' | null) ?? null,
        orderId:       order.id,
        description:   [
          `Venda ${clientCode ?? clientName}`,
          order.product,
          `Qtd: ${order.quantity}`,
          sellerName ? `Vendedor: ${sellerName}` : null,
          `Origem: ${originTag}`,
        ]
          .filter(Boolean)
          .join(' | '),
        reconciled: false,
        netProfit: orderValue,
      },
    })

    // ── 2. Provisão de Comissão (Contas a Pagar) ─────────────────────────────
    let commissionEntry = null
    if (order.seller) {
      const rate        = Number(order.seller.commissionRate ?? DEFAULT_COMMISSION_RATE)
      const commission  = parseFloat(((orderValue * rate) / 100).toFixed(2))

      if (commission > 0) {
        commissionEntry = await prisma.financialEntry.create({
          data: {
            type:        'EXPENSE',
            category:    CATEGORY_COMISSAO,
            costCenter:  order.seller.id,
            value:       commission,
            currency:    order.currency ?? 'BRL',
            date:        new Date(),
            entryStatus: 'PENDING',
            orderId:     order.id,
            description: [
              `Comissão ${rate}% — ${sellerName ?? order.seller.email}`,
              `Pedido ${orderId}`,
              `Aguardando pagamento ao vendedor`,
            ].join(' | '),
            reconciled: false,
          },
        })
      }
    }

    // ── 3. Notificação para time Financeiro ──────────────────────────────────
    const financeUsers = await prisma.user.findMany({
      where: { role: { in: ['FINANCE', 'ADMIN'] } },
      select: { id: true },
    })

    await Promise.allSettled(
      financeUsers.map((u) =>
        notify({
          userId:   u.id,
          type:     'SALE_FINANCIAL_BRIDGE',
          title:    `Nova venda: ${clientCode ?? clientName}`,
          message:  `R$ ${orderValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — ${order.product} (${order.quantity} un.)${commissionEntry ? ` | Comissão provisionada` : ''}`,
          link:     `/dashboard/financeiro?tab=conciliacao_vendas`,
          channels: ['IN_APP'],
          priority: 'HIGH',
        })
      )
    )

    // ── 4. Audit Log ─────────────────────────────────────────────────────────
    await audit({
      userId:   order.seller?.id ?? undefined,
      action:   'commercial_financial_bridge',
      entity:   'Order',
      entityId: orderId,
      details:  {
        triggeredBy,
        incomeEntryId:     incomeEntry.id,
        commissionEntryId: commissionEntry?.id ?? null,
        orderValue,
        clientCode,
        sellerName,
      },
    })

    return { ok: true }
  } catch (err) {
    console.error('[commercial-financial-bridge] Erro:', err)
    return { ok: false, reason: String(err) }
  }
}
