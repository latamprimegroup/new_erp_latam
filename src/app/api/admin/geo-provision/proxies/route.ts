import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { encrypt } from '@/lib/encryption'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  provider: z.string().min(1).max(32),
  label: z.string().max(120).optional(),
  city: z.string().max(120).optional().nullable(),
  stateUf: z.string().max(4).optional().nullable(),
  ddd: z.string().max(3).optional().nullable(),
  proxyHost: z.string().min(1).max(255),
  proxyPort: z.string().min(1).max(8),
  proxyUser: z.string().max(200).optional().nullable(),
  proxyPassword: z.string().max(500).optional().nullable(),
  proxySoft: z.string().max(32).optional().nullable(),
  active: z.boolean().optional(),
})

/**
 * GET — Pool de proxies (sem senha).
 * POST — Nova entrada (senha cifrada).
 */
export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const rows = await prisma.geoProxyPoolEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  return NextResponse.json({
    proxies: rows.map((p) => ({
      id: p.id,
      provider: p.provider,
      label: p.label,
      city: p.city,
      stateUf: p.stateUf,
      ddd: p.ddd,
      proxyHost: p.proxyHost,
      proxyPort: p.proxyPort,
      proxyUser: p.proxyUser,
      hasPassword: !!p.proxyPasswordEnc,
      proxySoft: p.proxySoft,
      active: p.active,
    })),
  })
}

export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  try {
    const data = createSchema.parse(await req.json())
    const row = await prisma.geoProxyPoolEntry.create({
      data: {
        provider: data.provider,
        label: data.label ?? null,
        city: data.city ?? null,
        stateUf: data.stateUf?.toUpperCase().slice(0, 4) ?? null,
        ddd: data.ddd?.replace(/\D/g, '').slice(0, 3) || null,
        proxyHost: data.proxyHost,
        proxyPort: data.proxyPort,
        proxyUser: data.proxyUser ?? null,
        proxyPasswordEnc: data.proxyPassword?.trim() ? encrypt(data.proxyPassword.trim()) : null,
        proxySoft: data.proxySoft ?? 'other',
        active: data.active ?? true,
      },
    })
    return NextResponse.json({ ok: true, id: row.id })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
