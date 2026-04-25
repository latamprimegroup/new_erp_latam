/**
 * PATCH /api/admin/product-listings/[id] — Atualiza um ProductListing
 * DELETE /api/admin/product-listings/[id] — Desativa (soft-delete)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { ClientProfileType } from '@prisma/client'

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session?.user as { role?: string } | undefined)?.role
  return role === 'ADMIN' || role === 'COMMERCIAL'
}

const patchSchema = z.object({
  title:              z.string().min(2).max(200).optional(),
  subtitle:           z.string().max(500).optional().nullable(),
  assetCategory:      z.string().min(1).max(50).optional(),
  assetTags:          z.string().max(200).optional().nullable(),
  pricePerUnit:       z.number().positive().optional(),
  maxQty:             z.number().int().positive().optional(),
  warrantyDays:       z.number().int().positive().optional(),
  destinationProfile: z.string().optional().nullable(),
  badge:              z.string().max(100).optional().nullable(),
  active:             z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
  }

  const { destinationProfile, ...rest } = parsed.data

  const updated = await prisma.productListing.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(destinationProfile !== undefined
        ? { destinationProfile: (destinationProfile as ClientProfileType | null) }
        : {}),
    },
  }).catch(() => null)

  if (!updated) return NextResponse.json({ error: 'Listing não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  await prisma.productListing.update({
    where: { id: params.id },
    data:  { active: false },
  }).catch(() => null)

  return NextResponse.json({ ok: true })
}
