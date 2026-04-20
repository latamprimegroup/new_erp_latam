'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

type Row = {
  id: string
  slug: string
  title: string
  status: string
  publishedToClients: boolean
  productLabel: string
  nicheLabel: string
  _count: { screenshots: number; insights: number; replicates: number }
}

export function LiveProofLabsAdminClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [productLabel, setProductLabel] = useState('')
  const [nicheLabel, setNicheLabel] = useState('')
  const [status, setStatus] = useState<
    'DRAFT' | 'EM_TESTE' | 'VALIDADA' | 'REPROVADA' | 'EM_ESCALA'
  >('DRAFT')
  const [published, setPublished] = useState(false)
  const [trackerOfferId, setTrackerOfferId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [spend24, setSpend24] = useState('')
  const [spend7, setSpend7] = useState('')
  const [checkoutHint, setCheckoutHint] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/live-proof-labs/cases')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || 'Erro')
        setRows(j.cases || [])
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createCase(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = {
        slug: slug.trim().toLowerCase(),
        title: title.trim(),
        productLabel: productLabel.trim(),
        nicheLabel: nicheLabel.trim(),
        status,
        publishedToClients: published,
      }
      if (trackerOfferId.trim()) body.internalTrackerOfferId = trackerOfferId.trim()
      if (templateId.trim()) body.creativeTemplateId = templateId.trim()
      if (checkoutHint.trim()) body.suggestedCheckoutUrl = checkoutHint.trim()
      if (spend24.trim()) body.spend24hBrl = Number(spend24.replace(',', '.'))
      if (spend7.trim()) body.spend7dBrl = Number(spend7.replace(',', '.'))

      const r = await fetch('/api/admin/live-proof-labs/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro ao criar')
      setSlug('')
      setTitle('')
      setProductLabel('')
      setNicheLabel('')
      setTrackerOfferId('')
      setTemplateId('')
      setSpend24('')
      setSpend7('')
      setCheckoutHint('')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Apagar este caso?')) return
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/live-proof-labs/cases/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || 'Erro')
      }
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div>
        <h1 className="heading-1">Live Proof Labs</h1>
        <p className="text-sm text-gray-500 mt-2">
          Casos publicados com <code className="text-xs">publishedToClients</code> aparecem na área do mentorado.
          Screenshots, gasto diário (7d) e métricas sync: edita via{' '}
          <code className="text-xs">PATCH /api/admin/live-proof-labs/cases/[id]</code> ou{' '}
          <code className="text-xs">POST /api/internal/live-proof-labs/sync</code> (header{' '}
          <code className="text-xs">x-live-proof-secret</code> + env{' '}
          <code className="text-xs">LIVE_PROOF_LABS_WEBHOOK_SECRET</code>).
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 px-4 py-3 text-sm">
          {err}
        </div>
      )}

      <form onSubmit={createCase} className="card space-y-3 max-w-xl">
        <h2 className="font-semibold">Novo caso (mínimo)</h2>
        <input
          required
          placeholder="slug-url (ex: visao-pro)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
        />
        <input
          required
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
        />
        <input
          required
          placeholder="Produto"
          value={productLabel}
          onChange={(e) => setProductLabel(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
        />
        <input
          required
          placeholder="Nicho (rótulo)"
          value={nicheLabel}
          onChange={(e) => setNicheLabel(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="w-full rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
        >
          <option value="DRAFT">DRAFT</option>
          <option value="EM_TESTE">EM_TESTE</option>
          <option value="VALIDADA">VALIDADA</option>
          <option value="REPROVADA">REPROVADA</option>
          <option value="EM_ESCALA">EM_ESCALA</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Publicar para mentorados
        </label>
        <input
          placeholder="ID TrackerOffer interno (opcional)"
          value={trackerOfferId}
          onChange={(e) => setTrackerOfferId(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
        />
        <input
          placeholder="ID CreativeVaultTemplate (réplica)"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
        />
        <input
          placeholder="URL checkout sugerida"
          value={checkoutHint}
          onChange={(e) => setCheckoutHint(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
        />
        <div className="flex gap-2">
          <input
            placeholder="Gasto 24h BRL"
            value={spend24}
            onChange={(e) => setSpend24(e.target.value)}
            className="flex-1 rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
          />
          <input
            placeholder="Gasto 7d BRL"
            value={spend7}
            onChange={(e) => setSpend7(e.target.value)}
            className="flex-1 rounded border border-gray-300 dark:border-white/15 px-3 py-2 text-sm bg-white dark:bg-black/30"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Criar
        </button>
      </form>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-4">Casos</h2>
        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : null}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-3">Slug</th>
              <th className="py-2 pr-3">Título</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Pub.</th>
              <th className="py-2 pr-3">Midia</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 dark:border-white/5">
                <td className="py-2 pr-3 font-mono text-xs">{r.slug}</td>
                <td className="py-2 pr-3">{r.title}</td>
                <td className="py-2 pr-3">{r.status}</td>
                <td className="py-2 pr-3">{r.publishedToClients ? 'sim' : 'não'}</td>
                <td className="py-2 pr-3 text-xs">
                  {r._count.screenshots} img / {r._count.insights} áudio+vídeo / {r._count.replicates} réplicas
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="p-1 text-red-600"
                    aria-label="Apagar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
