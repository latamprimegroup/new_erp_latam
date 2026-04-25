import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const MAX_FILE_BYTES = 8 * 1024 * 1024

function extensionFromFile(file: File, fallback: string) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.jpeg') || name.endsWith('.jpg')) return 'jpg'
  if (name.endsWith('.png')) return 'png'
  if (name.endsWith('.webp')) return 'webp'
  if (name.endsWith('.pdf')) return 'pdf'
  const mime = file.type.toLowerCase()
  if (mime.includes('jpeg')) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('pdf')) return 'pdf'
  return fallback
}

export function validateQuickSaleKycFile(file: File, kind: 'document' | 'selfie') {
  if (!file || file.size <= 0) {
    return { ok: false as const, error: 'Arquivo inválido.' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false as const, error: 'Arquivo excede 8MB.' }
  }
  const mime = file.type.toLowerCase()
  const isImage = mime.startsWith('image/')
  const isPdf = mime === 'application/pdf'
  if (kind === 'document' && !isImage && !isPdf) {
    return { ok: false as const, error: 'Documento deve ser imagem ou PDF.' }
  }
  if (kind === 'selfie' && !isImage) {
    return { ok: false as const, error: 'Selfie deve ser imagem.' }
  }
  return { ok: true as const }
}

export async function saveQuickSaleKycFile(
  checkoutId: string,
  kind: 'document' | 'selfie',
  file: File,
) {
  const ext = extensionFromFile(file, kind === 'document' ? 'pdf' : 'jpg')
  const folderRelative = path.posix.join('quick-sale-kyc', checkoutId)
  const fileRelative = path.posix.join(folderRelative, `${kind}.${ext}`)
  const absolute = path.join(process.cwd(), 'uploads', fileRelative)
  await mkdir(path.dirname(absolute), { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(absolute, buffer)
  return fileRelative
}
