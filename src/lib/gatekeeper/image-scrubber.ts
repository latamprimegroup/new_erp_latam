/**
 * Image Scrubber & Hash-Killer: remove metadados EXIF (via re-encode + rotate)
 * e aplica ruído visual mínimo para alterar o hash de conteúdo.
 *
 * **SERVER-ONLY:** importar apenas em rotas/API ou `src/lib` server-side.
 * Não referenciar em componentes `'use client'` nem em bundles do browser.
 */
import { createHash, randomInt } from 'crypto'
import sharp from 'sharp'

export async function scrubDocumentImage(input: Buffer): Promise<{ buffer: Buffer; md5: string }> {
  const meta = await sharp(input).metadata()
  const w = meta.width && meta.width > 0 ? meta.width : 640
  const h = meta.height && meta.height > 0 ? meta.height : 480

  const noise = Buffer.alloc(4)
  noise[0] = randomInt(0, 255)
  noise[1] = randomInt(0, 255)
  noise[2] = randomInt(0, 255)
  noise[3] = Math.min(255, randomInt(20, 80))

  const noiseTile = await sharp(noise, { raw: { width: 1, height: 1, channels: 4 } })
    .png()
    .toBuffer()

  const left = Math.max(0, w - 1)
  const top = Math.max(0, h - 1)

  const buffer = await sharp(input)
    .rotate()
    .composite([{ input: noiseTile, left, top, blend: 'over' }])
    .png({ compressionLevel: 9 })
    .toBuffer()

  const md5 = createHash('md5').update(buffer).digest('hex')
  return { buffer, md5 }
}
