'use client'

import { useCallback, useEffect, useState } from 'react'
import { Cable, ClipboardList, Factory, Server } from 'lucide-react'

type Overview = {
  generatedAt: string
  adsPowerLocalApiReachable: boolean
  cofre: { gmailsAvailable: number; cnpjs: number; identities: number; cards: number }
  uni: { draft: number; provisioning: number; readyForWarmup: number; failed: number; total: number }
  proxyPool: { activeEntries: number }
}

type WarmupLotRow = {
  id: string
  name: string
  nicheTag: string | null
  status: string
  internalMaturityPct: number
  unitCount: number
  updatedAt: string
}

type UnitRow = {
  id: string
  status: string
  adsPowerProfileId: string | null
  geoTransition: boolean
  gmailMasked: string
  cnpjMasked: string
  nicheLabel: string | null
  provisionError: string | null
  warmupLotId: string | null
  warmupLot: {
    id: string
    name: string
    status: string
    internalMaturityPct: number
  } | null
}

type CheckItem = { id: string; label: string; ok: boolean; detail?: string }

type OperatorKit = {
  unit: {
    id: string
    status: string
    daysSinceProvisioned: number
    adsPowerProfileId: string | null
    geoTransition: boolean
    gmailMasked: string
    cnpjMasked: string
    razaoSocial: string | null
    nicheLabel: string | null
    provisionError: string | null
    warmupLotId: string | null
    warmupLot: {
      id: string
      name: string
      status: string
      internalMaturityPct: number
    } | null
  }
  checklist: CheckItem[]
  summary: {
    readinessPct: number
    requiredOk: boolean
    greenLightOperational: boolean
    note: string
  }
  documentDownloadUrl: string | null
}

export function Module02PipelineStrip({ rev = 0 }: { rev?: number }) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [units, setUnits] = useState<UnitRow[]>([])
  const [warmupLots, setWarmupLots] = useState<WarmupLotRow[]>([])
  const [selUnit, setSelUnit] = useState('')
  const [assignLotId, setAssignLotId] = useState<string>('')
  const [assignSaving, setAssignSaving] = useState(false)
  const [newLotName, setNewLotName] = useState('')
  const [newLotNiche, setNewLotNiche] = useState('')
  const [lotCreating, setLotCreating] = useState(false)
  const [lotPctDraft, setLotPctDraft] = useState<Record<string, string>>({})
  const [kit, setKit] = useState<OperatorKit | null>(null)
  const [loading, setLoading] = useState(true)
  const [kitLoading, setKitLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const loadBase = useCallback(() => {
    setLoading(true)
    setErr(null)
    Promise.all([
      fetch('/api/admin/geo-provision/pipeline-overview').then((r) => {
        if (!r.ok) throw new Error('overview')
        return r.json() as Promise<Overview>
      }),
      fetch('/api/admin/geo-provision/units?take=50').then((r) => {
        if (!r.ok) throw new Error('units')
        return r.json() as Promise<{ units: UnitRow[] }>
      }),
      fetch('/api/admin/warmup-lots').then((r) => {
        if (!r.ok) throw new Error('warmup-lots')
        return r.json() as Promise<{ lots: WarmupLotRow[] }>
      }),
    ])
      .then(([o, u, wl]) => {
        setOverview(o)
        setUnits(u.units || [])
        setWarmupLots(wl.lots || [])
      })
      .catch(() => setErr('Não foi possível carregar o pipeline Módulo 02'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadBase()
  }, [loadBase, rev])

  useEffect(() => {
    const u = units.find((x) => x.id === selUnit)
    setAssignLotId(u?.warmupLotId || '')
  }, [selUnit, units])

  useEffect(() => {
    if (!selUnit) {
      setKit(null)
      return
    }
    setKitLoading(true)
    fetch(`/api/admin/geo-provision/units/${selUnit}/operator-kit`)
      .then((r) => {
        if (!r.ok) throw new Error('kit')
        return r.json() as Promise<OperatorKit>
      })
      .then(setKit)
      .catch(() => setKit(null))
      .finally(() => setKitLoading(false))
  }, [selUnit])

  async function saveUnitLot() {
    if (!selUnit) return
    setAssignSaving(true)
    try {
      const r = await fetch(`/api/admin/geo-provision/units/${selUnit}/warmup-lot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warmupLotId: assignLotId ? assignLotId : null,
        }),
      })
      if (!r.ok) throw new Error('assign')
      const list = await fetch('/api/admin/geo-provision/units?take=50').then((res) => {
        if (!res.ok) throw new Error('units')
        return res.json() as Promise<{ units: UnitRow[] }>
      })
      setUnits(list.units || [])
      const lotsR = await fetch('/api/admin/warmup-lots')
      if (lotsR.ok) {
        const j = (await lotsR.json()) as { lots: WarmupLotRow[] }
        setWarmupLots(j.lots || [])
      }
      const k = await fetch(`/api/admin/geo-provision/units/${selUnit}/operator-kit`)
      if (k.ok) setKit((await k.json()) as OperatorKit)
    } catch {
      setErr('Falha ao associar UNI ao lote')
    } finally {
      setAssignSaving(false)
    }
  }

  async function createLot() {
    const name = newLotName.trim()
    if (!name) return
    setLotCreating(true)
    try {
      const r = await fetch('/api/admin/warmup-lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          nicheTag: newLotNiche.trim() || null,
        }),
      })
      if (!r.ok) throw new Error('create')
      setNewLotName('')
      setNewLotNiche('')
      const wl = await fetch('/api/admin/warmup-lots').then((res) => {
        if (!res.ok) throw new Error('warmup-lots')
        return res.json() as Promise<{ lots: WarmupLotRow[] }>
      })
      setWarmupLots(wl.lots || [])
    } catch {
      setErr('Falha ao criar lote')
    } finally {
      setLotCreating(false)
    }
  }

  async function updateLotPct(lotId: string) {
    const raw = lotPctDraft[lotId]
    const n = raw === undefined || raw === '' ? NaN : Number(raw)
    if (!Number.isFinite(n)) return
    try {
      const r = await fetch(`/api/admin/warmup-lots/${lotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalMaturityPct: n }),
      })
      if (!r.ok) throw new Error('patch')
      const wl = await fetch('/api/admin/warmup-lots').then((res) => {
        if (!res.ok) throw new Error('warmup-lots')
        return res.json() as Promise<{ lots: WarmupLotRow[] }>
      })
      setWarmupLots(wl.lots || [])
    } catch {
      setErr('Falha ao atualizar maturidade do lote')
    }
  }

  return (
    <section id="module02" className="rounded-2xl border border-cyan-900/50 bg-slate-900/50 p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-cyan-300">
          <Cable className="w-5 h-5" />
          <h2 className="text-sm font-semibold tracking-wide uppercase">Módulo 02 — Ponte de comando</h2>
        </div>
        {loading ? (
          <span className="text-xs text-slate-500">A carregar…</span>
        ) : (
          <span className="text-xs text-slate-500">
            AdsPower local:{' '}
            <span className={overview?.adsPowerLocalApiReachable ? 'text-emerald-400' : 'text-amber-400'}>
              {overview?.adsPowerLocalApiReachable ? 'alcançável' : 'offline / URL'}
            </span>
          </span>
        )}
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {overview && (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
              <Server className="w-3 h-3" /> Cofre (Módulo 01)
            </p>
            <p className="text-2xl font-mono text-slate-100">{overview.cofre.gmailsAvailable}</p>
            <p className="text-[11px] text-slate-500 mt-1">Gmails AVAILABLE (paráveis em UNI)</p>
            <p className="text-xs text-slate-400 mt-2">
              CNPJs: <span className="font-mono text-slate-200">{overview.cofre.cnpjs}</span> · IDs:{' '}
              <span className="font-mono text-slate-200">{overview.cofre.identities}</span> · Cartões:{' '}
              <span className="font-mono text-slate-200">{overview.cofre.cards}</span>
            </p>
          </div>
          <div className="rounded-xl border border-amber-900/40 bg-slate-950/80 p-4">
            <p className="text-[10px] uppercase tracking-wider text-amber-600/90 mb-2">Esteira UNI</p>
            <p className="text-2xl font-mono text-amber-100">{overview.uni.readyForWarmup}</p>
            <p className="text-[11px] text-slate-500 mt-1">READY_FOR_WARMUP (perfil AdsPower + proxy)</p>
            <p className="text-xs text-slate-400 mt-2">
              A provisionar: <span className="font-mono">{overview.uni.provisioning}</span> · Falhas:{' '}
              <span className="font-mono text-red-300">{overview.uni.failed}</span>
            </p>
          </div>
          <div className="rounded-xl border border-sky-900/40 bg-slate-950/80 p-4">
            <p className="text-[10px] uppercase tracking-wider text-sky-500 mb-2">Pool / infra</p>
            <p className="text-2xl font-mono text-sky-100">{overview.proxyPool.activeEntries}</p>
            <p className="text-[11px] text-slate-500 mt-1">Proxies ativos no pool Geo-Provision</p>
            <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">
              Próximo passo comercial (Módulo 03) pode usar um estado próprio no produto; aqui medimos apenas a
              esteira técnica já existente.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-emerald-900/40 bg-slate-950/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-emerald-300 text-sm">
          <Factory className="w-4 h-4" />
          <span className="font-semibold tracking-wide uppercase text-[11px]">
            Módulo 04 — Lotes operacionais (aquecimento / escala)
          </span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Agrupe UNIs em lotes com estado e maturidade operacional interna (0–100%). Isto é gestão de processo no ERP,
          sem integração a “trust score” de anúncios nem liberação automática de tráfego.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            type="text"
            placeholder="Nome do lote (ex.: Lote 01 — Nutra)"
            value={newLotName}
            onChange={(e) => setNewLotName(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Etiqueta nicho (opcional)"
            value={newLotNiche}
            onChange={(e) => setNewLotNiche(e.target.value)}
            className="w-44 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={lotCreating || !newLotName.trim()}
            onClick={() => void createLot()}
            className="rounded-lg bg-emerald-900/60 hover:bg-emerald-800/70 disabled:opacity-40 px-3 py-2 text-sm text-emerald-100"
          >
            {lotCreating ? 'A criar…' : 'Criar lote'}
          </button>
        </div>
        {warmupLots.length === 0 ? (
          <p className="text-xs text-slate-600">Ainda não há lotes. Crie o primeiro acima.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {warmupLots.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-black/25 px-3 py-2"
              >
                <span className="text-slate-200 font-medium">{l.name}</span>
                <span className="text-[11px] text-slate-500">{l.status}</span>
                {l.nicheTag && <span className="text-[11px] text-violet-400">{l.nicheTag}</span>}
                <span className="text-[11px] text-slate-500 ml-auto">{l.unitCount} UNI(s)</span>
                <label className="flex items-center gap-1 text-[11px] text-slate-400">
                  Maturidade %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder={String(l.internalMaturityPct)}
                    value={lotPctDraft[l.id] ?? ''}
                    onChange={(e) => setLotPctDraft((d) => ({ ...d, [l.id]: e.target.value }))}
                    className="w-16 rounded bg-slate-950 border border-slate-700 px-1 py-0.5 font-mono text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void updateLotPct(l.id)}
                  className="text-[11px] text-sky-400 hover:text-sky-300"
                >
                  Guardar %
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-3">
        <div className="flex items-center gap-2 text-slate-300 text-sm">
          <ClipboardList className="w-4 h-4 text-violet-400" />
          <span>Kit operador &amp; checklist (prontidão operacional)</span>
        </div>
        <select
          value={selUnit}
          onChange={(e) => setSelUnit(e.target.value)}
          className="w-full max-w-xl rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
        >
          <option value="">— Selecionar UNI recente —</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.status} · {u.gmailMasked} · {u.cnpjMasked}
              {u.warmupLot ? ` · ${u.warmupLot.name}` : ''}
              {u.adsPowerProfileId ? ` · AP#${u.adsPowerProfileId}` : ''}
            </option>
          ))}
        </select>

        {selUnit && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <span className="text-xs text-slate-500">Lote desta UNI:</span>
            <select
              value={assignLotId}
              onChange={(e) => setAssignLotId(e.target.value)}
              className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-sm min-w-[200px]"
            >
              <option value="">— Sem lote —</option>
              {warmupLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.status})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={assignSaving}
              onClick={() => void saveUnitLot()}
              className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-3 py-1 text-xs text-slate-100"
            >
              {assignSaving ? 'A guardar…' : 'Guardar lote'}
            </button>
          </div>
        )}

        {kitLoading && <p className="text-xs text-slate-500">A carregar checklist…</p>}

        {kit && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-black/30 p-4 text-sm space-y-2">
              <p className="text-xs text-slate-500">
                Dias desde provisionamento:{' '}
                <span className="text-slate-200 font-mono">{kit.unit.daysSinceProvisioned}</span>
              </p>
              <p className="text-slate-300">
                {kit.unit.gmailMasked} · {kit.unit.cnpjMasked}
              </p>
              {kit.unit.razaoSocial && <p className="text-xs text-slate-500">{kit.unit.razaoSocial}</p>}
              {kit.unit.nicheLabel && (
                <p className="text-xs text-violet-300">Nicho: {kit.unit.nicheLabel}</p>
              )}
              {kit.unit.warmupLot && (
                <p className="text-xs text-emerald-400/90">
                  Lote: {kit.unit.warmupLot.name} · {kit.unit.warmupLot.status} · maturidade{' '}
                  {kit.unit.warmupLot.internalMaturityPct}%
                </p>
              )}
              {kit.unit.adsPowerProfileId && (
                <p className="text-xs font-mono text-emerald-300 break-all">
                  AdsPower user_id: {kit.unit.adsPowerProfileId}
                </p>
              )}
              {kit.unit.provisionError && (
                <p className="text-xs text-red-400">Erro: {kit.unit.provisionError}</p>
              )}
              <div
                className={`mt-2 inline-flex rounded-lg px-2 py-1 text-xs font-medium ${
                  kit.summary.greenLightOperational
                    ? 'bg-emerald-950 text-emerald-200 border border-emerald-800'
                    : 'bg-amber-950 text-amber-200 border border-amber-800'
                }`}
              >
                Green light operacional: {kit.summary.greenLightOperational ? 'SIM' : 'NÃO'} ·{' '}
                {kit.summary.readinessPct}% itens OK
              </div>
              <p className="text-[10px] text-slate-600 leading-relaxed">{kit.summary.note}</p>
            </div>
            <ul className="space-y-2 text-sm">
              {kit.checklist.map((c) => (
                <li
                  key={c.id}
                  className={`flex gap-2 rounded-lg border px-3 py-2 ${
                    c.ok ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-slate-700 bg-slate-950/50'
                  }`}
                >
                  <span className="shrink-0">{c.ok ? '✓' : '○'}</span>
                  <span>
                    <span className={c.ok ? 'text-emerald-200' : 'text-slate-300'}>{c.label}</span>
                    {c.detail && (
                      <span className="block text-[11px] text-slate-500 font-mono break-all">{c.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {kit?.documentDownloadUrl && (
          <a
            href={kit.documentDownloadUrl}
            className="inline-flex text-sm text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
          >
            Descarregar documento tratado (identidade desta UNI)
          </a>
        )}
      </div>
    </section>
  )
}
