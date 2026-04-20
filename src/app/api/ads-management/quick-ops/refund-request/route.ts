import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { listMccLinkedClients } from '@/lib/google-ads-mcc'

const bodySchema = z.object({
  googleCustomerId: z.string().min(5),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'googleCustomerId obrigatório' }, { status: 400 })
  }

  const gid = parsed.data.googleCustomerId.replace(/\D/g, '')
  const linked = await listMccLinkedClients()
  if (!linked) {
    return NextResponse.json({ error: 'Não foi possível validar contas no MCC.' }, { status: 502 })
  }

  const row = linked.find((c) => c.googleCustomerId.replace(/\D/g, '') === gid)
  if (!row) {
    return NextResponse.json({ error: 'Conta não pertence ao MCC.' }, { status: 403 })
  }

  if (row.statusLabel !== 'SUSPENDED') {
    return NextResponse.json(
      { error: 'Reembolso solicitável apenas para contas suspensas no Google.' },
      { status: 400 }
    )
  }

  try {
    const created = await prisma.adsRefundRequest.create({
      data: {
        googleCustomerId: gid,
        requestedById: auth.session.user.id,
        notes: parsed.data.notes ?? null,
        status: 'PENDING',
      },
    })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (e) {
    console.error('ads refund request:', e)
    return NextResponse.json(
      { error: 'Falha ao registrar pedido. Execute a migração SQL manual se ainda não aplicou.' },
      { status: 500 }
    )
  }
}
