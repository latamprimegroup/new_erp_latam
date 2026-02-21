import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncAccountSpend, isGoogleAdsConfigured } from '@/lib/google-ads'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { id } = await params
  const account = await prisma.stockAccount.findFirst({
    where: { id, clientId: client.id },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (!account.googleAdsCustomerId) {
    return NextResponse.json(
      { error: 'Esta conta ainda não tem Customer ID do Google Ads vinculado' },
      { status: 400 }
    )
  }

  if (!isGoogleAdsConfigured()) {
    return NextResponse.json(
      { error: 'Integração Google Ads não configurada. Contate o suporte.' },
      { status: 503 }
    )
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const ok = await syncAccountSpend(
    account.id,
    account.googleAdsCustomerId,
    startOfMonth,
    endOfMonth
  )

  if (!ok) {
    return NextResponse.json(
      { error: 'Não foi possível sincronizar. Verifique o Customer ID e tente novamente.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
