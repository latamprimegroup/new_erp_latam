/**
 * Armazenamento de documentos ADS CORE: local (uploads/), S3 ou GCS.
 *
 * Variáveis:
 * - ADS_CORE_S3_BUCKET + ADS_CORE_S3_REGION (ou AWS_REGION)
 * - ADS_CORE_GCS_BUCKET + GOOGLE_APPLICATION_CREDENTIALS
 * - ADS_CORE_STORAGE=local força disco mesmo com bucket definido (útil para dev)
 * - ADS_CORE_SIGNED_URL_TTL_SEC (padrão 3600)
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'

export type AdsCoreStorageMode = 'local' | 's3' | 'gcs'

export function getAdsCoreStorageMode(): AdsCoreStorageMode {
  if (process.env.ADS_CORE_STORAGE === 'local') return 'local'
  if (process.env.ADS_CORE_S3_BUCKET) return 's3'
  if (process.env.ADS_CORE_GCS_BUCKET) return 'gcs'
  return 'local'
}

export function adsCoreSignedUrlTtlSec(): number {
  const n = parseInt(process.env.ADS_CORE_SIGNED_URL_TTL_SEC || '3600', 10)
  if (!Number.isFinite(n)) return 3600
  return Math.min(Math.max(n, 120), 86400)
}

export function contentTypeFromDocPath(p: string): string {
  const low = p.toLowerCase()
  if (low.endsWith('.pdf')) return 'application/pdf'
  if (low.endsWith('.png')) return 'image/png'
  if (low.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.ADS_CORE_S3_REGION || process.env.AWS_REGION || 'us-east-1',
    })
  }
  return s3Client
}

export async function adsCoreUploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const mode = getAdsCoreStorageMode()
  if (mode === 's3') {
    const bucket = process.env.ADS_CORE_S3_BUCKET!
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )
    return
  }
  if (mode === 'gcs') {
    const { Storage } = await import('@google-cloud/storage')
    const bucket = process.env.ADS_CORE_GCS_BUCKET!
    await new Storage().bucket(bucket).file(key).save(body, { contentType, resumable: false })
    return
  }
  const full = join(process.cwd(), 'uploads', key)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, body)
}

export async function adsCoreGetObject(key: string): Promise<{ body: Buffer; contentType: string }> {
  const mode = getAdsCoreStorageMode()
  if (mode === 's3') {
    const bucket = process.env.ADS_CORE_S3_BUCKET!
    const r = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const ct = r.ContentType || 'application/octet-stream'
    const buf = r.Body ? await streamToBuffer(r.Body as AsyncIterable<Uint8Array>) : Buffer.alloc(0)
    return { body: buf, contentType: ct }
  }
  if (mode === 'gcs') {
    const { Storage } = await import('@google-cloud/storage')
    const bucket = process.env.ADS_CORE_GCS_BUCKET!
    const file = new Storage().bucket(bucket).file(key)
    const [buf] = await file.download()
    const [meta] = await file.getMetadata()
    return {
      body: buf,
      contentType: (meta.contentType as string) || contentTypeFromDocPath(key),
    }
  }
  const full = join(process.cwd(), 'uploads', key)
  const body = await readFile(full)
  return { body, contentType: contentTypeFromDocPath(key) }
}

/**
 * URL pré-assinada na nuvem, ou null se o backend for local (use token na rota interna).
 */
export async function adsCoreGetPresignedReadUrl(key: string, expiresSec: number): Promise<string | null> {
  const mode = getAdsCoreStorageMode()
  if (mode === 's3') {
    const bucket = process.env.ADS_CORE_S3_BUCKET!
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
    return getSignedUrl(getS3Client(), cmd, { expiresIn: expiresSec })
  }
  if (mode === 'gcs') {
    const { Storage } = await import('@google-cloud/storage')
    const bucket = process.env.ADS_CORE_GCS_BUCKET!
    const file = new Storage().bucket(bucket).file(key)
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresSec * 1000,
    })
    return url
  }
  return null
}
