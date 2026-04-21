/**
 * PATCH /api/compras/fornecedores/[id] — Atualiza fornecedor
 * DELETE /api/compras/fornecedores/[id] — Arquiva (active = false)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMPRAS_WRITE_ROLES } from '@/lib/asset-privacy'

const patchSchema = z.object({
  name:         z.string().min(2).max(200).optional(),
  taxId:        z.string().max(30).optional(),
  contactInfo:  z.record(z.string()).optional(),
  rating:       z.number().int().min(1).max(10).optional(),
  paymentTerms: z.string().max(200).optional(),
  category:     z.string().max(50).optional(),
  notes:        z.string().max(2000).optional(),
  active:       z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !COMPRAS_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const vendor = await prisma.vendor.update({
    where: { id: params.id },
    data:  parsed.data,
  })
  return NextResponse.json(vendor)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !COMPRAS_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  await prisma.vendor.update({ where: { id: params.id }, data: { active: false } })
  return NextResponse.json({ ok: true })
}
