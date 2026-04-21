/**
 * PATCH /api/financeiro/comissoes/[id]
 * Liquida (paga) uma comissão — muda entryStatus para PAID e registra paymentDate.
 * Apenas ADMIN ou FINANCE.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { financeAudit } from '@/lib/finance-audit'

const ALLOWED = ['ADMIN', 'FINANCE']

const patchSchema = z.object({
  paymentDate:   z.string().datetime().optional(),
  paymentMethod: z.string().optional(),
  walletId:      z.string().optional(),
  notes:         z.string().max(500).optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const entry = await prisma.financialEntry.findUnique({ where: { id: params.id } })
  if (!entry) return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 })
  if (entry.category !== 'COMISSOES_VENDEDORES')
    return NextResponse.json({ error: 'Este lançamento não é uma comissão' }, { status: 400 })
  if (entry.entryStatus === 'PAID')
    return NextResponse.json({ error: 'Comissão já liquidada' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const parsed = patchSchema.safeParse(body)
  const data   = parsed.success ? parsed.data : {}

  const updated = await prisma.financialEntry.update({
    where: { id: params.id },
    data: {
      entryStatus:   'PAID',
      paymentDate:   data.paymentDate ? new Date(data.paymentDate) : new Date(),
      paymentMethod: (data.paymentMethod as import('@prisma/client').FinPaymentMethod | null | undefined) ?? undefined,
      walletId:      data.walletId ?? undefined,
      description:   data.notes
        ? `${entry.description ?? ''} | Liquidado: ${data.notes}`
        : entry.description ?? undefined,
      reconciled: true,
    },
  })

  await financeAudit(req, {
    userId:   session.user.id,
    action:   'baixa_titulo',
    entity:   'FinancialEntry',
    entityId: params.id,
    details:  { previousStatus: entry.entryStatus, value: Number(entry.value), by: session.user.email },
  })

  return NextResponse.json(updated)
}
