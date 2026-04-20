import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildProductionFooterText } from '@/lib/production-footer'

const ROLES = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER']

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const account = await prisma.productionAccount.findFirst({
    where: { id, deletedAt: null },
    include: {
      cnpjConsumed: { select: { cnpj: true, razaoSocial: true, nomeFantasia: true } },
      emailConsumed: { select: { email: true } },
    },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  if (session.user.role === 'PRODUCER' && account.producerId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const text = buildProductionFooterText(account)
  return NextResponse.json({ text })
}
