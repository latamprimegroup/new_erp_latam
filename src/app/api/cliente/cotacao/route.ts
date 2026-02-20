import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  accountId: z.string().min(1),
  message: z.string().optional(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const { accountId, message } = schema.parse(body)

    const account = await prisma.stockAccount.findUnique({
      where: { id: accountId },
    })
    if (!account || account.status !== 'AVAILABLE') {
      return NextResponse.json({ error: 'Conta não disponível' }, { status: 400 })
    }

    const quotation = await prisma.quotation.create({
      data: {
        clientId: client.id,
        accountId,
        status: 'pending',
        message: message || null,
      },
    })

    const user = await prisma.user.findUnique({ where: { id: session.user!.id }, select: { email: true } })
    const whatsappMsg = `Olá, meu login na plataforma AdsAtivos é ${user?.email || ''}, gostaria de um orçamento:\nID da conta: ${accountId.slice(0, 12)} | Ano: ${account.yearStarted || 'N/A'} | Consumo: R$ ${account.minConsumed ? Number(account.minConsumed).toLocaleString('pt-BR') : 'N/A'}`

    return NextResponse.json({
      quotation,
      whatsappMessage: whatsappMsg,
      whatsappUrl: `https://wa.me/5511999999999?text=${encodeURIComponent(whatsappMsg)}`,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao solicitar cotação' }, { status: 500 })
  }
}
