/**
 * GET  /api/admin/listings — Lista todos os product listings
 * POST /api/admin/listings — Cria novo listing (gera link de venda rápida)
 */
import { NextResponse }    from 'next/server'
import { z }               from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (!['ADMIN', 'CEO'].includes(session.user.role ?? '')) return null
  return session.user
}

const createSchema = z.object({
  title:         z.string().min(2).max(200),
  subtitle:      z.string().max(500).optional(),
  assetCategory: z.string().min(1).max(50),
  assetTags:     z.string().max(200).optional(),
  pricePerUnit:  z.number().positive(),
  maxQty:        z.number().int().min(1).max(100).default(10),
  badge:         z.string().max(100).optional(),
  active:        z.boolean().default(true),
})

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const listings = await prisma.productListing.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { checkouts: true } },
    },
  })

  // Conta disponíveis por categoria
  const enriched = await Promise.all(
    listings.map(async (l) => {
      const available = await prisma.asset.count({
        where: { category: l.assetCategory as never, status: 'AVAILABLE' },
      })
      const paidCheckouts = await prisma.quickSaleCheckout.count({
        where: { listingId: l.id, status: 'PAID' },
      })
      const revenue = await prisma.quickSaleCheckout.aggregate({
        where:  { listingId: l.id, status: 'PAID' },
        _sum:   { totalAmount: true },
      })
      return {
        id:           l.id,
        slug:         l.slug,
        title:        l.title,
        subtitle:     l.subtitle,
        badge:        l.badge,
        assetCategory:l.assetCategory,
        pricePerUnit: Number(l.pricePerUnit),
        maxQty:       l.maxQty,
        active:       l.active,
        available,
        totalCheckouts: l._count.checkouts,
        paidCheckouts,
        revenue:      Number(revenue._sum.totalAmount ?? 0),
        createdAt:    l.createdAt,
      }
    }),
  )

  return NextResponse.json(enriched)
}

// ─── POST ─────────────────────────────────────────────────────────────────────

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export async function POST(req: globalThis.Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const d = parsed.data

  // Gera slug único
  let baseSlug = slugify(d.title)
  let slug     = baseSlug
  let attempt  = 1
  while (await prisma.productListing.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${attempt++}`
  }

  const listing = await prisma.productListing.create({
    data: {
      slug,
      title:         d.title,
      subtitle:      d.subtitle ?? null,
      assetCategory: d.assetCategory,
      assetTags:     d.assetTags ?? null,
      pricePerUnit:  d.pricePerUnit,
      maxQty:        d.maxQty,
      badge:         d.badge ?? 'ENTREGA AUTOMÁTICA',
      active:        d.active,
      createdBy:     user.id,
    },
  })

  return NextResponse.json({ ...listing, slug }, { status: 201 })
}
