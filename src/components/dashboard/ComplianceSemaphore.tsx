'use client'

import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'

export type SemaphoreLevel = 'critical' | 'warning' | 'safe'

export function levelFromSafetyScore(safetyScore: number): SemaphoreLevel {
  if (safetyScore < 40) return 'critical'
  if (safetyScore <= 75) return 'warning'
  return 'safe'
}

type Props = {
  safetyScore: number
  title?: string
  subtitle?: string
  /** Quando true, desabilita ações de publicação (ex.: YouTube / campanha) */
  blockPublish?: boolean
  children?: React.ReactNode
}

/**
 * Semáforo de risco — Ads Ativos Guard (score de segurança 0–100, maior = melhor).
 */
export function ComplianceSemaphore({ safetyScore, title, subtitle, blockPublish = true, children }: Props) {
  const level = levelFromSafetyScore(safetyScore)
  const publishBlocked = blockPublish && level === 'critical'

  const ring =
    level === 'critical'
      ? 'border-red-500 bg-red-950/50 text-red-100'
      : level === 'warning'
        ? 'border-amber-500 bg-amber-950/40 text-amber-100'
        : 'border-emerald-600 bg-emerald-950/40 text-emerald-100'

  const Icon = level === 'critical' ? ShieldAlert : level === 'warning' ? AlertTriangle : CheckCircle2

  const headline =
    title ||
    (level === 'critical'
      ? 'Violação de sistemas circundantes'
      : level === 'warning'
        ? 'Promessa agressiva'
        : 'Conteúdo em conformidade técnica')

  const sub =
    subtitle ||
    (level === 'critical'
      ? 'Score de segurança abaixo de 40. Revise copy e sugestões antes de publicar.'
      : level === 'warning'
        ? 'Score entre 40 e 75. Ajuste termos para reduzir risco de reprovação.'
        : 'Score acima de 75. Boas práticas alinhadas ao tom esperado.')

  return (
    <div
      className={`rounded-xl border-2 p-4 ${ring}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="h-8 w-8 shrink-0 opacity-90" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Ads Ativos Guard</p>
          <p className="text-lg font-semibold leading-tight">{headline}</p>
          <p className="mt-1 text-sm opacity-90">{sub}</p>
          <p className="mt-2 font-mono text-sm">
            Segurança: <span className="font-bold">{Math.round(safetyScore)}</span>/100
          </p>
          {publishBlocked ? (
            <p className="mt-2 text-sm font-medium text-red-200">
              Publicação / upload para YouTube desativados até o score subir.
            </p>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-4 border-t border-white/10 pt-4">{children}</div> : null}
    </div>
  )
}

type GateProps = {
  safetyScore: number
  children: React.ReactElement
}

/** Desabilita o filho (ex.: botão Publicar) quando segurança abaixo de 40. */
export function CompliancePublishGate({ safetyScore, children }: GateProps) {
  const blocked = safetyScore < 40
  return (
    <span
      className={blocked ? 'inline-block opacity-40 pointer-events-none' : 'inline-block'}
      title={blocked ? 'Bloqueado pelo Guard (segurança abaixo de 40)' : undefined}
    >
      {children}
    </span>
  )
}
