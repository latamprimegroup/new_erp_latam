/**
 * POST - Buscar novos SMS no provedor (5sim) e salvar no banco
 * Permite ao cliente atualizar a lista quando o Google enviar validação
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkSmsForOrder } from '@/lib/sms'

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

  const rented = await prisma.rentedPhoneNumber.findFirst({
    where: { stockAccountId: id, status: 'ACTIVE' },
  })
  if (!rented?.providerOrderId) {
    return NextResponse.json(
      { error: 'Esta conta não possui número alugado ativo' },
      { status: 400 }
    )
  }

  const sms = await checkSmsForOrder(rented.providerOrderId)
  if (!sms) {
    return NextResponse.json({ success: true, newSms: false })
  }

  const existing = await prisma.smsInbox.findFirst({
    where: { rentedPhoneId: rented.id, body: sms.body },
  })
  if (existing) {
    return NextResponse.json({ success: true, newSms: false })
  }

  await prisma.smsInbox.create({
    data: {
      rentedPhoneId: rented.id,
      sender: sms.sender,
      body: sms.body,
      code: sms.code,
      receivedAt: sms.receivedAt ?? new Date(),
    },
  })

  return NextResponse.json({
    success: true,
    newSms: true,
    code: sms.code,
  })
}
