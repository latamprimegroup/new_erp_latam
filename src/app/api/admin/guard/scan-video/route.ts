import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processNextComplianceJob } from '@/lib/guard-job-processor'

/**
 * Upload de vídeo VSL — cria job assíncrono. O cron /api/cron/guard-jobs processa a fila.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Campo file obrigatório' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > 500 * 1024 * 1024) {
    return NextResponse.json({ error: 'Ficheiro demasiado grande (máx. 500MB)' }, { status: 400 })
  }

  const id = randomBytes(12).toString('hex')
  const tempPath = join(tmpdir(), `guard-vsl-${id}.mp4`)
  await writeFile(tempPath, buf)

  const job = await prisma.complianceScanJob.create({
    data: {
      status: 'PENDING',
      tipoMidia: 'VSL',
      tempPath,
    },
  })

  await processNextComplianceJob().catch(() => {})

  return NextResponse.json({
    jobId: job.id,
    message: 'Job criado. Use GET /api/admin/guard/jobs/:id ou aguarde o cron.',
  })
}
