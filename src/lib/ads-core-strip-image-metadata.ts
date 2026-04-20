/**
 * Remove metadados EXIF/GPS e reencoda imagem (anti-footprint).
 * PDF não passa por aqui.
 */
import sharp from 'sharp'

export type StrippedImage = {
  buffer: Buffer
  ext: string
  contentType: string
}

export async function stripImageMetadataPreserveFormat(input: Buffer): Promise<StrippedImage> {
  const img = sharp(input).rotate()
  const meta = await img.metadata()
  const fmt = meta.format

  if (fmt === 'png') {
    const buffer = await img.png({ compressionLevel: 9, force: true }).toBuffer()
    return { buffer, ext: 'png', contentType: 'image/png' }
  }
  if (fmt === 'webp') {
    const buffer = await img.webp({ quality: 90 }).toBuffer()
    return { buffer, ext: 'webp', contentType: 'image/webp' }
  }
  if (fmt === 'jpeg' || fmt === 'jpg') {
    const buffer = await img.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
    return { buffer, ext: 'jpg', contentType: 'image/jpeg' }
  }

  if (fmt === 'gif') {
    const buffer = await img.gif().toBuffer()
    return { buffer, ext: 'gif', contentType: 'image/gif' }
  }

  const buffer = await sharp(input).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer()
  return { buffer, ext: 'jpg', contentType: 'image/jpeg' }
}
