import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'FINANCE']

const patchSchema = z.object({
  nfeStatus:   z.enum(['PENDENTE', 'EMITIDA', 'CANCELADA', 'ERRO']).optional(),
  nfeNumber:   z.string().max(50).optional().nullable(),
  series:      z.string().max(5).optional().nullable(),
  issueDate:   z.string().datetime().optional().nullable(),
  totalAmount: z.number().positive().optional().nullable(),
  serviceDesc: z.string().max(500).optional().nullable(),
  clientCnpj:  z.string().max(20).optional().nullable(),
  clientName:  z.string().max(200).optional().nullable(),
  externalId:  z.string().max(100).optional().nullable(),
  pdfUrl:      z.string().url().max(2000).optional().nullable(),
  xmlUrl:      z.string().url().max(2000).optional().nullable(),
  notes:       z.string().max(500).optional().nullable(),
  walletId:    z.string().optional().nullable(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { issueDate, ...rest } = parsed.data
  const updated = await prisma.finNfe.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(issueDate !== undefined ? { issueDate: issueDate ? new Date(issueDate) : null } : {}),
    },
  })
  return NextResponse.json(updated)
}
