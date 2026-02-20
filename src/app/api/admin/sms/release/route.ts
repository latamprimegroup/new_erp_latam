/**
 * POST - Liberar número alugado (marca como RELEASED e cancela no provedor)
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { releasePhoneNumber } from '@/lib/sms'

const schema = z.object({
  rentedPhoneId: z.string().cuid(),
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const { rentedPhoneId } = schema.parse(body)

    const rented = await prisma.rentedPhoneNumber.findUnique({
      where: { id: rentedPhoneId },
    })
    if (!rented) {
      return NextResponse.json({ error: 'Número não encontrado' }, { status: 404 })
    }
    if (rented.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Número já está inativo' },
        { status: 400 }
      )
    }

    if (rented.providerOrderId) {
      await releasePhoneNumber(rented.providerOrderId)
    }

    await prisma.rentedPhoneNumber.update({
      where: { id: rentedPhoneId },
      data: { status: 'RELEASED' },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error('SMS release error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao liberar número' },
      { status: 500 }
    )
  }
}
