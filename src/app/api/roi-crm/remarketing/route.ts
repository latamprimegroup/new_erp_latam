import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'COMMERCIAL', 'FINANCE']

const MSG =
  'Olá! Notamos que faz um tempo desde seu último fechamento na Ads Ativos. Podemos ajudar com novas contas ou suporte?'

/**
 * Clientes sem compra recente (30d+) para disparo manual de WhatsApp / e-mail.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  const clients = await prisma.clientProfile.findMany({
    where: {
      roiCrmStatus: { not: 'INATIVO' },
      OR: [
        { lastPurchaseAt: { not: null, lt: cutoff } },
        {
          AND: [{ lastPurchaseAt: null }, { user: { createdAt: { lt: cutoff } } }],
        },
      ],
    },
    take: 100,
    orderBy: [{ lastPurchaseAt: 'asc' }, { user: { createdAt: 'asc' } }],
    include: {
      user: { select: { name: true, email: true } },
    },
  })

  const items = clients.map((c) => {
    const digits = (c.whatsapp || '').replace(/\D/g, '')
    const wa =
      digits.length >= 10
        ? `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}?text=${encodeURIComponent(MSG)}`
        : null
    const mailto = c.user.email
      ? `mailto:${c.user.email}?subject=${encodeURIComponent('Ads Ativos — retomada')}&body=${encodeURIComponent(MSG)}`
      : null
    return {
      clientId: c.id,
      nome: c.user.name || c.user.email || 'Cliente',
      email: c.user.email,
      whatsapp: c.whatsapp,
      ultimaCompra: c.lastPurchaseAt?.toISOString() ?? null,
      waUrl: wa,
      mailtoUrl: mailto,
    }
  })

  return NextResponse.json({ message: MSG, items }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
