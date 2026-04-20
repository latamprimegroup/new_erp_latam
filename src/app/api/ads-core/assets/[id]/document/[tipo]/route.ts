import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { ADS_CORE_DOC_TYPES, type AdsCoreDocType } from '@/lib/ads-core-utils'
import { adsCoreDocRelPath } from '@/lib/ads-core-document-paths'
import { adsCoreGetObject, contentTypeFromDocPath } from '@/lib/ads-core-document-storage'
import {
  isAdsCoreDocumentTokenForAsset,
  verifyAdsCoreDocumentViewToken,
} from '@/lib/ads-core-doc-token'
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
 * Stream do arquivo para preview no iframe (token `st` + sessão do mesmo usuário).
 * Complementa URL assinada S3/GCS quando o storage é filesystem.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; tipo: string }> }) {
  const { id, tipo } = await params
  if (!ADS_CORE_DOC_TYPES.includes(tipo as AdsCoreDocType)) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }

  const st = new URL(req.url).searchParams.get('st')
  if (!st?.trim()) {
    return NextResponse.json({ error: 'Token de visualização ausente' }, { status: 400 })
  }

  const parsed = verifyAdsCoreDocumentViewToken(st)
  if (!parsed || !isAdsCoreDocumentTokenForAsset(parsed, id, tipo)) {
    return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 403 })
  }

  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (auth.session.user.id !== parsed.userId) {
    return NextResponse.json({ error: 'Sessão não confere com o token de visualização' }, { status: 403 })
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

  try {
    const { body, contentType } = await adsCoreGetObject(rel)
    const ct = contentType || contentTypeFromDocPath(rel)

    await audit({
      userId: auth.session.user.id,
      action: 'ads_core_document_preview_streamed',
      entity: 'AdsCoreAsset',
      entityId: id,
      details: { docType: tipo },
      ip,
    })

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': ct,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }
}
