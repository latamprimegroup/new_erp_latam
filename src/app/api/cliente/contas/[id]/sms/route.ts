/**
 * GET - Listar número alugado e SMS recebidos para uma conta do cliente
 * Cliente só vê contas entregues a ele
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
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
    where: { stockAccountId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      smsInbox: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  })

  if (!rented) {
    return NextResponse.json({
      rentedPhone: null,
      sms: [],
    })
  }

  return NextResponse.json({
    rentedPhone: {
      id: rented.id,
      phoneNumber: rented.phoneNumber,
      status: rented.status,
      expiresAt: rented.expiresAt,
    },
    sms: rented.smsInbox.map((s) => ({
      id: s.id,
      body: s.body,
      code: s.code,
      receivedAt: s.receivedAt,
      createdAt: s.createdAt,
    })),
  })
}
