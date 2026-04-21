'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Upload, Package, Zap, CheckCircle2, AlertTriangle, RefreshCw, Image as ImageIcon, Loader2 } from 'lucide-react'

type RgStats = { disponivel: number; emUso: number; utilizado: number }

export function AdsCoreRgAbastecimentoClient() {
  const [fileKey, setFileKey] = useState(0)
  const [frentes, setFrentes] = useState<File[]>([])
  const [versos, setVersos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [detail, setDetail] = useState<string[]>([])
  const [stats, setStats] = useState<RgStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const r = await fetch('/api/ads-core/rg-stock/stats')
      if (r.ok) setStats(await r.json())
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setDetail([])
    if (frentes.length === 0 || frentes.length !== versos.length) {
      setMsg({ kind: 'err', text: 'Selecione o mesmo número de arquivos para frente e verso (pareamento por ordem).' })
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      for (const f of frentes) fd.append('frente', f)
      for (const f of versos) fd.append('verso', f)
      const res = await fetch('/api/ads-core/rg-stock/bulk', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) {
        setMsg({ kind: 'err', text: j.error || 'Falha no envio.' })
        return
      }
      setMsg({ kind: 'ok', text: `✓ ${j.created ?? 0} par(es) importados com sucesso.${j.failed ? ` ${j.failed} falha(s).` : ''}` })
      if (Array.isArray(j.errors) && j.errors.length) setDetail(j.errors)
      setFrentes([])
      setVersos([])
      setFileKey((k) => k + 1)
      loadStats()
    } catch {
      setMsg({ kind: 'err', text: 'Erro de rede.' })
    } finally {
      setBusy(false)
    }
  }

  const total = (stats?.disponivel ?? 0) + (stats?.emUso ?? 0) + (stats?.utilizado ?? 0)
  const pctDisponivel = total > 0 ? Math.round(((stats?.disponivel ?? 0) / total) * 100) : 0

  return (
    <div className="p-4 md:p-6 max-w-screen-lg mx-auto space-y-6">

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Abastecimento de RG — Estoque de Identidades</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Upload em lote de pares frente/verso. Metadados EXIF removidos automaticamente no servidor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadStats()} disabled={loadingStats} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
            Atualizar saldo
          </button>
          <Link href="/dashboard/gerente-producao" className="text-sm text-primary-600 hover:underline">
            ← Central do Gerente
          </Link>
        </div>
      </div>

      {/* Saldo em tempo real */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`rounded-xl border p-4 ${
          (stats?.disponivel ?? 0) < 20
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : (stats?.disponivel ?? 0) < 50
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Disponíveis</span>
          </div>
          {loadingStats ? (
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          ) : (
            <>
              <p className="text-3xl font-bold">{stats?.disponivel ?? 0}</p>
              <p className="text-xs text-zinc-500 mt-1">{pctDisponivel}% do total</p>
              {(stats?.disponivel ?? 0) < 20 && (
                <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Estoque crítico — abastecer!
                </p>
              )}
            </>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Em Uso</span>
          </div>
          {loadingStats ? (
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          ) : (
            <p className="text-3xl font-bold">{stats?.emUso ?? 0}</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Utilizados</span>
          </div>
          {loadingStats ? (
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          ) : (
            <>
              <p className="text-3xl font-bold">{stats?.utilizado ?? 0}</p>
              <p className="text-xs text-zinc-500 mt-1">Total: {total}</p>
            </>
          )}
        </div>
      </div>

      {/* Barra de progresso do estoque */}
      {stats && total > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Distribuição do Estoque</p>
          <div className="h-3 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.round((stats.disponivel / total) * 100)}%` }} title={`Disponível: ${stats.disponivel}`} />
            <div className="h-full bg-orange-400 transition-all" style={{ width: `${Math.round((stats.emUso / total) * 100)}%` }} title={`Em uso: ${stats.emUso}`} />
            <div className="h-full bg-zinc-300 dark:bg-zinc-600 transition-all" style={{ width: `${Math.round((stats.utilizado / total) * 100)}%` }} title={`Utilizado: ${stats.utilizado}`} />
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Disponível</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />Em uso</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600 inline-block" />Utilizado</span>
          </div>
        </div>
      )}

      {/* Formulário de upload */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold">Upload em Lote</h2>
          <span className="text-xs text-zinc-400">(até 80 pares por envio)</span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-4 hover:border-primary-400 transition-colors">
              <div className="flex items-center gap-2 mb-2 text-zinc-500">
                <ImageIcon className="w-4 h-4" />
                <label className="text-sm font-medium cursor-pointer">
                  Frente do RG
                </label>
              </div>
              <input
                key={`f-${fileKey}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="block w-full text-sm text-zinc-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                onChange={(e) => setFrentes(e.target.files ? [...e.target.files] : [])}
              />
              {frentes.length > 0 && (
                <p className="text-xs text-primary-600 mt-1">{frentes.length} arquivo(s) selecionado(s)</p>
              )}
            </div>

            <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-4 hover:border-primary-400 transition-colors">
              <div className="flex items-center gap-2 mb-2 text-zinc-500">
                <ImageIcon className="w-4 h-4" />
                <label className="text-sm font-medium cursor-pointer">
                  Verso do RG
                </label>
              </div>
              <input
                key={`v-${fileKey}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="block w-full text-sm text-zinc-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                onChange={(e) => setVersos(e.target.files ? [...e.target.files] : [])}
              />
              {versos.length > 0 && (
                <p className="text-xs text-primary-600 mt-1">{versos.length} arquivo(s) selecionado(s)</p>
              )}
            </div>
          </div>

          {frentes.length > 0 && versos.length > 0 && frentes.length !== versos.length && (
            <p className="text-xs text-red-600 font-medium">
              ⚠️ Quantidade diferente: {frentes.length} frente(s) × {versos.length} verso(s). Os arquivos devem ser em pares.
            </p>
          )}
          {frentes.length > 0 && versos.length > 0 && frentes.length === versos.length && (
            <p className="text-xs text-green-600 font-medium">
              ✓ {frentes.length} par(es) prontos para upload
            </p>
          )}

          <p className="text-[11px] text-zinc-400">
            Aceita: JPEG, PNG, WebP. PDF não é aceito neste fluxo. Metadados EXIF removidos automaticamente.
          </p>

          <button
            type="submit"
            disabled={busy || frentes.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processando…</>
            ) : (
              <><Upload className="w-4 h-4" /> Processar abastecimento</>
            )}
          </button>
        </form>

        {msg && (
          <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg text-sm ${
            msg.kind === 'ok'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
          }`}>
            {msg.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            {msg.text}
          </div>
        )}

        {detail.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 mb-2">Detalhes das falhas:</p>
            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
              {detail.map((x, i) => (
                <li key={`${i}-${x.slice(0, 20)}`} className="text-xs font-mono text-red-600 dark:text-red-400">{x}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </div>
  )
}
