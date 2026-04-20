import { NextResponse } from 'next/server'
import { TrackerTrafficSourceStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  countActiveBlueprintSlots,
  defaultGoogleBlueprint,
  normalizeBlueprint,
  normalizeGlobalParams,
} from '@/lib/ads-tracker/traffic-source-types'

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const
const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

async function ensureGoogleAdsBuiltIn() {
  const exists = await prisma.trackerTrafficSource.findUnique({ where: { slug: 'google_ads' } })
  if (exists) return
  await prisma.trackerTrafficSource.create({
    data: {
      slug: 'google_ads',
      name: 'Google Ads',
      status: TrackerTrafficSourceStatus.ACTIVE,
      networkKind: 'google_ads',
      builtIn: true,
      paramBlueprint: defaultGoogleBlueprint() as object,
      globalParams: {},
    },
  })
}

function statusOk(s: string): s is TrackerTrafficSourceStatus {
  return s === 'ACTIVE' || s === 'PAUSED'
}

export async function GET() {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  await ensureGoogleAdsBuiltIn()

  const rows = await prisma.trackerTrafficSource.findMany({
    orderBy: [{ builtIn: 'desc' }, { name: 'asc' }],
    take: 100,
  })

  return NextResponse.json({
    sources: rows.map((r) => {
      const bp = normalizeBlueprint(r.paramBlueprint)
      const gp = normalizeGlobalParams(r.globalParams)
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        status: r.status,
        networkKind: r.networkKind,
        builtIn: r.builtIn,
        activeParamCount: countActiveBlueprintSlots(bp, gp),
        updatedAt: r.updatedAt.toISOString(),
      }
    }),
  })
}

export async function POST(req: Request) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  let body: {
    name?: string
    slug?: string
    networkKind?: string
    paramBlueprint?: unknown
    globalParams?: unknown
    status?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  if (!name) return NextResponse.json({ error: 'name obrigatório' }, { status: 400 })

  let slug =
    typeof body.slug === 'string' && body.slug.trim()
      ? body.slug.trim().toLowerCase().slice(0, 64)
      : name
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 64) || `fonte_${Date.now()}`

  if (!/^[a-z0-9_]{2,64}$/.test(slug)) {
    return NextResponse.json({ error: 'slug inválido (a-z, 0-9, _)' }, { status: 400 })
  }

  const clash = await prisma.trackerTrafficSource.findUnique({ where: { slug } })
  if (clash) return NextResponse.json({ error: 'slug já existe' }, { status: 400 })

  const networkKind =
    typeof body.networkKind === 'string' && body.networkKind.trim()
      ? body.networkKind.trim().slice(0, 32)
      : 'custom'

  const bp = normalizeBlueprint(body.paramBlueprint ?? defaultGoogleBlueprint())
  const gp = normalizeGlobalParams(body.globalParams)
  const status =
    body.status && statusOk(body.status) ? body.status : TrackerTrafficSourceStatus.ACTIVE

  const row = await prisma.trackerTrafficSource.create({
    data: {
      slug,
      name,
      networkKind,
      builtIn: false,
      status,
      paramBlueprint: bp as object,
      globalParams: gp as object,
    },
  })

  return NextResponse.json({ id: row.id })
}
