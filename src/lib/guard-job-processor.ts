import { unlink } from 'node:fs/promises'
import { prisma } from '@/lib/prisma'
import { runGuardVslScanFromFile } from '@/lib/guard-video-pipeline'

export async function processNextComplianceJob(): Promise<{ processed: boolean; jobId?: string }> {
  const job = await prisma.complianceScanJob.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  })
  if (!job) return { processed: false }

  await prisma.complianceScanJob.update({
    where: { id: job.id },
    data: { status: 'PROCESSING' },
  })

  try {
    if (!job.tempPath) throw new Error('temp_path em falta')
    const result = await runGuardVslScanFromFile({
      videoPath: job.tempPath,
      persistHistory: true,
    })
    await prisma.complianceScanJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE',
        resultJson: JSON.parse(JSON.stringify(result)) as object,
        error: null,
      },
    })
  } catch (e) {
    await prisma.complianceScanJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: e instanceof Error ? e.message : String(e),
      },
    })
  } finally {
    if (job.tempPath) await unlink(job.tempPath).catch(() => {})
  }

  return { processed: true, jobId: job.id }
}
