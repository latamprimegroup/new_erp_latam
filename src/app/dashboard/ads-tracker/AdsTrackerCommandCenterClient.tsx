'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  PauseCircle,
  PlayCircle,
} from 'lucide-react'

type CampaignRow = {
  id: string
  name: string
  landingUrl: string
  domainHost: string
  proxyHostKey: string | null
  uniId: string
  uniLabel: string
  adsPowerProfileId: string | null
  gclidTrackingRequired: boolean
  status: string
  emergencyContingency: boolean
  clickTotal: number
  gclidCaptured: number
  lastLatencyMs: number | null
  lastLatencyCheckedAt: string | null
  safeBrowsingStatus: string | null
  safeBrowsingDetail: string | null
  safeBrowsingCheckedAt: string | null
  edgeWebhookOverrideUrl: string | null
  createdAt: string
  updatedAt: string
  contaminationHints: string[]
  gclidHint: string | null
  health: 'ok' | 'warn' | 'bad'
}

type UniOpt = {
  id: string
  status: string
  adsPowerProfileId: string | null
  gmailMasked: string
  cnpjMasked: string
  proxyHostKey: string | null
  proxyProvider: string | null
}

function HealthBadge({ health }: { health: CampaignRow['health'] }) {
  const cls =
    health === 'ok'
      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
      : health === 'warn'
        ? 'bg-amber-950 text-amber-200 border-amber-800'
        : 'bg-red-950 text-red-200 border-red-900'
  const label = health === 'ok' ? 'OK' : health === 'warn' ? 'Atenção' : 'Crítico'
  return (
    <span className={`inline-flex text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  )
}

function GoogleAdsMark() {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white shrink-0"
      title="Google Ads"
    >
      G
    </span>
  )
}

export function AdsTrackerCommandCenterClient() {
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [unis, setUnis] = useState<UniOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [probing, setProbing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formUni, setFormUni] = useState('')
  const [formLanding, setFormLanding] = useState('')
  const [formGclid, setFormGclid] = useState(false)
  const [formEdgeUrl, setFormEdgeUrl] = useState('')
  const [formClicks, setFormClicks] = useState('0')
  const [formGclids, setFormGclids] = useState('0')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    const q = includeArchived ? '?includeArchived=1' : ''
    fetch(`/api/admin/ads-tracker/campaigns${q}`)
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<{ campaigns: CampaignRow[] }>
      })
      .then((j) => setRows(j.campaigns || []))
      .catch(() => setErr('Não foi possível carregar as campanhas.'))
      .finally(() => setLoading(false))
  }, [includeArchived])

  useEffect(() => {
    load()
  }, [load])

  const loadUnis = useCallback(() => {
    fetch('/api/admin/ads-tracker/uni-options')
      .then((r) => r.json() as Promise<{ unis: UniOpt[] }>)
      .then((j) => setUnis(j.unis || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (modalOpen) loadUnis()
  }, [modalOpen, loadUnis])

  function openCreate() {
    setEditingId(null)
    setFormName('')
    setFormUni('')
    setFormLanding('')
    setFormGclid(false)
    setFormEdgeUrl('')
    setFormClicks('0')
    setFormGclids('0')
    setModalOpen(true)
  }

  function openEdit(c: CampaignRow) {
    setEditingId(c.id)
    setFormName(c.name)
    setFormUni(c.uniId)
    setFormLanding(c.landingUrl)
    setFormGclid(c.gclidTrackingRequired)
    setFormEdgeUrl(c.edgeWebhookOverrideUrl || '')
    setFormClicks(String(c.clickTotal))
    setFormGclids(String(c.gclidCaptured))
    setModalOpen(true)
  }

  async function submitForm() {
    setSaving(true)
    setErr(null)
    try {
      if (editingId) {
        const r = await fetch(`/api/admin/ads-tracker/campaigns/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            landingUrl: formLanding,
            gclidTrackingRequired: formGclid,
            edgeWebhookOverrideUrl: formEdgeUrl.trim() || null,
            clickTotal: Number(formClicks) || 0,
            gclidCaptured: Number(formGclids) || 0,
          }),
        })
        if (!r.ok) throw new Error('save')
      } else {
        const r = await fetch('/api/admin/ads-tracker/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            uniId: formUni,
            landingUrl: formLanding,
            gclidTrackingRequired: formGclid,
            edgeWebhookOverrideUrl: formEdgeUrl.trim() || null,
          }),
        })
        if (!r.ok) throw new Error('create')
      }
      setModalOpen(false)
      load()
    } catch {
      setErr('Falha ao guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function patchStatus(id: string, status: string) {
    const r = await fetch(`/api/admin/ads-tracker/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!r.ok) setErr('Falha ao atualizar estado.')
    else load()
  }

  async function panic(id: string) {
    if (!confirm('Ativar contingência imediata? O webhook de borda será notificado (se configurado).')) return
    const r = await fetch(`/api/admin/ads-tracker/campaigns/${id}/panic`, { method: 'POST' })
    if (!r.ok) setErr('Falha no pânico.')
    else load()
  }

  async function clearEmergency(id: string) {
    const r = await fetch(`/api/admin/ads-tracker/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergencyContingency: false }),
    })
    if (!r.ok) setErr('Falha ao desligar contingência.')
    else load()
  }

  async function cloneRow(id: string) {
    const r = await fetch(`/api/admin/ads-tracker/campaigns/${id}/clone`, { method: 'POST' })
    if (!r.ok) setErr('Falha ao clonar.')
    else load()
  }

  async function archiveRow(id: string) {
    if (!confirm('Arquivar esta campanha? O webhook delete_route pode ser chamado.')) return
    await patchStatus(id, 'ARCHIVED')
  }

  async function probeOne(id: string) {
    await fetch(`/api/admin/ads-tracker/campaigns/${id}/probe-latency`, { method: 'POST' })
    load()
  }

  async function probeBatch() {
    const ids = rows.slice(0, 12).map((r) => r.id)
    if (ids.length === 0) return
    setProbing(true)
    try {
      await fetch('/api/admin/ads-tracker/campaigns/probe-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      load()
    } finally {
      setProbing(false)
    }
  }

  async function recheckSb(id: string) {
    await fetch(`/api/admin/ads-tracker/campaigns/${id}/safe-browsing`, { method: 'POST' })
    load()
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 shadow-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => void probeBatch()}
            disabled={probing || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
          >
            <Activity className="w-4 h-4" />
            {probing ? 'A medir…' : 'Latência (12 primeiras)'}
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Mostrar arquivadas
          </label>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />+ Criar
        </button>
      </div>

      {err && <p className="px-4 py-2 text-sm text-red-400 bg-red-950/30">{err}</p>}

      <div className="p-3 text-[11px] text-zinc-500 leading-relaxed border-b border-zinc-800/80">
        <strong className="text-zinc-400">Transparência:</strong> a verificação Safe Browsing indica listas Google de
        malware/phishing, não o estado de anúncios. A latência HTTP é métrica operacional da URL, sem ligação automática ao
        Índice de Qualidade. O webhook de contingência integra o <em>seu</em> edge — o ERP não implementa páginas
        &quot;safe&quot; / &quot;money&quot;.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[1100px]">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="p-3 w-40">Ações</th>
              <th className="p-3">ID</th>
              <th className="p-3">Campanha</th>
              <th className="p-3">Domínio</th>
              <th className="p-3 w-12">Rede</th>
              <th className="p-3">UNI</th>
              <th className="p-3">Criada</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Saúde</th>
              <th className="p-3">Latência</th>
              <th className="p-3">Cliques / GCLID</th>
              <th className="p-3">Safe Browsing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/90">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={12} className="p-8 text-center text-zinc-500">
                  Nenhuma campanha. Utilize &quot;+ Criar&quot; para vincular uma UNI a uma landing.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-zinc-900/40">
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      title="Editar"
                      onClick={() => openEdit(c)}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {c.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        title="Pausar"
                        onClick={() => void patchStatus(c.id, 'PAUSED')}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-amber-300 hover:bg-zinc-800"
                      >
                        <PauseCircle className="w-4 h-4" />
                      </button>
                    ) : c.status === 'PAUSED' ? (
                      <button
                        type="button"
                        title="Retomar"
                        onClick={() => void patchStatus(c.id, 'ACTIVE')}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      title="Clonar"
                      onClick={() => void cloneRow(c.id)}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Arquivar"
                      onClick={() => void archiveRow(c.id)}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-red-300 hover:bg-zinc-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Contingência (webhook)"
                      onClick={() => void panic(c.id)}
                      className={`p-1.5 rounded-md hover:bg-zinc-800 ${
                        c.emergencyContingency ? 'text-red-400' : 'text-sky-400'
                      }`}
                    >
                      {c.emergencyContingency ? <ShieldAlert className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>
                    {c.emergencyContingency && (
                      <button
                        type="button"
                        title="Desligar contingência"
                        onClick={() => void clearEmergency(c.id)}
                        className="text-[10px] px-1 text-zinc-500 hover:text-zinc-300"
                      >
                        off
                      </button>
                    )}
                    <button
                      type="button"
                      title="Medir latência"
                      onClick={() => void probeOne(c.id)}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      <Activity className="w-4 h-4" />
                    </button>
                  </div>
                </td>
                <td className="p-3 font-mono text-[11px] text-zinc-500 max-w-[100px] truncate" title={c.id}>
                  {c.id.slice(0, 8)}…
                </td>
                <td className="p-3 text-zinc-200 max-w-[180px]">
                  <div className="font-medium truncate" title={c.name}>
                    {c.name}
                  </div>
                  {c.gclidTrackingRequired && (
                    <span className="text-[10px] text-sky-400">GCLID obrigatório (S2S)</span>
                  )}
                </td>
                <td className="p-3 text-xs text-zinc-400 max-w-[200px]">
                  <div className="truncate font-mono" title={c.domainHost}>
                    {c.domainHost}
                  </div>
                  {c.proxyHostKey && (
                    <div className="text-[10px] text-zinc-600 truncate" title={c.proxyHostKey || ''}>
                      proxy: {c.proxyHostKey}
                    </div>
                  )}
                  {c.contaminationHints.length > 0 && (
                    <div className="mt-1 flex items-start gap-1 text-amber-500 text-[10px]">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{c.contaminationHints.join(' · ')}</span>
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <GoogleAdsMark />
                </td>
                <td className="p-3 text-[11px] text-zinc-400 max-w-[160px]">
                  <div className="font-mono truncate" title={c.uniId}>
                    {c.uniId.slice(0, 8)}…
                  </div>
                  <div className="truncate text-zinc-500">{c.uniLabel}</div>
                </td>
                <td className="p-3 text-[11px] text-zinc-500 whitespace-nowrap">
                  {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="p-3">
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                      c.status === 'ACTIVE'
                        ? 'border-emerald-800 text-emerald-300 bg-emerald-950/50'
                        : c.status === 'PAUSED'
                          ? 'border-amber-800 text-amber-200 bg-amber-950/40'
                          : 'border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="p-3">
                  <HealthBadge health={c.health} />
                </td>
                <td className="p-3 text-xs">
                  {c.lastLatencyMs != null ? (
                    <span className={c.lastLatencyMs > 500 ? 'text-red-400 font-mono' : 'text-zinc-300 font-mono'}>
                      {c.lastLatencyMs} ms
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                  {c.lastLatencyCheckedAt && (
                    <div className="text-[10px] text-zinc-600 mt-0.5">
                      {new Date(c.lastLatencyCheckedAt).toLocaleString('pt-BR')}
                    </div>
                  )}
                </td>
                <td className="p-3 text-xs">
                  <span className="font-mono text-zinc-200">
                    {c.gclidCaptured} / {c.clickTotal}
                  </span>
                  {c.gclidHint && (
                    <div className="text-[10px] text-amber-400 mt-1 max-w-[200px]">{c.gclidHint}</div>
                  )}
                </td>
                <td className="p-3 text-[11px]">
                  <div className="text-zinc-300">{c.safeBrowsingStatus || '—'}</div>
                  {c.safeBrowsingDetail && (
                    <div className="text-[10px] text-zinc-500 mt-1 max-w-[180px] line-clamp-2" title={c.safeBrowsingDetail}>
                      {c.safeBrowsingDetail}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void recheckSb(c.id)}
                    className="mt-1 text-[10px] text-sky-400 hover:underline"
                  >
                    Reverificar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {editingId ? 'Editar campanha' : 'Nova campanha (Google Ads — checklist)'}
            </h2>
            <div className="space-y-3 text-sm">
              <label className="block space-y-1">
                <span className="text-zinc-400">Nome da campanha</span>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
                />
              </label>
              {!editingId && (
                <label className="block space-y-1">
                  <span className="text-zinc-400">UNI (obrigatório)</span>
                  <select
                    value={formUni}
                    onChange={(e) => setFormUni(e.target.value)}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
                  >
                    <option value="">— Selecionar UNI —</option>
                    {unis.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.gmailMasked} · {u.cnpjMasked} · {u.status}
                        {u.proxyHostKey ? ` · ${u.proxyHostKey}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block space-y-1">
                <span className="text-zinc-400">URL da landing (http/https)</span>
                <input
                  value={formLanding}
                  onChange={(e) => setFormLanding(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
                />
              </label>
              <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={formGclid} onChange={(e) => setFormGclid(e.target.checked)} />
                Exigir captura de GCLID para postback S2S
              </label>
              <label className="block space-y-1">
                <span className="text-zinc-400">Webhook do edge (opcional, sobrescreve .env)</span>
                <input
                  value={formEdgeUrl}
                  onChange={(e) => setFormEdgeUrl(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white text-xs"
                  placeholder="https://..."
                />
              </label>
              {editingId && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-zinc-400 text-xs">Cliques totais</span>
                    <input
                      type="number"
                      min={0}
                      value={formClicks}
                      onChange={(e) => setFormClicks(e.target.value)}
                      className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-400 text-xs">GCLID capturados</span>
                    <input
                      type="number"
                      min={0}
                      value={formGclids}
                      onChange={(e) => setFormGclids(e.target.value)}
                      className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || !formName.trim() || (!editingId && !formUni) || !formLanding.trim()}
                onClick={() => void submitForm()}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-40"
              >
                {saving ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
