import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postWalletDeposit } from '@/lib/vault-wallet'
import { audit } from '@/lib/audit'

const ROLES = ['ADMIN', 'FINANCE'] as const

const schema = z.object({
  clientId: z.string().min(1),
  amount: z.number().positive(),
  memo: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = schema.parse(await req.json())
    const client = await prisma.clientProfile.findUnique({ where: { id: body.clientId } })
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const row = await postWalletDeposit(body.clientId, body.amount, body.memo ?? null)
    await audit({
      userId: session.user.id,
      action: 'vault_wallet_deposit',
      entity: 'ClientWalletLedger',
      entityId: row.id,
      details: { clientId: body.clientId, amount: body.amount },
    })
    return NextResponse.json({
      id: row.id,
      balanceAfter: row.balanceAfter.toString(),
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : 'Erro'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
