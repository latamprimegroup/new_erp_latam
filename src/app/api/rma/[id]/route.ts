/**
 * GET   /api/rma/[id] — Detalhes do ticket
 * PATCH /api/rma/[id] — Transições de status + reserva de ativo de reposição
 *
 * Máquina de estados:
 *   OPEN → APPROVED (admin) | REJECTED (admin)
 *   UNDER_REVIEW → APPROVED | REJECTED
 *   APPROVED → REPLACEMENT_SENT (purchaser/deliverer)
 *   REPLACEMENT_SENT → CLOSED → CREDITED
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import type { RMAStatus } from '@prisma/client'

const ADMIN_ROLES = ['ADMIN', 'PURCHASING']

const patchSchema = z.object({
  action:            z.enum(['APPROVE', 'REJECT', 'SEND_REPLACEMENT', 'CLOSE', 'CREDIT']),
  replacementAssetId: z.string().optional(),
  notes:             z.string().max(1000).optional(),
})

export async function GET(_req: globalThis.Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const ticket = await prisma.rMATicket.findUnique({
    where: { id: params.id },
    include: {
      originalAsset:    { include: { vendor: true } },
      replacementAsset: { select: { adsId: true, displayName: true, costPrice: true } },
      vendor:           true,
      openedBy:         { select: { name: true, email: true } },
      approvedBy:       { select: { name: true } },
    },
  })
  if (!ticket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })

  return NextResponse.json(ticket)
}

export async function PATCH(req: globalThis.Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const ticket = await prisma.rMATicket.findUnique({
    where:   { id: params.id },
    include: { originalAsset: { include: { vendor: true } }, vendor: true },
  })
  if (!ticket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const { action, replacementAssetId, notes } = parsed.data
  const isAdmin = ADMIN_ROLES.includes(session.user.role)

  // ── APPROVE ─────────────────────────────────────────────────────────────────
  if (action === 'APPROVE') {
    if (!isAdmin) return NextResponse.json({ error: 'Apenas ADMIN/PURCHASING pode aprovar' }, { status: 403 })
    if (!['OPEN', 'UNDER_REVIEW'].includes(ticket.status))
      return NextResponse.json({ error: `Ticket em status ${ticket.status} não pode ser aprovado` }, { status: 409 })

    // Busca ativo disponível para reposição (mesmo vendor não prioritário — usa melhor vendor)
    let replacement = replacementAssetId
      ? await prisma.asset.findUnique({ where: { id: replacementAssetId, status: 'AVAILABLE' } })
      : await prisma.asset.findFirst({
          where:   { status: 'AVAILABLE', category: ticket.originalAsset.category, id: { not: ticket.originalAssetId } },
          orderBy: { vendor: { rating: 'desc' } }, // Prioriza fornecedor com maior rating
        })

    if (!replacement) return NextResponse.json({ error: 'Nenhum ativo disponível para reposição nesta categoria' }, { status: 409 })

    // Reserva o ativo de reposição
    await prisma.asset.update({ where: { id: replacement.id }, data: { status: 'SOLD' } })

    // Lança custo como perda operacional na memória da ALFREDO
    const replacementCost = Number(replacement.costPrice)
    const vendorCredit    = ticket.isVendorFault ? replacementCost : 0

    const updated = await prisma.rMATicket.update({
      where: { id: params.id },
      data:  {
        status: 'APPROVED',
        replacementAssetId: replacement.id,
        replacementCost,
        vendorCreditAmount: vendorCredit,
        approvedById:       session.user.id,
        approvedAt:         new Date(),
        notes: notes ?? ticket.notes,
      },
    })

    // Registra perda operacional na memória da IA
    await prisma.alfredoMemory.create({
      data: {
        type:    'INSIGHT',
        title:   `RMA Aprovado: ${ticket.ticketNumber}`,
        content: `Reposição aprovada. Custo: R$${replacementCost.toLocaleString('pt-BR')}. Crédito vs fornecedor ${ticket.vendor.name}: R$${vendorCredit.toLocaleString('pt-BR')}. Ativo de reposição: ${replacement.adsId}`,
        metadata: { ticketId: ticket.id, vendorId: ticket.vendorId, replacementCost, vendorCredit },
        userId: session.user.id,
      },
    }).catch(() => null)

    return NextResponse.json(updated)
  }

  // ── REJECT ───────────────────────────────────────────────────────────────────
  if (action === 'REJECT') {
    if (!isAdmin) return NextResponse.json({ error: 'Apenas ADMIN/PURCHASING pode rejeitar' }, { status: 403 })

    const updated = await prisma.rMATicket.update({
      where: { id: params.id },
      data:  { status: 'REJECTED', approvedById: session.user.id, approvedAt: new Date(), notes: notes ?? ticket.notes },
    })
    return NextResponse.json(updated)
  }

  // ── SEND REPLACEMENT ──────────────────────────────────────────────────────────
  if (action === 'SEND_REPLACEMENT') {
    if (ticket.status !== 'APPROVED') return NextResponse.json({ error: 'Ticket não está aprovado' }, { status: 409 })

    const updated = await prisma.rMATicket.update({
      where: { id: params.id },
      data:  { status: 'REPLACEMENT_SENT', resolvedAt: new Date(), notes: notes ?? ticket.notes },
    })
    return NextResponse.json(updated)
  }

  // ── CLOSE ────────────────────────────────────────────────────────────────────
  if (action === 'CLOSE') {
    if (ticket.status !== 'REPLACEMENT_SENT') return NextResponse.json({ error: 'Ticket não foi enviado ainda' }, { status: 409 })

    const updated = await prisma.rMATicket.update({
      where: { id: params.id },
      data:  { status: 'CLOSED', closedById: session.user.id, notes: notes ?? ticket.notes },
    })

    // Verificar taxa de RMA do fornecedor e disparar blacklist se necessário
    await checkVendorBlacklist(ticket.vendorId, session.user.id)

    return NextResponse.json(updated)
  }

  // ── CREDIT ───────────────────────────────────────────────────────────────────
  if (action === 'CREDIT') {
    if (!isAdmin) return NextResponse.json({ error: 'Apenas ADMIN pode emitir crédito' }, { status: 403 })
    if (!['CLOSED', 'REPLACEMENT_SENT'].includes(ticket.status))
      return NextResponse.json({ error: 'Ticket deve estar fechado para emitir crédito' }, { status: 409 })

    const updated = await prisma.rMATicket.update({
      where: { id: params.id },
      data:  { status: 'CREDITED', closedById: session.user.id },
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}

// ── Lógica de Blacklist Automática ──────────────────────────────────────────

async function checkVendorBlacklist(vendorId: string, adminId: string) {
  const vendor = await prisma.vendor.findUnique({
    where:  { id: vendorId },
    select: { name: true, suspended: true, assets: { select: { id: true } } },
  })
  if (!vendor || vendor.suspended) return

  const totalAssets = vendor.assets.length
  if (totalAssets === 0) return

  const totalRMA = await prisma.rMATicket.count({ where: { vendorId, isVendorFault: true } })
  const rmaRate  = totalRMA / totalAssets

  const BLACKLIST_THRESHOLD = 0.30 // 30% → suspensão automática
  const ALERT_THRESHOLD     = 0.10 // 10% → alerta

  if (rmaRate >= BLACKLIST_THRESHOLD) {
    // Suspensão automática
    await prisma.vendor.update({
      where: { id: vendorId },
      data:  {
        suspended:       true,
        suspendedReason: `Taxa de RMA: ${(rmaRate * 100).toFixed(1)}% (${totalRMA}/${totalAssets} ativos). Suspensão automática pela ALFREDO IA.`,
        suspendedAt:     new Date(),
      },
    })

    // Cria tarefa CRITICAL no CEO Command Center
    await prisma.ceoTask.create({
      data: {
        title:         `🚨 Fornecedor "${vendor.name}" SUSPENSO — RMA Rate ${(rmaRate * 100).toFixed(0)}%`,
        description:   `Taxa de reposição atingiu ${(rmaRate * 100).toFixed(1)}% (${totalRMA} de ${totalAssets} ativos). Pagamentos bloqueados automaticamente. Exige negociação de reposição integral antes de reativar.`,
        category:      'EFICIENCIA',
        impact:        10,
        urgency:       10,
        priorityScore: 30,
        priority:      'CRITICAL',
        autoGenerated: true,
        status:        'TODO',
        createdById:   adminId,
      },
    }).catch(() => null)

    await prisma.alfredoMemory.create({
      data: {
        type:    'INSIGHT',
        title:   `⛔ Blacklist Automática: ${vendor.name}`,
        content: `ALFREDO IA suspendeu o fornecedor ${vendor.name} automaticamente. Taxa de RMA: ${(rmaRate * 100).toFixed(1)}% (${totalRMA}/${totalAssets}). Pagamentos pendentes bloqueados.`,
        pinned:  true,
        userId:  adminId,
      },
    }).catch(() => null)
  } else if (rmaRate >= ALERT_THRESHOLD) {
    // Apenas alerta
    const alertExists = await prisma.alfredoMemory.findFirst({
      where: { title: { contains: `Alerta QA: ${vendor.name}` }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    })
    if (!alertExists) {
      await prisma.alfredoMemory.create({
        data: {
          type:    'INSIGHT',
          title:   `⚠️ Alerta QA: ${vendor.name}`,
          content: `CEO, o fornecedor ${vendor.name} está com taxa de RMA de ${(rmaRate * 100).toFixed(1)}% (${totalRMA}/${totalAssets} ativos). Recomendo auditoria antes de novos pedidos.`,
          pinned:  false,
          userId:  adminId,
        },
      }).catch(() => null)
    }
  }
}
