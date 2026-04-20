'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Item = {
  id: string
  domain: string
  registrarStatus: string
  cloudflareStatus: string
  serverStatus: string
  cloudflareZoneId: string | null
  videoVariantHash: string | null
  publicUrl: string | null
  lastError: string | null
  logs: string | null
}

type Batch = {
  id: string
  status: string
  templateKey: string
  targetServerIp: string
  itemCount: number
  createdAt: string
  items: Item[]
}

export function ProvisioningDashboardClient() {
  const [domainsText, setDomainsText] = useState('')
  const [targetIp, setTargetIp] = useState('')
  const [templateKey, setTemplateKey] = useState<'VSL-A' | 'QUIZ-B' | 'LEAD-C'>('VSL-A')
  const [pixel, setPixel] = useState('')
  const [videoMaster, setVideoMaster] = useState('')
  const [busy, setBusy] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [stepLog, setStepLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)

  const loadBatch = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/provisioning/batches/${id}`)
    const d = await r.json()
    if (r.ok && d.batch) setBatch(d.batch)
  }, [])

  useEffect(() => {
    if (!batchId) return
    const id = setInterval(() => loadBatch(batchId), 4000)
    return () => clearInterval(id)
  }, [batchId, loadBatch])

  async function createBatch(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await fetch('/api/admin/provisioning/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainsText,
          targetServerIp: targetIp,
          templateKey,
          metaPixelId: pixel || null,
          videoMasterKey: videoMaster || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        alert(d.error || 'Erro')
        return
      }
      setBatchId(d.id)
      setStepLog([`Lote ${d.id.slice(0, 8)}… criado com ${d.itemCount} domínio(s).`])
      await loadBatch(d.id)
    } finally {
      setBusy(false)
    }
  }

  async function runSteps() {
    if (!batchId) return
    setRunning(true)
    setStepLog((prev) => [...prev, '--- Iniciando fila (5 em paralelo) ---'])
    try {
      let guard = 0
      for (;;) {
        const r = await fetch(`/api/admin/provisioning/batches/${batchId}/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concurrency: 5 }),
        })
        const d = await r.json()
        if (!r.ok) {
          setStepLog((p) => [...p, `Erro: ${d.error || r.status}`])
          break
        }
        setStepLog((p) => [
          ...p,
          `Processados: ${d.processed} · Restantes PENDING: ${d.remaining}`,
        ])
        await loadBatch(batchId)
        if (d.remaining === 0) break
        guard++
        if (guard > 500) {
          setStepLog((p) => [...p, 'Interrompido (limite de segurança).'])
          break
        }
      }
    } finally {
      setRunning(false)
    }
  }

  async function resetDns(itemId: string) {
    if (!confirm('Recriar registro A do apex neste domínio?')) return
    const r = await fetch(`/api/admin/provisioning/items/${itemId}/reset-dns`, { method: 'POST' })
    const d = await r.json()
    if (!r.ok) alert(d.error || 'Erro')
    else {
      alert(d.message || 'OK')
      if (batchId) loadBatch(batchId)
    }
  }

  async function pauseProxy(itemId: string, proxied: boolean) {
    const r = await fetch(`/api/admin/provisioning/items/${itemId}/pause-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxied }),
    })
    const d = await r.json()
    if (!r.ok) alert(d.error || 'Erro')
    else if (batchId) loadBatch(batchId)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#09090b] text-zinc-100 -mx-4 -mt-2 px-4 py-6 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:border-cyan-500/20">
      <nav className="text-xs text-zinc-500 mb-6">
        <Link href="/dashboard/admin" className="hover:text-cyan-400">
          ← Admin
        </Link>
      </nav>

      <h1 className="text-2xl font-bold text-white tracking-tight">Provisioning Engine</h1>
      <p className="text-sm text-cyan-400/90 mt-1">
        Domínios em massa · Cloudflare (zona, DNS proxied, SSL) · webhook de servidor · hash único por lander
      </p>

      <form onSubmit={createBatch} className="mt-8 space-y-4 max-w-3xl">
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Domínios (um por linha, até 1000)</label>
          <textarea
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            rows={8}
            placeholder={'exemplo1.com\nexemplo2.com'}
            className="w-full rounded-xl bg-zinc-950 border border-cyan-500/25 px-3 py-2 text-sm font-mono text-zinc-200"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400">IP do servidor (registro A)</label>
            <input
              value={targetIp}
              onChange={(e) => setTargetIp(e.target.value)}
              placeholder="192.0.2.10"
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Template</label>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value as 'VSL-A' | 'QUIZ-B' | 'LEAD-C')}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
            >
              <option value="VSL-A">VSL-A</option>
              <option value="QUIZ-B">Quiz-B</option>
              <option value="LEAD-C">Lead-C</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400">Meta Pixel ID (opcional)</label>
            <input
              value={pixel}
              onChange={(e) => setPixel(e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Video master key (referência)</label>
            <input
              value={videoMaster}
              onChange={(e) => setVideoMaster(e.target.value)}
              placeholder="campanha_x_master"
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Criando lote…' : 'Criar lote na fila'}
        </button>
      </form>

      {batchId && (
        <div className="mt-10 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-zinc-400">
              Lote: <code className="text-cyan-300">{batchId}</code> · Status:{' '}
              <strong className="text-white">{batch?.status ?? '…'}</strong>
            </span>
            <button
              type="button"
              disabled={running}
              onClick={runSteps}
              className="rounded-lg border border-violet-500/50 text-violet-200 px-4 py-2 text-sm hover:bg-violet-950/40 disabled:opacity-50"
            >
              {running ? 'Processando…' : 'Processar fila (lotes de 5)'}
            </button>
            <a
              href={`/api/admin/provisioning/batches/${batchId}/export`}
              className="rounded-lg border border-emerald-500/40 text-emerald-300 px-4 py-2 text-sm hover:bg-emerald-950/30"
            >
              Exportar CSV
            </a>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3 max-h-40 overflow-y-auto">
            <p className="text-[10px] uppercase text-zinc-500 mb-2">Log da fila</p>
            <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap font-mono">
              {stepLog.join('\n')}
            </pre>
          </div>

          {batch?.items && batch.items.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-800">
                    <th className="p-2">Domínio</th>
                    <th className="p-2">Registro</th>
                    <th className="p-2">Cloudflare</th>
                    <th className="p-2">Servidor</th>
                    <th className="p-2">Hash vídeo</th>
                    <th className="p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.items.map((it) => (
                    <tr key={it.id} className="border-b border-zinc-800/80">
                      <td className="p-2 text-cyan-200/90">{it.domain}</td>
                      <td className="p-2">{it.registrarStatus}</td>
                      <td className="p-2">{it.cloudflareStatus}</td>
                      <td className="p-2">{it.serverStatus}</td>
                      <td className="p-2 font-mono text-[10px] max-w-[120px] truncate" title={it.videoVariantHash || ''}>
                        {it.videoVariantHash?.slice(0, 12)}…
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {it.cloudflareZoneId && (
                            <>
                              <button
                                type="button"
                                className="text-[10px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-200"
                                onClick={() => resetDns(it.id)}
                              >
                                Reset DNS
                              </button>
                              <button
                                type="button"
                                className="text-[10px] px-2 py-0.5 rounded border border-zinc-600 text-zinc-300"
                                onClick={() => pauseProxy(it.id, false)}
                              >
                                Pausar proxy
                              </button>
                              <button
                                type="button"
                                className="text-[10px] px-2 py-0.5 rounded border border-cyan-600/40 text-cyan-200"
                                onClick={() => pauseProxy(it.id, true)}
                              >
                                Ligar proxy
                              </button>
                            </>
                          )}
                        </div>
                        {it.lastError && (
                          <p className="text-red-400/90 mt-1 text-[10px]">{it.lastError}</p>
                        )}
                        {it.logs && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-zinc-500">Logs</summary>
                            <pre className="text-[10px] text-zinc-500 mt-1 max-h-24 overflow-auto whitespace-pre-wrap">
                              {it.logs}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <section className="mt-12 rounded-xl border border-zinc-800 p-4 text-xs text-zinc-500 max-w-2xl">
        <p className="font-medium text-zinc-400 mb-2">Variáveis (.env)</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <code className="text-cyan-600/90">CLOUDFLARE_API_TOKEN</code> — permissões Zone.DNS, Zone.Settings
          </li>
          <li>
            <code className="text-cyan-600/90">CLOUDFLARE_ACCOUNT_ID</code> — opcional, para criar zona na conta certa
          </li>
          <li>
            <code className="text-cyan-600/90">PROVISIONING_SERVER_WEBHOOK_URL</code> — POST JSON com HTML + pixel + hash
          </li>
          <li>
            <code className="text-cyan-600/90">PROVISIONING_WEBHOOK_SECRET</code> — Bearer opcional
          </li>
        </ul>
      </section>
    </div>
  )
}
