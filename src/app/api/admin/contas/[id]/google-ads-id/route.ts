import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  googleAdsCustomerId: z.string().refine(
    (v) => /^\d{10}$|^\d{3}-\d{3}-\d{4}$/.test(v),
    { message: 'Formato: 1234567890 ou 123-456-7890' }
  ),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  try {
    const body = await req.json()
    const { googleAdsCustomerId } = schema.parse(body)
    const normalized = googleAdsCustomerId.replace(/-/g, '')

    const account = await prisma.stockAccount.update({
      where: { id },
      data: {
        googleAdsCustomerId: normalized.length === 10 ? `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}` : googleAdsCustomerId,
      },
    })

    return NextResponse.json(account)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
