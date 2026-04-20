/**
 * Scanner de compliance — delega ao Ads Ativos Guard (blacklist + OpenAI).
 * `score` = risco 0–100 (maior = pior). `critical` = nível bloqueio (segurança abaixo de 40).
 */
import { runGuardComplianceScan } from '@/lib/guard-compliance-engine'

export type ComplianceScanResult = {
  score: number
  critical: boolean
  summary: string
  raw?: unknown
}

export async function scanCopyComplianceWithOpenAI(copyText: string): Promise<ComplianceScanResult> {
  const r = await runGuardComplianceScan({
    text: copyText,
    tipoMidia: 'COPY',
    persistHistory: true,
  })
  return {
    score: r.riskScore,
    critical: r.level === 'critical',
    summary: r.summary,
    raw: r,
  }
}
