import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import {
  ADS_CORE_DOC_TYPES,
  ADS_CORE_MAX_UPLOAD,
  ADS_CORE_UPLOAD_MIMES,
  type AdsCoreDocType,
} from '@/lib/ads-core-utils'
import { adsCoreUploadObject } from '@/lib/ads-core-document-storage'
import { stripImageMetadataPreserveFormat } from '@/lib/ads-core-strip-image-metadata'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

function fieldForDocType(t: AdsCoreDocType): 'docCnpjPath' | 'docRgFrentePath' | 'docRgVersoPath' {
  switch (t) {
    case 'cnpj':
      return 'docCnpjPath'
    case 'rg-frente':
      return 'docRgFrentePath'
    case 'rg-verso':
      return 'docRgVersoPath'
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const asset = await prisma.adsCoreAsset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const docType = formData.get('docType') as string | null

  if (!file || !docType) {
    return NextResponse.json({ error: 'Informe file e docType (cnpj | rg-frente | rg-verso)' }, { status: 400 })
  }
  if (!ADS_CORE_DOC_TYPES.includes(docType as AdsCoreDocType)) {
    return NextResponse.json({ error: 'docType inválido' }, { status: 400 })
  }

  const mime = file.type
  if (!ADS_CORE_UPLOAD_MIMES.includes(mime as (typeof ADS_CORE_UPLOAD_MIMES)[number])) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido (PDF ou imagem)' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > ADS_CORE_MAX_UPLOAD) {
    return NextResponse.json({ error: 'Arquivo muito grande (máx 15MB)' }, { status: 400 })
  }

  let uploadBody: Buffer
  let contentType: string
  let ext: string
  let exifStripped = false

  if (mime === 'application/pdf') {
    uploadBody = buf
    contentType = mime
    ext = 'pdf'
  } else {
    const stripped = await stripImageMetadataPreserveFormat(buf)
    uploadBody = stripped.buffer
    contentType = stripped.contentType
    ext = stripped.ext
    exifStripped = true
  }

  const cnpjDigits = asset.cnpj.replace(/\D/g, '')
  const tipoLabel =
    docType === 'cnpj' ? 'CNPJ' : docType === 'rg-frente' ? 'RG_FRENTE' : 'RG_VERSO'
  const ts = Date.now()
  const storageFileName = `${cnpjDigits}_${tipoLabel}_${ts}.${ext}`
  const relPath = `ads-core/${id}/${storageFileName}`
  await adsCoreUploadObject(relPath, uploadBody, contentType)

  const field = fieldForDocType(docType as AdsCoreDocType)
  await prisma.adsCoreAsset.update({
    where: { id },
    data: { [field]: relPath },
  })

  await audit({
    userId: auth.session.user.id,
    action: 'ads_core_document_uploaded',
    entity: 'AdsCoreAsset',
    entityId: id,
    details: { docType, path: relPath, storageName: storageFileName, exifStripped },
  })

  return NextResponse.json({ ok: true, path: relPath })
}
