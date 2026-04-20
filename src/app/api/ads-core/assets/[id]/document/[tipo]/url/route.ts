import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { ADS_CORE_DOC_TYPES, type AdsCoreDocType } from '@/lib/ads-core-utils'
import { adsCoreDocRelPath } from '@/lib/ads-core-document-paths'
import {
  adsCoreGetPresignedReadUrl,
  adsCoreSignedUrlTtlSec,
  getAdsCoreStorageMode,
} from '@/lib/ads-core-document-storage'
import { mintAdsCoreDocumentViewToken } from '@/lib/ads-core-doc-token'
import { resolveAppOrigin } from '@/lib/ads-core-request-origin'
import { touchAdsCoreEmProducaoOnOpen } from '@/lib/ads-core-producer-touch'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

function canRead(role: string | undefined, userId: string, asset: { producerId: string | null }) {
  if (isGerente(role)) return true
  if (role === 'PRODUCER' && asset.producerId === userId) return true
  return false
}

/**
 * Emite URL temporária para visualização: presigned S3/GCS ou token assinado (filesystem).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; tipo: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { id, tipo } = await params
  if (!ADS_CORE_DOC_TYPES.includes(tipo as AdsCoreDocType)) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }

  const asset = await prisma.adsCoreAsset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })
  if (!canRead(auth.session.user.role, auth.session.user.id, asset)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const rel = adsCoreDocRelPath(asset, tipo as AdsCoreDocType)
  if (!rel) return NextResponse.json({ error: 'Documento não enviado' }, { status: 404 })

  const h = await headers()
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined

  await touchAdsCoreEmProducaoOnOpen(prisma, {
    assetId: id,
    userId: auth.session.user.id,
    role: auth.session.user.role,
    ip,
  })

  const ttl = adsCoreSignedUrlTtlSec()
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()

  const presigned = await adsCoreGetPresignedReadUrl(rel, ttl)
  let url: string
  if (presigned) {
    url = presigned
  } else {
    const expSec = Math.floor(Date.now() / 1000) + ttl
    const token = mintAdsCoreDocumentViewToken({
      assetId: id,
      tipo,
      userId: auth.session.user.id,
      expiresAtSec: expSec,
    })
    const origin = resolveAppOrigin(req)
    url = `${origin}/api/ads-core/assets/${id}/document/${tipo}?st=${encodeURIComponent(token)}`
  }

  await audit({
    userId: auth.session.user.id,
    action: 'ads_core_signed_url_issued',
    entity: 'AdsCoreAsset',
    entityId: id,
    details: {
      docType: tipo,
      backend: getAdsCoreStorageMode(),
      expiresAt,
    },
    ip,
  })

  return NextResponse.json({
    url,
    expiresAt,
    expiresInSeconds: ttl,
  })
}
