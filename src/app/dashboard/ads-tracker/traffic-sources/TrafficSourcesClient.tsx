'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Copy, Pencil, Plus, RefreshCw, Trash2, Wand2 } from 'lucide-react'
import type { TrafficCustomPair, TrafficParamBlueprint } from '@/lib/ads-tracker/traffic-source-types'
import { defaultGoogleBlueprint } from '@/lib/ads-tracker/traffic-source-types'

type SourceRow = {
  id: string
  slug: string
  name: string
  status: string
  networkKind: string
  builtIn: boolean
  activeParamCount: number
  updatedAt: string
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function NetworkLogo({ kind }: { kind: string }) {
  const base = 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0'
  if (kind === 'google_ads')
    return (
      <div className={`${base} bg-white`}>
        <GoogleMark className="w-6 h-6" />
      </div>
    )
  if (kind === 'meta')
    return <div className={`${base} bg-blue-600 text-white text-xs font-bold`}>M</div>
  if (kind === 'tiktok')
    return <div className={`${base} bg-zinc-900 text-white text-[10px] font-bold`}>TT</div>
  return (
    <div className={`${base} bg-zinc-800 text-zinc-400`}>
      <Wand2 className="w-4 h-4" />
    </div>
  )
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text).catch(() => {})
}

const VT_PRESETS: { label: string; key: string; value: string }[] = [
  { label: 'loc_physical_ms', key: 'loc_physical_ms', value: '{loc_physical_ms}' },
  { label: 'loc_interest_ms', key: 'loc_interest_ms', value: '{loc_interest_ms}' },
  { label: 'feeditemid', key: 'feeditemid', value: '{feeditemid}' },
  { label: 'adposition', key: 'adposition', value: '{adposition}' },
  { label: 'target', key: 'target', value: '{target}' },
  { label: 'ifmobile', key: 'ifmobile', value: '{ifmobile}' },
]

export function TrafficSourcesClient({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<SourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState<SourceRow | 'new' | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/traffic-sources')
      .then((r) => {
        if (!r.ok) throw new Error('x')
        return r.json() as Promise<{ sources: SourceRow[] }>
      })
      .then((j) => setRows(j.sources || []))
      .catch(() => setErr('Não foi possível carregar fontes.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function delRow(id: string, builtIn: boolean) {
    if (builtIn) return
    if (!confirm('Eliminar esta fonte?')) return
    const r = await fetch(`/api/admin/traffic-sources/${id}`, { method: 'DELETE' })
    if (!r.ok) setErr('Eliminação falhou.')
    else load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        {canWrite && (
          <button
            type="button"
            onClick={() => setModal('new')}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nova fonte
          </button>
        )}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <p className="text-[11px] text-zinc-500 border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
        O GCLID em campanhas Google vem do <strong className="text-zinc-400">auto-tagging</strong> da conta — não uses{' '}
        <code className="text-zinc-400">{'{gclid}'}</code> como texto fixo na Final URL. O gerador assume auto-tagging
        por omissão na fonte Google Ads e avisa se o URL ficar longo ou sem{' '}
        <code className="text-zinc-400">utm_source</code>.
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/90">
        <table className="w-full text-xs min-w-[720px]">
          <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="text-left p-2 w-14">Rede</th>
              <th className="text-left p-2">Fonte</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-right p-2">Params ativos</th>
              <th className="text-left p-2">Atualizado</th>
              <th className="text-left p-2 w-28">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500">
                  Sem fontes.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-900/40">
                <td className="p-2">
                  <NetworkLogo kind={r.networkKind} />
                </td>
                <td className="p-2">
                  <div className="text-zinc-200 font-medium">{r.name}</div>
                  <div className="text-[10px] text-zinc-600 font-mono">{r.slug}</div>
                </td>
                <td className="p-2">
                  <span
                    className={
                      r.status === 'ACTIVE' ? 'text-emerald-400 text-[11px]' : 'text-amber-200/80 text-[11px]'
                    }
                  >
                    {r.status}
                  </span>
                  {r.builtIn && <div className="text-[10px] text-zinc-600">integrada</div>}
                </td>
                <td className="p-2 text-right font-mono text-zinc-300">{r.activeParamCount}</td>
                <td className="p-2 text-zinc-500 whitespace-nowrap">
                  {new Date(r.updatedAt).toLocaleString('pt-BR')}
                </td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      title="Editar / gerar URL"
                      onClick={() => setModal(r)}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {canWrite && !r.builtIn && (
                      <button
                        type="button"
                        title="Eliminar"
                        onClick={() => void delRow(r.id, r.builtIn)}
                        className="p-1.5 rounded-md text-rose-400 hover:bg-zinc-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <SourceModal
          row={modal === 'new' ? null : modal}
          canWrite={canWrite}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function SourceModal({
  row,
  canWrite,
  onClose,
  onSaved,
}: {
  row: SourceRow | null
  canWrite: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE')
  const [networkKind, setNetworkKind] = useState('custom')
  const [bp, setBp] = useState<TrafficParamBlueprint>(defaultGoogleBlueprint())
  const [globalRows, setGlobalRows] = useState<{ k: string; v: string }[]>([])
  const [baseUrl, setBaseUrl] = useState('')
  const [built, setBuilt] = useState<{
    url: string
    warnings: string[]
    length: number
    attributionLabel: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!row) {
      setName('')
      setSlug('')
      setStatus('ACTIVE')
      setNetworkKind('custom')
      setBp(defaultGoogleBlueprint())
      setGlobalRows([])
      return
    }
    fetch(`/api/admin/traffic-sources/${row.id}`)
      .then((r) => r.json() as Promise<{ source: { name: string; status: string; networkKind: string; paramBlueprint: TrafficParamBlueprint; globalParams: Record<string, string> } }>)
      .then((j) => {
        setName(j.source.name)
        setSlug(row.slug)
        setStatus(j.source.status as 'ACTIVE' | 'PAUSED')
        setNetworkKind(j.source.networkKind)
        setBp(j.source.paramBlueprint)
        setGlobalRows(
          Object.entries(j.source.globalParams || {}).map(([k, v]) => ({ k, v: String(v) }))
        )
      })
      .catch(() => {})
  }, [row])

  const globalObject = Object.fromEntries(
    globalRows.filter((x) => x.k.trim()).map((x) => [x.k.trim(), x.v])
  )

  async function runBuild() {
    const payload = {
      baseUrl,
      useDraft: true,
      draftBlueprint: bp,
      draftGlobalParams: globalObject,
    }
    const r = await fetch('/api/admin/traffic-sources/build-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = (await r.json()) as {
      url?: string
      warnings?: string[]
      length?: number
      attributionLabel?: string
      error?: string
    }
    if (!r.ok) {
      setBuilt(null)
      alert(j.error || 'Erro')
      return
    }
    setBuilt({
      url: j.url || '',
      warnings: j.warnings || [],
      length: j.length ?? 0,
      attributionLabel: j.attributionLabel || '',
    })
  }

  async function save() {
    if (!canWrite) return
    setSaving(true)
    try {
      if (!row) {
        const r = await fetch('/api/admin/traffic-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            slug: slug.trim() || undefined,
            networkKind,
            status,
            paramBlueprint: bp,
            globalParams: globalObject,
          }),
        })
        if (!r.ok) {
          const j = (await r.json()) as { error?: string }
          alert(j.error || 'Erro')
          return
        }
        onSaved()
        return
      }
      const r = await fetch(`/api/admin/traffic-sources/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          status,
          networkKind: row.builtIn ? undefined : networkKind,
          paramBlueprint: bp,
          globalParams: globalObject,
        }),
      })
      if (!r.ok) {
        const j = (await r.json()) as { error?: string }
        alert(j.error || 'Erro')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  function setUtm(key: keyof TrafficParamBlueprint['utm'], v: string) {
    setBp({ ...bp, utm: { ...bp.utm, [key]: v } })
  }

  function addCustomPair(p: TrafficCustomPair) {
    setBp({ ...bp, customPairs: [...bp.customPairs, p] })
  }

  function updateCustom(i: number, patch: Partial<TrafficCustomPair>) {
    const next = [...bp.customPairs]
    next[i] = { ...next[i], ...patch }
    setBp({ ...bp, customPairs: next })
  }

  function removeCustom(i: number) {
    setBp({ ...bp, customPairs: bp.customPairs.filter((_, j) => j !== i) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-950 p-6 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">
            {row ? `Configurar — ${name}` : 'Nova fonte de tráfego'}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-500 text-sm hover:text-white">
            Fechar
          </button>
        </div>

        <div className="rounded-lg border border-amber-900/30 bg-amber-950/15 p-3 text-[11px] text-amber-100/85 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div>
            <p className="font-medium text-amber-200/95">Parâmetros “encapsulados” / ofuscados</p>
            <p className="mt-1 text-amber-100/75">
              Não suportamos parâmetro único encriptado para esconder dados de revisores ou plataformas — viola o
              espírito de transparência das políticas. Usa UTMs e sufixos alinhados com o que reportas no Google Ads.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white disabled:opacity-50"
            />
          </label>
          {!row && (
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Slug (opcional)</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={!canWrite}
                placeholder="minha_rede"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs disabled:opacity-50"
              />
            </label>
          )}
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Estado</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'PAUSED')}
              disabled={!canWrite}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white text-xs disabled:opacity-50"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Tipo de rede (UI)</span>
            <select
              value={networkKind}
              onChange={(e) => setNetworkKind(e.target.value)}
              disabled={!canWrite || Boolean(row?.builtIn)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white text-xs disabled:opacity-50"
            >
              <option value="google_ads">Google Ads</option>
              <option value="meta">Meta</option>
              <option value="tiktok">TikTok</option>
              <option value="custom">Outra</option>
            </select>
          </label>
        </div>

        <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-200">Mapeamento de parâmetros</h3>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={bp.assumeAutoTagging}
              disabled={!canWrite}
              onChange={(e) => setBp({ ...bp, assumeAutoTagging: e.target.checked })}
            />
            Assumir auto-tagging Google (GCLID não vai na URL gerada — injetado no clique)
          </label>
          <label className="space-y-1 block text-xs">
            <span className="text-zinc-400">Nome do parâmetro de click id (referência / postbacks)</span>
            <input
              value={bp.clickIdParam}
              onChange={(e) => setBp({ ...bp, clickIdParam: e.target.value })}
              disabled={!canWrite}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-white font-mono text-xs"
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-2">
            {(
              ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
            ).map((k) => (
              <label key={k} className="space-y-1 text-[11px]">
                <span className="text-zinc-500">{k}</span>
                <input
                  value={bp.utm[k] || ''}
                  onChange={(e) => setUtm(k, e.target.value)}
                  disabled={!canWrite}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-white font-mono text-xs"
                />
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-zinc-500 w-full">ValueTrack / pares extra</span>
              {VT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => addCustomPair({ key: p.key, value: p.value })}
                  className="text-[10px] px-2 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                >
                  + {p.label}
                </button>
              ))}
            </div>
            {bp.customPairs.map((p, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={p.key}
                  onChange={(e) => updateCustom(i, { key: e.target.value })}
                  disabled={!canWrite}
                  className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs font-mono"
                />
                <input
                  value={p.value}
                  onChange={(e) => updateCustom(i, { value: e.target.value })}
                  disabled={!canWrite}
                  className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => removeCustom(i)}
                  className="text-rose-400 text-xs px-1"
                >
                  ×
                </button>
              </div>
            ))}
            {canWrite && (
              <button
                type="button"
                onClick={() => addCustomPair({ key: '', value: '' })}
                className="text-xs text-primary-400 hover:underline"
              >
                + Linha vazia
              </button>
            )}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-zinc-200">Parâmetros globais (esta fonte)</h3>
          <p className="text-[10px] text-zinc-500">
            Aplicados a todas as URLs geradas com esta configuração (ex.: ref interno).
          </p>
          {globalRows.map((g, i) => (
            <div key={i} className="flex gap-2">
              <input
                placeholder="chave"
                value={g.k}
                onChange={(e) => {
                  const n = [...globalRows]
                  n[i] = { ...n[i], k: e.target.value }
                  setGlobalRows(n)
                }}
                disabled={!canWrite}
                className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs font-mono"
              />
              <input
                placeholder="valor"
                value={g.v}
                onChange={(e) => {
                  const n = [...globalRows]
                  n[i] = { ...n[i], v: e.target.value }
                  setGlobalRows(n)
                }}
                disabled={!canWrite}
                className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs font-mono"
              />
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => setGlobalRows(globalRows.filter((_, j) => j !== i))}
                className="text-rose-400 text-xs"
              >
                ×
              </button>
            </div>
          ))}
          {canWrite && (
            <button
              type="button"
              onClick={() => setGlobalRows([...globalRows, { k: '', v: '' }])}
              className="text-xs text-primary-400 hover:underline"
            >
              + Par global
            </button>
          )}
        </div>

        <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-200">Gerador de URL final</h3>
          <label className="space-y-1 block text-xs">
            <span className="text-zinc-400">Landing (URL base)</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://lander.exemplo.com/oferta"
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runBuild()}
              className="rounded-lg bg-zinc-800 text-white text-xs px-3 py-2"
            >
              Gerar URL de rastreamento
            </button>
            {built?.url && (
              <button
                type="button"
                onClick={() => void copyText(built.url)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-2 text-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </button>
            )}
          </div>
          {built && (
            <div className="space-y-2 text-xs">
              <p className="text-zinc-500">
                Comprimento: <span className="font-mono text-zinc-300">{built.length}</span> caracteres
              </p>
              <p className="text-zinc-500">
                Pré-visualização de tráfego (só pela URL abaixo, sem clique real):{' '}
                <span className="text-zinc-300">{built.attributionLabel}</span>
              </p>
              {built.warnings.length > 0 && (
                <ul className="list-disc pl-4 text-amber-200/90 space-y-1">
                  {built.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-2 border border-zinc-800 max-h-40 overflow-y-auto">
                {built.url}
              </pre>
            </div>
          )}
        </div>

        {canWrite && (
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800">
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !name.trim()}
              onClick={() => void save()}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-40"
            >
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
