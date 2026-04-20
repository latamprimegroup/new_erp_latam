'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Network,
  Plus,
  RefreshCw,
  ShieldAlert,
  Skull,
} from 'lucide-react'

type UniRow = {
  id: string
  status: string
  displayName: string | null
  killedAt: string | null
  primaryDomainHost: string | null
  timezoneIana: string | null
  preferredLocale: string | null
  riskLevel: string
  campaignsCount: number
  blockedShield24h: number
  suggestProxyRotation: boolean
  ipHealth: 'ok' | 'warn' | 'bad'
  ipHealthLabel: string
  proxyEndpoint: string | null
  proxyProvider: string | null
  lastProxyProbeAt: string | null
  lastProxyProbeOk: boolean | null
  lastProxyProbeMs: number | null
  gmailMasked: string
  cnpjMasked: string
  adsPowerProfileId: string | null
  activationAt: string
  headerIsolation: { suggestedUserAgent: string; suggestedAcceptLanguage: string }
}

function healthDot(level: UniRow['ipHealth']) {
  if (level === 'ok') return 'bg-emerald-500'
  if (level === 'warn') return 'bg-amber-400'
  return 'bg-red-500'
}

export function UniManagementClient() {
  const [rows, setRows] = useState<UniRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [depsId, setDepsId] = useState<string | null>(null)
  const [deps, setDeps] = useState<Record<string, unknown> | null>(null)
  const [activityId, setActivityId] = useState<string | null>(null)
  const [activity, setActivity] = useState<{ id: string; kind: string; message: string; createdAt: string }[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rotationHint, setRotationHint] = useState<{ uniId: string; text: string } | null>(null)

  const load = useCallback(() => {
    setErr(null)
    setLoading(true)
    fetch('/api/admin/ads-tracker/unis?take=100')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<{ unis: UniRow[] }>
      })
      .then((j) => setRows(j.unis || []))
      .catch(() => setErr('Não foi possível carregar UNIs.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!depsId) {
      setDeps(null)
      return
    }
    fetch(`/api/admin/ads-tracker/unis/${depsId}/dependencies`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDeps)
      .catch(() => setDeps(null))
  }, [depsId])

  useEffect(() => {
    if (!activityId) {
      setActivity([])
      return
    }
    fetch(`/api/admin/ads-tracker/unis/${activityId}/activity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { logs?: typeof activity } | null) => setActivity(j?.logs || []))
      .catch(() => setActivity([]))
  }, [activityId])

  async function probe(id: string) {
    setBusy(`probe:${id}`)
    setErr(null)
    try {
      const r = await fetch(`/api/admin/ads-tracker/unis/${id}/probe`, { method: 'POST' })
      const j = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok) setErr(j.error || 'Probe falhou')
      load()
    } catch {
      setErr('Probe falhou')
    } finally {
      setBusy(null)
    }
  }

  async function loadRotationHint(id: string) {
    setRotationHint(null)
    const r = await fetch(`/api/admin/ads-tracker/unis/${id}/suggest-rotation`)
    const j = (await r.json()) as { message?: string; suggestRotation?: boolean }
    if (r.ok) setRotationHint({ uniId: id, text: j.message || '—' })
  }

  async function kill(id: string) {
    const reason = prompt('Motivo do kill-switch (opcional):') ?? ''
    if (!confirm('Kill-switch: desativa o proxy no pool e aciona contingência em todas as campanhas desta UNI. Continuar?')) {
      return
    }
    setBusy(`kill:${id}`)
    setErr(null)
    try {
      const r = await fetch(`/api/admin/ads-tracker/unis/${id}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      const j = (await r.json()) as { error?: string }
      if (!r.ok) setErr(j.error || 'Kill falhou')
      load()
    } catch {
      setErr('Kill falhou')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      {err && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </p>
      )}

      <p className="text-[11px] text-zinc-500 border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
        Isolamento: o mesmo <strong className="text-zinc-400">domínio de landing</strong> não pode estar ativo em duas
        UNIs (bloqueio na criação/edição de campanhas). Proxies são gravados no pool (senha cifrada). Esteira AdsPower
        completa continua em Geo-Provision; aqui pode criar <em>rascunho</em> com proxy manual.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-900/60 border border-sky-800 px-3 py-2 text-sm text-sky-100"
        >
          <Plus className="w-4 h-4" />
          Nova UNI (rascunho)
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1100px]">
            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left p-2 w-8" />
                <th className="text-left p-2">Estado</th>
                <th className="text-left p-2">UNI</th>
                <th className="text-left p-2">Proxy</th>
                <th className="text-left p-2">Domínio</th>
                <th className="text-right p-2">Camp.</th>
                <th className="text-left p-2">Risco</th>
                <th className="text-left p-2">Ativação</th>
                <th className="text-left p-2">IP / rede</th>
                <th className="text-right p-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-zinc-500">
                    Sem UNIs.
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <Fragment key={u.id}>
                    <tr className="hover:bg-zinc-900/40">
                      <td className="p-1">
                        <button
                          type="button"
                          className="p-1 text-zinc-500"
                          onClick={() => setExpanded((x) => (x === u.id ? null : u.id))}
                          aria-label="Expandir"
                        >
                          {expanded === u.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="p-2">
                        <span className="text-zinc-300">{u.status}</span>
                        {u.killedAt && (
                          <div className="text-[10px] text-red-400">Kill-switch</div>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="text-zinc-100 font-medium">{u.displayName || u.gmailMasked}</div>
                        <div className="text-[10px] text-zinc-600">
                          {u.gmailMasked} · {u.cnpjMasked}
                        </div>
                      </td>
                      <td className="p-2 font-mono text-zinc-400 text-[10px]">{u.proxyEndpoint || '—'}</td>
                      <td className="p-2 text-zinc-500 max-w-[120px] truncate" title={u.primaryDomainHost || ''}>
                        {u.primaryDomainHost || '—'}
                      </td>
                      <td className="p-2 text-right text-zinc-300">{u.campaignsCount}</td>
                      <td className="p-2">
                        <span
                          className={
                            u.riskLevel === 'HIGH'
                              ? 'text-red-400'
                              : u.riskLevel === 'LOW'
                                ? 'text-emerald-400'
                                : 'text-amber-200/80'
                          }
                        >
                          {u.riskLevel}
                        </span>
                        {u.suggestProxyRotation && (
                          <div className="text-[10px] text-amber-400 flex items-center gap-0.5 mt-0.5">
                            <ShieldAlert className="w-3 h-3" />
                            Rotação?
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-zinc-500 whitespace-nowrap">
                        {new Date(u.activationAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${healthDot(u.ipHealth)}`} />
                          <span className="text-zinc-400">{u.ipHealthLabel}</span>
                        </div>
                        {u.lastProxyProbeAt && (
                          <div className="text-[10px] text-zinc-600">
                            {u.lastProxyProbeOk === true ? `${u.lastProxyProbeMs ?? '?'} ms` : 'falha'} ·{' '}
                            {new Date(u.lastProxyProbeAt).toLocaleString('pt-BR')}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={!!u.killedAt || busy === `probe:${u.id}`}
                          onClick={() => void probe(u.id)}
                          className="text-sky-400 hover:underline disabled:opacity-30"
                        >
                          <Network className="w-3.5 h-3.5 inline" /> Ping
                        </button>
                        <button
                          type="button"
                          onClick={() => setDepsId(u.id)}
                          className="text-zinc-400 hover:underline"
                        >
                          <GitBranch className="w-3.5 h-3.5 inline" /> Deps
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivityId(u.id)}
                          className="text-zinc-400 hover:underline"
                        >
                          <Activity className="w-3.5 h-3.5 inline" /> Log
                        </button>
                        <button
                          type="button"
                          disabled={!!u.killedAt || busy === `kill:${u.id}`}
                          onClick={() => void kill(u.id)}
                          className="text-red-400 hover:underline disabled:opacity-30"
                        >
                          <Skull className="w-3.5 h-3.5 inline" /> Kill
                        </button>
                      </td>
                    </tr>
                    {expanded === u.id && (
                      <tr className="bg-zinc-950/80">
                        <td colSpan={10} className="p-4 text-[11px] text-zinc-400 space-y-2 border-b border-zinc-800">
                          <p className="text-zinc-500 font-semibold text-[10px] uppercase">Isolamento de cabeçalhos (sugestão para o edge)</p>
                          <p>
                            <span className="text-zinc-500">Accept-Language:</span>{' '}
                            <code className="text-zinc-300 break-all">{u.headerIsolation.suggestedAcceptLanguage}</code>
                          </p>
                          <p>
                            <span className="text-zinc-500">User-Agent (derivado da UNI):</span>
                          </p>
                          <pre className="text-[10px] font-mono text-zinc-300 bg-black/40 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                            {u.headerIsolation.suggestedUserAgent}
                          </pre>
                          <p className="text-zinc-600">
                            Timezone: {u.timezoneIana || '—'} · Locale: {u.preferredLocale || '—'} · AdsPower:{' '}
                            {u.adsPowerProfileId || '—'}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <button
                              type="button"
                              className="text-xs text-amber-400/90 hover:underline"
                              onClick={() => void loadRotationHint(u.id)}
                            >
                              Avaliar rotação de proxy (24h)
                            </button>
                            {!u.killedAt && (
                              <button
                                type="button"
                                className="text-xs text-sky-400 hover:underline"
                                onClick={() => setEditId(u.id)}
                              >
                                Editar metadados
                              </button>
                            )}
                          </div>
                          {rotationHint?.uniId === u.id && expanded === u.id && (
                            <p className="text-[10px] text-amber-200/80 border border-amber-900/40 rounded p-2 mt-2">
                              {rotationHint.text}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && <CreateUniModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load() }} />}

      {editId && <EditUniModal uniId={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load() }} />}

      {depsId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setDepsId(null)}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-100">Mapa de dependências</h3>
            {!deps && <p className="text-xs text-zinc-500">A carregar…</p>}
            {deps && (
              <>
                <p className="text-[10px] text-zinc-500">{(deps as { offersNote?: string }).offersNote}</p>
                <h4 className="text-xs text-zinc-400">Campanhas</h4>
                <ul className="text-xs space-y-1 font-mono text-zinc-300">
                  {((deps as { campaigns?: { id: string; name: string; domainHost: string }[] }).campaigns || []).map((c) => (
                    <li key={c.id}>
                      {c.name} · {c.domainHost}
                    </li>
                  ))}
                </ul>
                <h4 className="text-xs text-zinc-400">Landings (cofre) por host</h4>
                <ul className="text-xs space-y-1 text-zinc-300">
                  {((deps as { landings?: { id: string; name: string; matchedHost: string }[] }).landings || []).map((l) => (
                    <li key={l.id}>
                      {l.name} → {l.matchedHost}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="w-full py-2 rounded-lg bg-zinc-800 text-sm" onClick={() => setDepsId(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {activityId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setActivityId(null)}>
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-100">Log da unidade</h3>
            <ul className="text-xs space-y-2 text-zinc-400">
              {activity.length === 0 && <li className="text-zinc-600">Sem entradas.</li>}
              {activity.map((l) => (
                <li key={l.id} className="border-b border-zinc-800/80 pb-2">
                  <span className="text-[10px] text-zinc-600">{new Date(l.createdAt).toLocaleString('pt-BR')}</span>
                  <div className="text-zinc-300">{l.message}</div>
                  <span className="text-[10px] text-zinc-500">{l.kind}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="w-full py-2 rounded-lg bg-zinc-800 text-sm" onClick={() => setActivityId(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditUniModal({
  uniId,
  onClose,
  onSaved,
}: {
  uniId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [primaryDomain, setPrimaryDomain] = useState('')
  const [tz, setTz] = useState('')
  const [loc, setLoc] = useState('')
  const [risk, setRisk] = useState('MEDIUM')
  const [headersJson, setHeadersJson] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/ads-tracker/unis/${uniId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { uni?: Record<string, unknown> } | null) => {
        const u = j?.uni
        if (u) {
          setDisplayName(String(u.displayName || ''))
          setPrimaryDomain(String(u.primaryDomainHost || ''))
          setTz(String(u.timezoneIana || ''))
          setLoc(String(u.preferredLocale || ''))
          setRisk(String(u.riskLevel || 'MEDIUM'))
          setHeadersJson(
            u.customHeadersJson != null ? JSON.stringify(u.customHeadersJson, null, 2) : ''
          )
        }
      })
      .finally(() => setLoading(false))
  }, [uniId])

  async function save() {
    setFormErr(null)
    let parsed: unknown = undefined
    if (headersJson.trim()) {
      try {
        parsed = JSON.parse(headersJson) as unknown
      } catch {
        setFormErr('JSON de cabeçalhos inválido')
        return
      }
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/admin/ads-tracker/unis/${uniId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          primaryDomainHost: primaryDomain.trim() || null,
          timezoneIana: tz.trim() || null,
          preferredLocale: loc.trim() || null,
          riskLevel: risk,
          customHeadersJson: headersJson.trim() ? parsed : null,
        }),
      })
      const j = (await r.json()) as { error?: string }
      if (!r.ok) {
        setFormErr(j.error || 'Falha')
        return
      }
      onSaved()
    } catch {
      setFormErr('Falha ao guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-100">Editar UNI</h3>
        {formErr && <p className="text-xs text-red-400">{formErr}</p>}
        {loading ? (
          <p className="text-xs text-zinc-500">A carregar…</p>
        ) : (
          <>
            <label className="block text-xs text-zinc-400 space-y-1">
              Nome
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400 space-y-1">
              Domínio principal
              <input
                value={primaryDomain}
                onChange={(e) => setPrimaryDomain(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm font-mono text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-zinc-400 space-y-1">
                Timezone
                <input
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-zinc-400 space-y-1">
                Locale
                <input
                  value={loc}
                  onChange={(e) => setLoc(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="block text-xs text-zinc-400 space-y-1">
              Risco
              <select
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-400 space-y-1">
              Cabeçalhos JSON (edge / Gerson)
              <textarea
                value={headersJson}
                onChange={(e) => setHeadersJson(e.target.value)}
                rows={5}
                placeholder='{"Accept-Language":"pt-BR,pt;q=0.9"}'
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-xs font-mono text-white"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800">
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="px-4 py-2 rounded-lg bg-sky-800 text-white disabled:opacity-40"
              >
                Guardar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CreateUniModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [cat, setCat] = useState<{
    gmails: { id: string; emailMasked: string }[]
    cnpjs: { id: string; cnpjMasked: string; nicheLabel: string | null }[]
    identities: { id: string; nameMasked: string }[]
    proxies: { id: string; endpoint: string; label: string | null }[]
  } | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [gmailId, setGmailId] = useState('')
  const [cnpjId, setCnpjId] = useState('')
  const [identityId, setIdentityId] = useState('')
  const [primaryDomain, setPrimaryDomain] = useState('')
  const [tz, setTz] = useState('America/Sao_Paulo')
  const [loc, setLoc] = useState('pt-BR')
  const [risk, setRisk] = useState('MEDIUM')
  const [useNewProxy, setUseNewProxy] = useState(true)
  const [matchedProxyId, setMatchedProxyId] = useState('')
  const [pxHost, setPxHost] = useState('')
  const [pxPort, setPxPort] = useState('8080')
  const [pxUser, setPxUser] = useState('')
  const [pxPass, setPxPass] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/ads-tracker/unis/catalog')
      .then((r) => (r.ok ? r.json() : null))
      .then(setCat)
      .catch(() => setCat(null))
  }, [])

  async function submit() {
    setFormErr(null)
    if (!gmailId || !cnpjId) {
      setFormErr('Selecione Gmail e CNPJ do cofre.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        displayName: displayName.trim() || undefined,
        inventoryGmailId: gmailId,
        inventoryCnpjId: cnpjId,
        identityInventoryId: identityId.trim() || null,
        primaryDomainHost: primaryDomain.trim() || null,
        timezoneIana: tz.trim() || null,
        preferredLocale: loc.trim() || null,
        riskLevel: risk,
      }
      if (useNewProxy) {
        if (!pxHost.trim()) {
          setFormErr('Host do proxy obrigatório (ou desmarque e escolha proxy existente).')
          setSaving(false)
          return
        }
        body.newProxy = {
          host: pxHost.trim(),
          port: pxPort,
          user: pxUser.trim() || null,
          password: pxPass || null,
        }
      } else if (matchedProxyId) {
        body.matchedProxyId = matchedProxyId
      }
      const r = await fetch('/api/admin/ads-tracker/unis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = (await r.json()) as { error?: string; note?: string }
      if (!r.ok) {
        setFormErr(j.error || 'Falha')
        return
      }
      if (j.note) alert(j.note)
      onCreated()
    } catch {
      setFormErr('Falha ao criar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-100">Nova UNI (rascunho)</h3>
        {formErr && <p className="text-xs text-red-400">{formErr}</p>}
        <label className="block text-xs text-zinc-400 space-y-1">
          Nome da unidade
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Operação Nutra — Conta 05"
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-400 space-y-1">
          Gmail (cofre)
          <select
            value={gmailId}
            onChange={(e) => setGmailId(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
          >
            <option value="">—</option>
            {(cat?.gmails || []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.emailMasked}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-400 space-y-1">
          CNPJ (cofre)
          <select
            value={cnpjId}
            onChange={(e) => setCnpjId(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
          >
            <option value="">—</option>
            {(cat?.cnpjs || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.cnpjMasked} {c.nicheLabel ? `· ${c.nicheLabel}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-400 space-y-1">
          Identidade (opcional)
          <select
            value={identityId}
            onChange={(e) => setIdentityId(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
          >
            <option value="">—</option>
            {(cat?.identities || []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.nameMasked}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-400 space-y-1">
          Domínio principal (blindado)
          <input
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            placeholder="lander-conta05.example.com"
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm font-mono text-white"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-400 space-y-1">
            Timezone (IANA)
            <input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 space-y-1">
            Locale
            <input
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
            />
          </label>
        </div>
        <label className="block text-xs text-zinc-400 space-y-1">
          Risco
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={useNewProxy} onChange={(e) => setUseNewProxy(e.target.checked)} />
          Criar proxy novo (Hospeda / manual)
        </label>
        {useNewProxy ? (
          <div className="space-y-2 border border-zinc-800 rounded-lg p-3">
            <input
              placeholder="IP / host"
              value={pxHost}
              onChange={(e) => setPxHost(e.target.value)}
              className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm font-mono"
            />
            <input
              placeholder="Porta"
              value={pxPort}
              onChange={(e) => setPxPort(e.target.value)}
              className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm font-mono"
            />
            <input
              placeholder="Utilizador (opcional)"
              value={pxUser}
              onChange={(e) => setPxUser(e.target.value)}
              className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="Senha (opcional)"
              type="password"
              value={pxPass}
              onChange={(e) => setPxPass(e.target.value)}
              className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm"
            />
          </div>
        ) : (
          <select
            value={matchedProxyId}
            onChange={(e) => setMatchedProxyId(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm text-white"
          >
            <option value="">— sem proxy —</option>
            {(cat?.proxies || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.endpoint} {p.label ? `· ${p.label}` : ''}
              </option>
            ))}
          </select>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="px-4 py-2 rounded-lg bg-sky-800 text-white disabled:opacity-40"
          >
            {saving ? 'A criar…' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}
