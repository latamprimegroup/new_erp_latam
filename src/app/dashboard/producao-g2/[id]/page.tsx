import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ProductionG2DetailClient } from './ProductionG2DetailClient'

export default async function ProductionG2DetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const roles = ['ADMIN', 'PRODUCER', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    redirect('/dashboard')
  }

  const { id } = await params
  const item = await prisma.productionG2.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      client: { include: { user: { select: { name: true } } } },
      deliveryGroup: { select: { id: true, groupNumber: true } },
      credentials: true,
      emailConsumed: { select: { id: true, email: true } },
      cnpjConsumed: { select: { id: true, cnpj: true } },
      paymentProfileConsumed: { select: { id: true, type: true, gateway: true } },
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })

  if (!item) notFound()

  const maskedCredentials = item.credentials
    ? {
        ...item.credentials,
        passwordEncrypted: item.credentials.passwordEncrypted ? '••••••••' : null,
        twoFaSecret: item.credentials.twoFaSecret ? '••••••••' : null,
        twoFaSms: item.credentials.twoFaSms ? '••••••••' : null,
      }
    : null

  return (
    <ProductionG2DetailClient
      item={{
        ...item,
        credentials: maskedCredentials,
      }}
      sessionUserId={session.user.id}
      canApprove={session.user.role === 'ADMIN' || session.user.role === 'FINANCE'}
    />
  )
}
