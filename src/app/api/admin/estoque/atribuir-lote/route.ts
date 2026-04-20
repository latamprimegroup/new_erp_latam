import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { reserveEmail, reserveCnpj, reservePaymentProfile } from '@/lib/stock-assignment'

const bodySchema = z.object({
  producerId: z.string().min(1),
  emailIds: z.array(z.string()).optional(),
  cnpjIds: z.array(z.string()).optional(),
  paymentProfileIds: z.array(z.string()).optional(),
})

/**
 * Atribuição nominal em lote: disponível → reservado para um produtor (gerente de estoque).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const json = await req.json()
    const data = bodySchema.parse(json)
    const { producerId } = data
    const producer = await prisma.user.findFirst({
      where: { id: producerId, role: 'PRODUCER' },
    })
    if (!producer) {
      return NextResponse.json({ error: 'Produtor não encontrado' }, { status: 400 })
    }

    const emailIds = data.emailIds ?? []
    const cnpjIds = data.cnpjIds ?? []
    const paymentProfileIds = data.paymentProfileIds ?? []
    if (emailIds.length + cnpjIds.length + paymentProfileIds.length === 0) {
      return NextResponse.json({ error: 'Informe ao menos um item (e-mails, CNPJs ou perfis)' }, { status: 400 })
    }

    const errors: { id: string; error: string }[] = []
    let ok = 0

    for (const id of emailIds) {
      const r = await reserveEmail(id, producerId)
      if (r.ok) ok++
      else errors.push({ id, error: r.error || 'falha' })
    }
    for (const id of cnpjIds) {
      const r = await reserveCnpj(id, producerId)
      if (r.ok) ok++
      else errors.push({ id, error: r.error || 'falha' })
    }
    for (const id of paymentProfileIds) {
      const r = await reservePaymentProfile(id, producerId)
      if (r.ok) ok++
      else errors.push({ id, error: r.error || 'falha' })
    }

    await audit({
      userId: session.user.id,
      action: 'stock_batch_assign',
      entity: 'StockBatch',
      details: { producerId, ok, failed: errors.length, emailIds, cnpjIds, paymentProfileIds },
    })

    return NextResponse.json({
      ok: true,
      assigned: ok,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atribuir lote' }, { status: 500 })
  }
}
