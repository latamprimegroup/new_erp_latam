import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  try {
    const body = await req.json()
    const { reconciled } = body
    if (typeof reconciled !== 'boolean') {
      return NextResponse.json({ error: 'reconciled deve ser boolean' }, { status: 400 })
    }

    const entry = await prisma.financialEntry.findUnique({ where: { id } })
    if (!entry) return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 })

    const updated = await prisma.financialEntry.update({
      where: { id },
      data: { reconciled },
    })

    await audit({
      userId: session.user.id,
      action: 'financial_entry_reconciled',
      entity: 'FinancialEntry',
      entityId: id,
      details: { reconciled },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
