/**
 * GET — diagnóstico de saldo (Inter) + elegibilidade VIP para reposição automática.
 * Financeiro / Admin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verificarGarantiaEReposicaoVip } from '@/lib/garantia-reposicao-vip'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const clientId = req.nextUrl.searchParams.get('clientId')
  const quantityRaw = req.nextUrl.searchParams.get('quantity')
  const quantity = quantityRaw ? Math.max(1, parseInt(quantityRaw, 10) || 1) : 1

  if (!clientId?.trim()) {
    return NextResponse.json({ error: 'Query clientId obrigatório' }, { status: 400 })
  }

  const exists = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { id: true },
  })
  if (!exists) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const verificacao = await verificarGarantiaEReposicaoVip(prisma, clientId, { quantity })
  return NextResponse.json(verificacao)
}
