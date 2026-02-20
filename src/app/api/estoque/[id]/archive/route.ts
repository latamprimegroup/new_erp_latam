import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

/**
 * PATCH - Arquivar ou desarquivar conta
 * Body: { action: 'archive' | 'unarchive' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body.action === 'archive' ? 'archive' : body.action === 'unarchive' ? 'unarchive' : null

  if (!action) {
    return NextResponse.json(
      { error: 'Informe action: archive ou unarchive' },
      { status: 400 }
    )
  }

  const account = await prisma.stockAccount.findFirst({
    where: { id, deletedAt: null },
  })

  if (!account) {
    return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  }

  if (account.status === 'DELIVERED') {
    return NextResponse.json(
      { error: 'Conta já entregue não pode ser arquivada' },
      { status: 400 }
    )
  }

  const updated = await prisma.stockAccount.update({
    where: { id },
    data: {
      archivedAt: action === 'archive' ? new Date() : null,
    },
  })

  await audit({
    userId: auth.session.user!.id,
    action: action === 'archive' ? 'stock_account_archived' : 'stock_account_unarchived',
    entity: 'StockAccount',
    entityId: id,
    details: { platform: account.platform, type: account.type },
  })

  return NextResponse.json(updated)
}
