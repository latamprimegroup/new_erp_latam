/**
 * Camada C: frames + OCR → texto agregado → mesmas camadas A+B.
 */
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { visionOcrFromBase64Png } from '@/lib/guard-vision-ocr'
import { runGuardComplianceScan } from '@/lib/guard-compliance-engine'

const execFileAsync = promisify(execFile)

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
}

const OFFSETS_SEC = ['0', '15', '45']

export async function extractFramesAsBase64(videoPath: string): Promise<string[]> {
  const id = randomBytes(6).toString('hex')
  const bases: string[] = []
  for (let i = 0; i < OFFSETS_SEC.length; i++) {
    const out = join(tmpdir(), `guard-v-${id}-${i}.png`)
    try {
      await execFileAsync(ffmpegBin(), [
        '-y',
        '-ss',
        OFFSETS_SEC[i]!,
        '-i',
        videoPath,
        '-vframes',
        '1',
        '-vf',
        'scale=1280:-1',
        out,
      ])
      const buf = await readFile(out)
      bases.push(buf.toString('base64'))
    } catch {
      // frame opcional
    } finally {
      await unlink(out).catch(() => {})
    }
  }
  return bases
}

export async function ocrFramesToText(bases: string[]): Promise<string> {
  const parts: string[] = []
  for (const b of bases) {
    const t = await visionOcrFromBase64Png(b)
    if (t) parts.push(t)
  }
  return parts.join('\n\n')
}

export async function runGuardVslScanFromFile(params: {
  videoPath: string
  stockAccountId?: string | null
  persistHistory?: boolean
}) {
  const bases = await extractFramesAsBase64(params.videoPath)
  const ocrText = await ocrFramesToText(bases)
  const combined = ocrText.trim() || '(sem texto detectado nos frames — verifique GOOGLE_VISION_API_KEY e o vídeo)'
  return runGuardComplianceScan({
    text: combined,
    tipoMidia: 'VSL',
    stockAccountId: params.stockAccountId,
    persistHistory: params.persistHistory,
  })
}
