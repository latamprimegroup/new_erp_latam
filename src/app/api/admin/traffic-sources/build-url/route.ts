import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildTrackingUrl } from '@/lib/ads-tracker/build-tracking-url'
import { attributionKindLabel } from '@/lib/ads-tracker/traffic-query-classify'
import { normalizeBlueprint, normalizeGlobalParams } from '@/lib/ads-tracker/traffic-source-types'

const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

/**
 * Gera URL de rastreamento e validações. Aceita rascunho (useDraft) para pré-visualização sem gravar.
 */
export async function POST(req: Request) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  let body: {
    baseUrl?: string
    sourceId?: string
    useDraft?: boolean
    draftBlueprint?: unknown
    draftGlobalParams?: unknown
    overrides?: Record<string, string>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
  if (!baseUrl) return NextResponse.json({ error: 'baseUrl obrigatório' }, { status: 400 })

  let blueprint = normalizeBlueprint(null)
  let globalParams: Record<string, string> = {}

  if (body.useDraft) {
    blueprint = normalizeBlueprint(body.draftBlueprint)
    globalParams = normalizeGlobalParams(body.draftGlobalParams)
  } else {
    const sid = typeof body.sourceId === 'string' ? body.sourceId.trim() : ''
    if (!sid) return NextResponse.json({ error: 'sourceId obrigatório (ou useDraft=true)' }, { status: 400 })
    const row = await prisma.trackerTrafficSource.findUnique({ where: { id: sid } })
    if (!row) return NextResponse.json({ error: 'Fonte não encontrada' }, { status: 404 })
    blueprint = normalizeBlueprint(row.paramBlueprint)
    globalParams = normalizeGlobalParams(row.globalParams)
  }

  const overrides =
    body.overrides && typeof body.overrides === 'object' && !Array.isArray(body.overrides)
      ? (body.overrides as Record<string, string>)
      : {}

  const r = buildTrackingUrl(baseUrl, blueprint, globalParams, overrides)

  return NextResponse.json({
    url: r.url,
    warnings: r.warnings,
    length: r.length,
    attributionPreview: r.attributionPreview,
    attributionLabel: attributionKindLabel(r.attributionPreview),
  })
}
