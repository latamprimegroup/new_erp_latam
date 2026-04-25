'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ShieldAlert, AlertTriangle, CheckCircle2, Clock, Zap,
  ChevronRight, RefreshCw,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type IncidentResult = {
  id: string
  ticketNumber: string
  withinWarranty: boolean
  warrantyDays: number
  hoursAfterDelivery: number | null
  status: string
  originalAsset?: { adsId: string; displayName: string } | null
  vendor?: { name: string } | null
}

const REASON_OPTIONS = [
  { value: 'CHECKPOINT',        label: '🔐 Checkpoint (verificação de segurança da plataforma)' },
  { value: 'BAN',               label: '⛔ Ban (conta banida pela plataforma)' },
  { value: 'ACCOUNT_SUSPENDED', label: '🚫 Suspensão (conta suspensa temporariamente)' },
  { value: 'QUALITY_ISSUE',     label: '📉 Problema de qualidade (gasto baixo, nicho errado)' },
  { value: 'METRICS_ISSUE',     label: '📊 Métricas inconsistentes com o anunciado' },
  { value: 'WRONG_PASSWORD',    label: '🔑 Senha ou credenciais incorretas' },
  { value: 'OTHER',             label: '❓ Outro (descreva abaixo)' },
]

// ─── Componente principal ─────────────────────────────────────────────────────

export function RegistrarQuedaClient({
  userName,
  userRole,
}: {
  userId: string
  userName: string
  userRole: string
}) {
  const [step, setStep]               = useState<'form' | 'result' | 'replaced'>('form')
  const [assetId, setAssetId]         = useState('')
  const [reason, setReason]           = useState('ACCOUNT_SUSPENDED')
  const [detail, setDetail]           = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [replacing, setReplacing]     = useState(false)
  const [result, setResult]           = useState<IncidentResult | null>(null)
  const [replaceData, setReplaceData] = useState<{ adsId: string } | null>(null)
  const [error, setError]             = useState<string | null>(null)

  async function submitIncident(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/rma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suspendedAccountRaw: assetId.trim(),
          reason,
          reasonDetail: detail.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.ticketNumber) {
          setError(`Já existe um ticket aberto para este ativo: ${data.ticketNumber}`)
        } else {
          setError(data.error ?? 'Erro ao registrar incidente.')
        }
        return
      }
      setResult(data as IncidentResult)
      setStep('result')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSelfReplace() {
    if (!result) return
    setReplacing(true)
    setError(null)
    try {
      const res = await fetch(`/api/rma/${result.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SELF_REPLACE' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao processar substituição automática.')
        return
      }
      if (data.replacementAssetId) {
        // Tenta buscar o adsId do ativo de reposição
        try {
          const assetRes = await fetch(`/api/compras/ativos/${data.replacementAssetId}`)
          const assetData = assetRes.ok ? await assetRes.json() : null
          setReplaceData({ adsId: assetData?.adsId ?? data.replacementAssetId })
        } catch {
          setReplaceData({ adsId: data.replacementAssetId })
        }
      }
      setStep('replaced')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setReplacing(false)
    }
  }

  function reset() {
    setStep('form')
    setAssetId('')
    setReason('ACCOUNT_SUSPENDED')
    setDetail('')
    setResult(null)
    setReplaceData(null)
    setError(null)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/dashboard" className="hover:text-gray-700 dark:hover:text-gray-300">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span>Suporte</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-800 dark:text-gray-200">Registrar Queda de Ativo</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="heading-1">Registrar Queda de Ativo</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Olá, {userName}. Reporte uma queda e o sistema verifica a garantia automaticamente.
            </p>
          </div>
        </div>
      </div>

      {/* Formulário */}
      {step === 'form' && (
        <div className="card space-y-5">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-700 dark:text-blue-300">
            <strong>Como funciona:</strong> Informe o ID do ativo que caiu. O sistema vincula automaticamente ao ID real e ao fornecedor de origem — sem você precisar saber quem é.
          </div>

          <form onSubmit={submitIncident} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                ID do Ativo (ID Público) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input-field font-mono text-base"
                placeholder="AA-CONT-000001 ou número da conta"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                required
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Use o ID público (formato AA-...) que consta no seu painel, ou o número de identificação da plataforma.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Tipo do Problema <span className="text-red-500">*</span>
              </label>
              <select
                className="input-field"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              >
                {REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Descrição do que aconteceu
                <span className="text-gray-400 font-normal ml-1">(opcional, mas ajuda na negociação com o fornecedor)</span>
              </label>
              <textarea
                className="input-field min-h-[100px] resize-y"
                placeholder="Ex: A conta entrou em checkpoint na segunda-feira às 14h, após subir um anúncio de X. Printei o erro, posso enviar se necessário..."
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={500}
              />
              <div className="text-xs text-gray-400 text-right mt-1">{detail.length}/500</div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !assetId.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Verificando garantia...</>
              ) : (
                <><ShieldAlert className="w-4 h-4" /> Registrar incidente</>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Resultado */}
      {step === 'result' && result && (
        <div className="space-y-4">
          <div className={`card space-y-4 border-2 ${result.withinWarranty ? 'border-emerald-300 dark:border-emerald-800' : 'border-amber-300 dark:border-amber-800'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${result.withinWarranty ? 'bg-emerald-100 dark:bg-emerald-950/30' : 'bg-amber-100 dark:bg-amber-950/30'}`}>
                {result.withinWarranty
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  : <Clock className="w-5 h-5 text-amber-600" />
                }
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{result.ticketNumber}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${result.withinWarranty ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                    {result.withinWarranty ? '✅ DENTRO DA GARANTIA' : '⚠️ FORA DA GARANTIA'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">Incidente registrado com sucesso</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {result.originalAsset && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                  <div className="text-xs text-gray-400 mb-1">Ativo identificado</div>
                  <div className="font-mono font-semibold">{result.originalAsset.adsId}</div>
                  <div className="text-xs text-gray-500 truncate">{result.originalAsset.displayName}</div>
                </div>
              )}
              {result.hoursAfterDelivery !== null && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                  <div className="text-xs text-gray-400 mb-1">Tempo após entrega</div>
                  <div className="font-semibold">{result.hoursAfterDelivery}h</div>
                  <div className="text-xs text-gray-500">Garantia: {result.warrantyDays}d ({result.warrantyDays * 24}h)</div>
                </div>
              )}
            </div>

            {result.withinWarranty ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                  <strong>Ativo dentro da garantia!</strong> Você pode solicitar substituição imediata com 1 clique.
                  O sistema reserva um novo ativo e registra o custo automaticamente contra o fornecedor.
                </div>
                {error && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {error}
                  </div>
                )}
                {/* Apenas roles com permissão de auto-substituição */}
                {['COMMERCIAL', 'PRODUCER', 'PRODUCTION_MANAGER', 'ADMIN', 'PURCHASING'].includes(userRole) && (
                  <button
                    type="button"
                    onClick={() => void handleSelfReplace()}
                    disabled={replacing}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {replacing ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Buscando ativo de reposição...</>
                    ) : (
                      <><Zap className="w-4 h-4" /> Substituir agora — 1 clique</>
                    )}
                  </button>
                )}
                <button type="button" onClick={reset} className="btn-secondary w-full">
                  Registrar outro incidente
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-300">
                  Ativo fora do prazo de garantia ({result.warrantyDays} dias). O ticket foi registrado e será analisado pela equipe de suporte.
                  O custo desta queda será contabilizado no balanço mensal do fornecedor.
                </div>
                <button type="button" onClick={reset} className="btn-secondary w-full">
                  Registrar outro incidente
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Substituição concluída */}
      {step === 'replaced' && replaceData && (
        <div className="card space-y-4 border-2 border-emerald-300 dark:border-emerald-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-emerald-700 dark:text-emerald-300 text-lg">Substituição concluída!</h2>
              <p className="text-sm text-gray-500">Novo ativo reservado com sucesso.</p>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
            <div className="text-xs text-gray-400 mb-1">Novo ativo reservado para você</div>
            <div className="font-mono font-bold text-lg">{replaceData.adsId}</div>
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 text-sm text-blue-700 dark:text-blue-300">
            O custo desta reposição foi registrado automaticamente como débito do fornecedor original. Sem burocracia — o ERP aprende e protege sua margem.
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reset} className="btn-secondary flex-1">
              Registrar outro incidente
            </button>
            <Link href="/dashboard" className="btn-primary flex-1 text-center">
              Voltar ao Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
