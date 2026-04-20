/**
 * Limpeza de metadados de vídeo (FFmpeg) — requer FFMPEG_PATH no servidor.
 * POST multipart: field "file" = vídeo. Resposta: stub ou ficheiro processado.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

const execFileAsync = promisify(execFile)

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Envie o campo file (vídeo)' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > 500 * 1024 * 1024) {
    return NextResponse.json({ error: 'Ficheiro demasiado grande (máx. 500MB)' }, { status: 400 })
  }

  const id = randomBytes(8).toString('hex')
  const inPath = join(tmpdir(), `aa-in-${id}.mp4`)
  const outPath = join(tmpdir(), `aa-out-${id}.mp4`)

  try {
    await writeFile(inPath, buf)
    await execFileAsync(ffmpeg, [
      '-y',
      '-i',
      inPath,
      '-map_metadata',
      '-1',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outPath,
    ])
    const outBuf = await readFile(outPath)
    await unlink(inPath).catch(() => {})
    await unlink(outPath).catch(() => {})
    return new NextResponse(outBuf, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="clean-${id}.mp4"`,
      },
    })
  } catch {
    await unlink(inPath).catch(() => {})
    await unlink(outPath).catch(() => {})
    return NextResponse.json(
      {
        error:
          'FFmpeg não disponível ou falhou. Defina FFMPEG_PATH no servidor e garanta que o binário está no PATH.',
        hint: 'Em Windows, instale FFmpeg e aponte FFMPEG_PATH para ffmpeg.exe',
      },
      { status: 503 },
    )
  }
}
