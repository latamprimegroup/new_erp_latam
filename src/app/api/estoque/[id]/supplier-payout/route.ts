import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'

const ROLES = ['ADMIN', 'FINANCE']

/**
 * Após venda (DELIVERED): custo ao fornecedor + PIX descriptografado — uso interno Admin/Financeiro.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await ctx.params

  const acc = await prisma.stockAccount.findFirst({
    where: { id, deletedAt: null },
    include: {
      supplier: { select: { id: true, name: true, pixKeyEncrypted: true } },
    },
  })

  if (!acc) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (acc.status !== 'DELIVERED') {
    return NextResponse.json(
      { error: 'Disponível apenas para contas vendidas (DELIVERED).' },
      { status: 400 }
    )
  }

  const pixKey = acc.supplier?.pixKeyEncrypted ? decrypt(acc.supplier.pixKeyEncrypted) : null

  return NextResponse.json({
    accountId: acc.id,
    supplierId: acc.supplierId,
    supplierName: acc.supplier?.name ?? null,
    purchasePriceBrl: acc.purchasePrice != null ? Number(acc.purchasePrice) : null,
    pixKey,
    note: 'Valor a pagar ao fornecedor = custo de aquisição (purchasePrice). Conferir contrato antes do PIX.',
  })
}
