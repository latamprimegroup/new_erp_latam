/**
 * GET /api/vendas/ativos/orders/[id]/credentials
 * Liberação SEGURA das credenciais do ativo.
 *
 * Regra de negócio (Gargalo de Liberação):
 *   - Só retorna rawData quando status = VENDOR_PAID | DELIVERING | DELIVERED
 *   - Apenas DELIVERER e ADMIN têm acesso
 *   - Grava log de acesso toda vez que as credenciais são consultadas
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES    = ['ADMIN', 'DELIVERER']
const ALLOWED_STATUSES = ['VENDOR_PAID', 'DELIVERING', 'DELIVERED']

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão — apenas Entrega e Admin' }, { status: 403 })

  const order = await prisma.assetSalesOrder.findUnique({
    where:   { id: params.id },
    include: {
      asset:  { select: { id: true, adsId: true, displayName: true, rawData: true, status: true } },
      seller: { select: { name: true, email: true } },
    },
  })

  if (!order) return NextResponse.json({ error: 'OS não encontrada' }, { status: 404 })

  if (!ALLOWED_STATUSES.includes(order.status))
    return NextResponse.json({
      error: `Credenciais bloqueadas — status atual: ${order.status}. Disponível após: VENDOR_PAID.`,
      currentStatus: order.status,
    }, { status: 403 })

  if (!order.asset.rawData)
    return NextResponse.json({ error: 'Nenhuma credencial armazenada para este ativo' }, { status: 404 })

  // Registra acesso às credenciais no audit log
  await prisma.auditLog.create({
    data: {
      userId:   session.user.id,
      action:   'credential_access',
      entity:   'AssetSalesOrder',
      entityId: params.id,
      details:  { assetId: order.asset.id, adsId: order.asset.adsId, role: session.user.role },
    },
  })

  return NextResponse.json({
    orderId:     params.id,
    adsId:       order.asset.adsId,
    displayName: order.asset.displayName,
    credentials: order.asset.rawData,
    accessedAt:  new Date().toISOString(),
    accessedBy:  session.user.email,
    warning:     '⚠️ CONFIDENCIAL — Não compartilhe fora do sistema.',
  })
}
