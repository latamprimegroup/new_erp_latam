import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { ADS_CORE_DOC_TYPES, type AdsCoreDocType } from '@/lib/ads-core-utils'
import { adsCoreDocRelPath } from '@/lib/ads-core-document-paths'
import { adsCoreGetObject, contentTypeFromDocPath } from '@/lib/ads-core-document-storage'
import { touchAdsCoreEmProducaoOnOpen } from '@/lib/ads-core-producer-touch'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

function canRead(role: string | undefined, userId: string, asset: { producerId: string | null }) {
  if (isGerente(role)) return true
  if (role === 'PRODUCER' && asset.producerId === userId) return true
  return false
}

function filenameFor(tipo: AdsCoreDocType, contentType: string): string {
  const ext =
    contentType.includes('pdf') ? 'pdf' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const label = tipo === 'cnpj' ? 'cartao-cnpj' : tipo === 'rg-frente' ? 'rg-frente' : 'rg-verso'
  return `${label}-seguro.${ext}`
}

/** Download autenticado com auditoria (evita expor arquivo sem sessão). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; tipo: string }> }) {
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

  try {
    const { body, contentType } = await adsCoreGetObject(rel)
    const ct = contentType || contentTypeFromDocPath(rel)
    const fname = filenameFor(tipo as AdsCoreDocType, ct)

    await audit({
      userId: auth.session.user.id,
      action: 'ads_core_document_downloaded',
      entity: 'AdsCoreAsset',
      entityId: id,
      details: { docType: tipo },
      ip,
    })

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': ct,
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }
}
