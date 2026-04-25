/**
 * GET  /api/admin/product-listings — Lista todos os ProductListings
 * POST /api/admin/product-listings — Cria um novo ProductListing
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

const listingSchema = z.object({
  slug:               z.string().min(3).max(100),
  title:              z.string().min(2).max(200),
  subtitle:           z.string().max(500).optional().nullable(),
  assetCategory:      z.string().min(1).max(50),
  assetTags:          z.string().max(200).optional().nullable(),
  pricePerUnit:       z.number().positive(),
  maxQty:             z.number().int().positive().default(10),
  warrantyDays:       z.number().int().positive().default(7),
  destinationProfile: z.string().optional().nullable(),
  badge:              z.string().max(100).optional().nullable(),
  active:             z.boolean().default(true),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const listings = await prisma.productListing.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { checkouts: true } },
    },
  })

  const result = listings.map((l) => ({
    id:                 l.id,
    slug:               l.slug,
    title:              l.title,
    subtitle:           l.subtitle,
    assetCategory:      l.assetCategory,
    assetTags:          l.assetTags,
    pricePerUnit:       Number(l.pricePerUnit),
    maxQty:             l.maxQty,
    warrantyDays:       l.warrantyDays,
    destinationProfile: l.destinationProfile,
    badge:              l.badge,
    active:             l.active,
    createdAt:          l.createdAt,
    checkoutsCount:     l._count.checkouts,
  }))

  return NextResponse.json(result)
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const parsed = listingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
  }

  const { destinationProfile, ...rest } = parsed.data

  const listing = await prisma.productListing.create({
    data: {
      ...rest,
      destinationProfile: (destinationProfile as ClientProfileType | null) ?? null,
      createdBy: (session?.user as { id?: string } | undefined)?.id,
    },
  })

  return NextResponse.json({ ok: true, id: listing.id, slug: listing.slug }, { status: 201 })
}
