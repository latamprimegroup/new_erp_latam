import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { requireRoles } from '@/lib/api-auth'
import { getQuickSaleKycFileMeta } from '@/lib/smart-delivery-system'

export const runtime = 'nodejs'

type FileKind = 'document' | 'selfie'

function mimeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.pdf') return 'application/pdf'
  return 'application/octet-stream'
}

function isSafeKycRelativePath(filePath: string) {
  if (!filePath) return false
  if (filePath.includes('..')) return false
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('quick-sale-kyc/')
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  const checkoutId = String(req.nextUrl.searchParams.get('checkoutId') ?? '').trim()
  const kind = String(req.nextUrl.searchParams.get('kind') ?? '').trim() as FileKind
  if (!checkoutId || (kind !== 'document' && kind !== 'selfie')) {
    return NextResponse.json({ error: 'checkoutId e kind (document|selfie) são obrigatórios.' }, { status: 400 })
  }

  const fileMeta = await getQuickSaleKycFileMeta(checkoutId)
  const relPath = kind === 'document' ? fileMeta?.documentPath : fileMeta?.selfiePath
  if (!relPath || !isSafeKycRelativePath(relPath)) {
    return NextResponse.json({ error: 'Arquivo KYC não encontrado.' }, { status: 404 })
  }

  const uploadsRoot = path.resolve(path.join(process.cwd(), 'uploads', 'quick-sale-kyc'))
  const absolute = path.resolve(path.join(process.cwd(), 'uploads', relPath))
  if (!absolute.startsWith(uploadsRoot)) {
    return NextResponse.json({ error: 'Caminho inválido.' }, { status: 400 })
  }

  let buffer: Buffer
  try {
    buffer = await readFile(absolute)
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado no disco.' }, { status: 404 })
  }

  const mime = mimeFromPath(relPath)
  const filename = `${kind}-${checkoutId.slice(0, 8)}${path.extname(relPath) || ''}`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

