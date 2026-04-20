'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, RefreshCw } from 'lucide-react'
import {
  CompliancePublishGate,
  ComplianceSemaphore,
} from '@/components/dashboard/ComplianceSemaphore'

type GuardResult = {
  safetyScore: number
  riskScore: number
  level: 'critical' | 'warning' | 'safe'
  violatedTerms: string[]
  rewriteSuggestions: Array<{ from: string; to: string }>
  summary: string
  blacklistHits: string[]
}

export function GuardClient() {
  const [text, setText] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<GuardResult | null>(null)
  const [err, setErr] = useState('')

  const [history, setHistory] = useState<
    Array<{
      id: string
      tipoMidia: string
      scoreRisco: number
      summary: string | null
      createdAt: string
    }>
  >([])

  const [terms, setTerms] = useState<Array<{ id: string; term: string; category: string | null }>>([])
  const [newTerm, setNewTerm] = useState('')
  const [webhook, setWebhook] = useState('')
  const [note, setNote] = useState('')
  const [envOpenai, setEnvOpenai] = useState(false)
  const [envVision, setEnvVision] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  const [videoJob, setVideoJob] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  const loadHistory = useCallback(() => {
    fetch('/api/admin/guard/history')
      .then((r) => r.json())
      .then((d) => setHistory(Array.isArray(d.history) ? d.history : []))
      .catch(() => {})
  }, [])

  const loadBlacklist = useCallback(() => {
    fetch('/api/admin/guard/blacklist')
      .then((r) => r.json())
      .then((d) => setTerms(Array.isArray(d.terms) ? d.terms : []))
      .catch(() => {})
  }, [])

  const loadSettings = useCallback(() => {
    fetch('/api/admin/guard/settings')
      .then((r) => r.json())
      .then((d) => {
        setWebhook(d.guardNotificationWebhook ?? '')
        setNote(d.guardOpenaiConfigNote ?? '')
        setEnvOpenai(!!d.openaiFromEnv)
        setEnvVision(!!d.visionFromEnv)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadHistory()
    loadBlacklist()
    loadSettings()
  }, [loadHistory, loadBlacklist, loadSettings])

  async function runScan() {
    setErr('')
    setScanning(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/guard/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tipoMidia: 'COPY' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erro na análise')
      setResult(d as GuardResult)
      loadHistory()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setScanning(false)
    }
  }

  async function saveSettings() {
    setSavingSettings(true)
    try {
      await fetch('/api/admin/guard/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardNotificationWebhook: webhook,
          guardOpenaiConfigNote: note,
        }),
      })
      loadSettings()
    } finally {
      setSavingSettings(false)
    }
  }

  async function addTerm() {
    if (!newTerm.trim()) return
    const res = await fetch('/api/admin/guard/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: newTerm.trim() }),
    })
    if (res.ok) {
      setNewTerm('')
      loadBlacklist()
    }
  }

  async function removeTerm(id: string) {
    await fetch(`/api/admin/guard/blacklist/${id}`, { method: 'DELETE' })
    loadBlacklist()
  }

  async function uploadVideo(f: File | null) {
    if (!f) return
    setUploading(true)
    setErr('')
    setVideoJob(null)
    setJobStatus('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/admin/guard/scan-video', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Upload falhou')
      setVideoJob(d.jobId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    if (!videoJob) return
    let cancelled = false
    const t = setInterval(async () => {
      const r = await fetch(`/api/admin/guard/jobs/${videoJob}`)
      const d = await r.json()
      if (cancelled || !d.job) return
      setJobStatus(d.job.status)
      if (d.job.status === 'DONE' && d.job.resultJson) {
        const j = d.job.resultJson as GuardResult
        setResult(j)
        clearInterval(t)
        loadHistory()
      }
      if (d.job.status === 'FAILED') {
        setErr(d.job.error || 'Falha no job')
        clearInterval(t)
      }
    }, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [videoJob, loadHistory])

  return (
    <div className="space-y-10 text-zinc-200">
      {err ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">{err}</div>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Análise de copy (Camadas A + B)</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Blacklist instantânea + revisor IA (gpt-4o-mini). Vídeo usa FFmpeg + Vision (Camada C) na fila assíncrona.
        </p>
        <textarea
          className="w-full min-h-[160px] rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm"
          placeholder="Cole headline, descrição ou texto de LP…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runScan}
            disabled={scanning || text.length < 10}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Analisar
          </button>
          <CompliancePublishGate safetyScore={result?.safetyScore ?? 100}>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
            >
              Simular &quot;Publicar campanha&quot;
            </button>
          </CompliancePublishGate>
          <CompliancePublishGate safetyScore={result?.safetyScore ?? 100}>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
            >
              Simular &quot;Subir para YouTube&quot;
            </button>
          </CompliancePublishGate>
        </div>

        {result ? (
          <div className="mt-6 space-y-4">
            <ComplianceSemaphore safetyScore={result.safetyScore} />
            {result.rewriteSuggestions?.length ? (
              <div className="rounded-lg border border-zinc-800 bg-black/30 p-4">
                <p className="text-sm font-medium text-zinc-300 mb-2">Sugestões de rewrite</p>
                <ul className="space-y-2 text-sm text-zinc-400">
                  {result.rewriteSuggestions.map((s, i) => (
                    <li key={i}>
                      <span className="text-red-300/90 line-through">{s.from || '—'}</span>
                      <span className="mx-2 text-zinc-600">→</span>
                      <span className="text-emerald-300/90">{s.to || '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.blacklistHits?.length ? (
              <p className="text-xs text-amber-400/90">Blacklist: {result.blacklistHits.join(', ')}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Vídeo VSL (assíncrono)</h2>
        <p className="text-sm text-zinc-500 mb-3">
          FFmpeg + Google Vision OCR nos frames; depois mesmas camadas A/B. Configure FFMPEG_PATH e GOOGLE_VISION_API_KEY.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enviar vídeo
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => uploadVideo(e.target.files?.[0] ?? null)}
          />
        </label>
        {videoJob ? (
          <p className="mt-2 text-xs text-zinc-500">
            Job: {videoJob.slice(0, 12)}… — estado: {jobStatus || '…'}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-white">Blacklist (Camada A)</h2>
          <button type="button" onClick={loadBlacklist} className="text-zinc-500 hover:text-zinc-300">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm"
            placeholder="Novo termo (ex.: garantido)"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
          />
          <button
            type="button"
            onClick={addTerm}
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm"
          >
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </div>
        <ul className="divide-y divide-zinc-800 text-sm">
          {terms.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <span>{t.term}</span>
              <button type="button" onClick={() => removeTerm(t.id)} className="text-red-400 hover:text-red-300">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Configurações & webhooks</h2>
        <p className="text-xs text-zinc-500 mb-2">
          OPENAI_API_KEY: {envOpenai ? 'definida no ambiente' : 'ausente — Camada B limitada'} · Vision:{' '}
          {envVision ? 'OK' : 'ausente — Camada C sem OCR'}
        </p>
        <label className="block text-xs text-zinc-400 mb-1">Webhook de notificação (alertas de política)</label>
        <input
          className="w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm mb-3"
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://…"
        />
        <label className="block text-xs text-zinc-400 mb-1">Notas internas (prompts / revisão)</label>
        <textarea
          className="w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm mb-3 min-h-[80px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          onClick={saveSettings}
          disabled={savingSettings}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {savingSettings ? 'A guardar…' : 'Guardar'}
        </button>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Histórico (tb_compliance_history)</h2>
          <button type="button" onClick={loadHistory} className="text-sm text-violet-400 hover:underline">
            Atualizar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="py-2">Data</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Risco</th>
                <th className="py-2">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-zinc-800/80">
                  <td className="py-2 whitespace-nowrap">{new Date(h.createdAt).toLocaleString('pt-BR')}</td>
                  <td className="py-2">{h.tipoMidia}</td>
                  <td className="py-2">{h.scoreRisco}</td>
                  <td className="py-2 max-w-md truncate">{h.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-zinc-600">
        Cron sugerido: GET /api/cron/guard-jobs?secret=CRON_SECRET e GET /api/cron/google-ads-policy?secret=CRON_SECRET
        (semanal).
      </p>
    </div>
  )
}
