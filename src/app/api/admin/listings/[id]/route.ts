/**
 * PATCH /api/admin/listings/[id] — Atualiza listing (ativar/pausar, preço, etc.)
 * DELETE /api/admin/listings/[id] — Remove listing
 */
import { NextResponse }    from 'next/server'
import { z }               from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['ADMIN', 'CEO'].includes(session.user.role ?? '')) return null
  return session.user
}

const patchSchema = z.object({
  title:        z.string().min(2).max(200).optional(),
  subtitle:     z.string().max(500).nullable().optional(),
  pricePerUnit: z.number().positive().optional(),
  maxQty:       z.number().int().min(1).max(100).optional(),
  badge:        z.string().max(100).nullable().optional(),
  active:       z.boolean().optional(),
})

export async function PATCH(
  req: globalThis.Request,
  { params }: { params: { id: string } },
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const listing = await prisma.productListing.update({
    where: { id: params.id },
    data:  parsed.data,
  }).catch(() => null)

  if (!listing) return NextResponse.json({ error: 'Listing não encontrado' }, { status: 404 })
  return NextResponse.json(listing)
}

export async function DELETE(
  _req: globalThis.Request,
  { params }: { params: { id: string } },
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const listing = await prisma.productListing.delete({
    where: { id: params.id },
  }).catch(() => null)

  if (!listing) return NextResponse.json({ error: 'Listing não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
