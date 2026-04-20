'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Globe, Shield, Terminal, Upload, Warehouse } from 'lucide-react'
import { WarehouseAlmoxarifadoStatus } from './WarehouseAlmoxarifadoStatus'
import { Module02PipelineStrip } from './Module02PipelineStrip'

type TerminalLine = { id: string; ts: string; text: string; tone: 'info' | 'ok' | 'err' }

type CatalogPayload = {
  gmails: { id: string; emailMasked: string }[]
  cnpjs: {
    id: string
    cnpjMasked: string
    cidade: string | null
    nicheLabel?: string | null
    nicheInferred?: string | null
    nicheOperatorTag?: string | null
  }[]
  identities: { id: string; nameMasked: string; cpfMasked: string }[]
}

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function pushLog(
  set: Dispatch<SetStateAction<TerminalLine[]>>,
  text: string,
  tone: TerminalLine['tone'] = 'info'
) {
  const ts = new Date().toLocaleTimeString('pt-BR', { hour12: false })
  set((prev) => [...prev.slice(-200), { id: nowId(), ts, text, tone }])
}

function TerminalPanel({
  title,
  accentClass,
  lines,
}: {
  title: string
  accentClass: string
  lines: TerminalLine[]
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-black/50 p-5">
      <h2 className={`text-sm font-semibold flex items-center gap-2 mb-3 ${accentClass}`}>
        <Terminal className="w-4 h-4" />
        {title}
      </h2>
      <div className="h-56 overflow-y-auto rounded-lg bg-slate-950 border border-slate-800 p-3 font-mono text-xs space-y-1">
        {lines.length === 0 ? (
          <p className="text-slate-600">Aguardando operações…</p>
        ) : (
          lines.map((l) => (
            <div
              key={l.id}
              className={
                l.tone === 'ok' ? 'text-emerald-400' : l.tone === 'err' ? 'text-red-400' : 'text-slate-300'
              }
            >
              <span className="text-slate-600">[{l.ts}]</span> {l.text}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export function GatekeeperAlmoxarifadoClient() {
  const [bulkText, setBulkText] = useState('')
  const [safra, setSafra] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [cnpjNicheTagNew, setCnpjNicheTagNew] = useState('')
  const [cnpjNicheFilter, setCnpjNicheFilter] = useState('')
  const [cnpjTagDraft, setCnpjTagDraft] = useState('')
  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [cardPan, setCardPan] = useState('')
  const [holderName, setHolderName] = useState('')
  const [logs, setLogs] = useState<TerminalLine[]>([])
  const [geoLogs, setGeoLogs] = useState<TerminalLine[]>([])
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null)
  const [selGmail, setSelGmail] = useState('')
  const [selCnpj, setSelCnpj] = useState('')
  const [selIdentity, setSelIdentity] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [partnerBirth, setPartnerBirth] = useState('')
  const [pxProvider, setPxProvider] = useState('bright_data')
  const [pxCity, setPxCity] = useState('')
  const [pxUf, setPxUf] = useState('')
  const [pxDdd, setPxDdd] = useState('')
  const [pxHost, setPxHost] = useState('')
  const [pxPort, setPxPort] = useState('')
  const [pxUser, setPxUser] = useState('')
  const [pxPass, setPxPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusRev, setStatusRev] = useState(0)
  const docInputRef = useRef<HTMLInputElement>(null)
  const hashTestRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/geo-provision/catalog')
      .then((r) => r.json())
      .then((d: CatalogPayload) => setCatalog(d))
      .catch(() => setCatalog({ gmails: [], cnpjs: [], identities: [] }))
  }, [])

  const filteredCnpjs = useMemo(() => {
    const list = catalog?.cnpjs || []
    const q = cnpjNicheFilter.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => (c.nicheLabel || '').toLowerCase().includes(q))
  }, [catalog?.cnpjs, cnpjNicheFilter])

  useEffect(() => {
    if (!selCnpj || !catalog?.cnpjs) {
      setCnpjTagDraft('')
      return
    }
    const c = catalog.cnpjs.find((x) => x.id === selCnpj)
    setCnpjTagDraft(c?.nicheOperatorTag ?? '')
  }, [selCnpj, catalog])

  const runBulkGmails = useCallback(async () => {
    setBusy(true)
    pushLog(setLogs, 'Gatekeeper: iniciando ingestão em massa de Gmails…', 'info')
    try {
      const res = await fetch('/api/admin/gatekeeper/gmails/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulkText, gmailSafra: safra || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        pushLog(setLogs, j.error || 'Falha na ingestão', 'err')
        return
      }
      pushLog(setLogs, `Processadas ${j.logs?.length ?? 0} entradas — importadas: ${j.imported ?? 0}`, 'ok')
      for (const row of j.logs || []) {
        pushLog(setLogs, `${row.emailMasked} → ${row.message}`, row.ok ? 'ok' : 'err')
      }
    } catch {
      pushLog(setLogs, 'Erro de rede', 'err')
    } finally {
      setBusy(false)
      setStatusRev((n) => n + 1)
    }
  }, [bulkText, safra])

  const runCnpj = useCallback(async () => {
    setBusy(true)
    pushLog(setLogs, 'Validando CNPJ na Brasil API…', 'info')
    try {
      const res = await fetch('/api/admin/gatekeeper/cnpjs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj,
          nicheOperatorTag: cnpjNicheTagNew.trim() || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      for (const l of j.logs || []) {
        pushLog(setLogs, l.step, l.ok ? 'ok' : 'err')
      }
      if (!res.ok) {
        pushLog(setLogs, j.error || 'Bloqueado', 'err')
        return
      }
      pushLog(
        setLogs,
        `Cofre CNPJ: ${j.record?.cnpjMasked} — Nicho: ${j.record?.nicheInferred || '—'}`,
        'ok'
      )
      const cat = await fetch('/api/admin/geo-provision/catalog').then((r) => r.json())
      setCatalog(cat)
    } catch {
      pushLog(setLogs, 'Erro de rede', 'err')
    } finally {
      setBusy(false)
      setStatusRev((n) => n + 1)
    }
  }, [cnpj, cnpjNicheTagNew])

  const saveCnpjNicheTag = useCallback(async () => {
    if (!selCnpj) {
      pushLog(setGeoLogs, 'Selecione um CNPJ no cofre', 'err')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/gatekeeper/cnpjs/${selCnpj}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheOperatorTag: cnpjTagDraft.trim() || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        pushLog(setGeoLogs, j.error || 'Falha ao salvar tag', 'err')
        return
      }
      pushLog(setGeoLogs, `Tag de nicho salva: ${j.nicheLabel || '—'}`, 'ok')
      const cat = await fetch('/api/admin/geo-provision/catalog').then((r) => r.json())
      setCatalog(cat)
    } catch {
      pushLog(setGeoLogs, 'Erro de rede', 'err')
    } finally {
      setBusy(false)
      setStatusRev((n) => n + 1)
    }
  }, [selCnpj, cnpjTagDraft])

  const runIdDoc = useCallback(async () => {
    const input = docInputRef.current?.files?.[0]
    if (!input) {
      pushLog(setLogs, 'Selecione um arquivo de documento', 'err')
      return
    }
    setBusy(true)
    pushLog(setLogs, 'Enviando documento ao Gatekeeper (EXIF + hash-killer)…', 'info')
    try {
      const fd = new FormData()
      fd.set('fullName', fullName)
      fd.set('cpf', cpf)
      fd.set('file', input)
      const res = await fetch('/api/admin/gatekeeper/ids', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      for (const l of j.logs || []) {
        pushLog(setLogs, l.step, l.ok ? 'ok' : 'err')
      }
      if (!res.ok) {
        pushLog(setLogs, j.error || 'Bloqueado', 'err')
        return
      }
      pushLog(setLogs, `ID cofre: CPF mascarado ${j.record?.cpfMasked}`, 'ok')
      const cat = await fetch('/api/admin/geo-provision/catalog').then((r) => r.json())
      setCatalog(cat)
    } catch {
      pushLog(setLogs, 'Erro de rede', 'err')
    } finally {
      setBusy(false)
      setStatusRev((n) => n + 1)
    }
  }, [fullName, cpf])

  const runCard = useCallback(async () => {
    setBusy(true)
    pushLog(setLogs, 'Ingestão de cartão (PAN cifrado)…', 'info')
    try {
      const res = await fetch('/api/admin/gatekeeper/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan: cardPan, holderName: holderName || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      for (const l of j.logs || []) {
        pushLog(setLogs, l.step, l.ok ? 'ok' : 'err')
      }
      if (!res.ok) {
        pushLog(setLogs, j.error || 'Bloqueado', 'err')
        return
      }
      pushLog(setLogs, `Cartão cofre: ${j.record?.panMasked}`, 'ok')
    } catch {
      pushLog(setLogs, 'Erro de rede', 'err')
    } finally {
      setBusy(false)
      setStatusRev((n) => n + 1)
    }
  }, [cardPan, holderName])

  const runHashTest = useCallback(async () => {
    const input = hashTestRef.current?.files?.[0]
    if (!input) {
      pushLog(setLogs, 'Selecione imagem para teste Hash-Killer', 'err')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('file', input)
      const res = await fetch('/api/admin/gatekeeper/image-test', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      for (const l of j.logs || []) {
        pushLog(setLogs, l.step, l.ok ? 'ok' : 'err')
      }
      if (j.md5Before && j.md5After) {
        pushLog(setLogs, `MD5 referência: ${j.md5Before.slice(0, 12)}… → vault: ${j.md5After.slice(0, 12)}…`, 'ok')
      }
    } catch {
      pushLog(setLogs, 'Erro de rede', 'err')
    } finally {
      setBusy(false)
    }
  }, [])

  const runGeoProvision = useCallback(async () => {
    if (!selGmail || !selCnpj) {
      pushLog(setGeoLogs, 'Selecione Gmail e CNPJ do cofre', 'err')
      return
    }
    setBusy(true)
    pushLog(setGeoLogs, 'Criando Perfil AdsPower (UNI) — esteira industrial…', 'info')
    try {
      const res = await fetch('/api/admin/geo-provision/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryGmailId: selGmail,
          inventoryCnpjId: selCnpj,
          identityInventoryId: selIdentity || undefined,
          partnerLegalName: partnerName.trim() || undefined,
          partnerBirthDate: partnerBirth.trim() || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      for (const line of j.logs || []) {
        pushLog(setGeoLogs, String(line), 'info')
      }
      if (!res.ok) {
        pushLog(setGeoLogs, j.error || 'Falha na esteira', 'err')
        return
      }
      pushLog(
        setGeoLogs,
        `Concluído: ads_power_id ${j.adsPowerProfileId} — status UNI READY_FOR_WARMUP`,
        'ok'
      )
      if (j.geoTransition) {
        pushLog(setGeoLogs, 'GEO_TRANSITION: IP/estado — cumprir janela de transição 48h', 'info')
      }
      const cat = await fetch('/api/admin/geo-provision/catalog').then((r) => r.json())
      setCatalog(cat)
    } catch {
      pushLog(setGeoLogs, 'Erro de rede', 'err')
    } finally {
      setBusy(false)
      setStatusRev((n) => n + 1)
    }
  }, [selGmail, selCnpj, selIdentity, partnerName, partnerBirth])

  const saveProxy = useCallback(async () => {
    if (!pxHost.trim() || !pxPort.trim()) {
      pushLog(setGeoLogs, 'Host e porta do proxy são obrigatórios', 'err')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/geo-provision/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: pxProvider,
          city: pxCity.trim() || null,
          stateUf: pxUf.trim() || null,
          ddd: pxDdd.trim() || null,
          proxyHost: pxHost.trim(),
          proxyPort: pxPort.trim(),
          proxyUser: pxUser.trim() || null,
          proxyPassword: pxPass.trim() || null,
          proxySoft: 'other',
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        pushLog(setGeoLogs, j.error || 'Erro ao salvar proxy', 'err')
        return
      }
      pushLog(setGeoLogs, `Pool: proxy cadastrado (${j.id})`, 'ok')
      setPxPass('')
    } catch {
      pushLog(setGeoLogs, 'Erro de rede', 'err')
    } finally {
      setBusy(false)
    }
  }, [pxProvider, pxCity, pxUf, pxDdd, pxHost, pxPort, pxUser, pxPass])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-[1800px] mx-auto space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-500/90 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              War Room OS — Módulos 01 &amp; 02
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold mt-2 flex items-center gap-2">
              <Warehouse className="w-8 h-8 text-emerald-400" />
              Canvas Almoxarifado
            </h1>
            <p className="text-slate-400 mt-2 max-w-2xl text-sm leading-relaxed">
              Coluna 1: Gatekeeper (ingestão). Coluna 2: Geo-Provision (AdsPower + proxy geográfico + UNI).
            </p>
          </div>
          <Link
            href="/dashboard/admin/war-room"
            className="text-sm text-emerald-400 hover:text-emerald-300 underline-offset-4 hover:underline"
          >
            ← War Room
          </Link>
        </header>

        <WarehouseAlmoxarifadoStatus rev={statusRev} />

        <Module02PipelineStrip rev={statusRev} />

        <div className="grid xl:grid-cols-2 gap-10 items-start">
          {/* Coluna 1 — Gatekeeper */}
          <div className="space-y-6">
            <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Agente Core Ingest</h2>
            <div className="grid sm:grid-cols-2 gap-6">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Upload className="w-5 h-5 text-sky-400" />
                  Bulk Gmail
                </h3>
                <p className="text-xs text-slate-500">
                  <code className="text-slate-300">email:password</code>,{' '}
                  <code className="text-slate-300">email:senha:recuperacao@email.com</code>, ou linha TAB com JSON de
                  cookies (array EditThisCookie — exige SID e HSID).
                </p>
                <input
                  value={safra}
                  onChange={(e) => setSafra(e.target.value)}
                  placeholder="Safra (opcional — ex. 2014 ou Safra 2014 para Vovôs)"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                />
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={6}
                  placeholder={'conta@gmail.com:senha\nconta2@gmail.com:senha2:recovery@outlook.com'}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={runBulkGmails}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
                >
                  Enviar lote
                </button>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                <h3 className="text-lg font-medium">CNPJ (Brasil API)</h3>
                <input
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                />
                <input
                  value={cnpjNicheTagNew}
                  onChange={(e) => setCnpjNicheTagNew(e.target.value)}
                  placeholder="Tag nicho ao gravar (opcional — ex. Nutra, Estética)"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={runCnpj}
                  className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
                >
                  Validar e gravar cofre
                </button>
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <p className="text-xs text-slate-500">Hash-Killer (teste)</p>
                  <input ref={hashTestRef} type="file" accept="image/*" className="text-xs text-slate-400" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={runHashTest}
                    className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-1.5 text-xs"
                  >
                    Rodar scrub + MD5
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                <h3 className="text-lg font-medium">ID + documento</h3>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                />
                <input
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="CPF (11 dígitos)"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                />
                <input ref={docInputRef} type="file" accept="image/*" className="text-xs text-slate-400" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={runIdDoc}
                  className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
                >
                  Limpar EXIF e gravar
                </button>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                <h3 className="text-lg font-medium">Cartão</h3>
                <input
                  value={cardPan}
                  onChange={(e) => setCardPan(e.target.value)}
                  placeholder="PAN"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm font-mono"
                />
                <input
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="Nome impresso (opcional)"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={runCard}
                  className="rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
                >
                  Cifrar e gravar
                </button>
              </section>
            </div>
            <TerminalPanel title="Gatekeeper Terminal" accentClass="text-emerald-400" lines={logs} />
          </div>

          {/* Coluna 2 — Geo-Provision */}
          <div className="space-y-6">
            <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Agente Geo-Provision
            </h2>
            <section className="rounded-2xl border border-cyan-900/40 bg-slate-900/40 p-5 space-y-4">
              <p className="text-xs text-slate-500">
                Exige AdsPower Local API acessível a este servidor e proxies no pool alinhados à cidade/UF do CNPJ.
              </p>
              <label className="block text-xs text-slate-400">Gmail cofre (AVAILABLE)</label>
              <select
                value={selGmail}
                onChange={(e) => setSelGmail(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              >
                <option value="">— selecione —</option>
                {(catalog?.gmails || []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.emailMasked}
                  </option>
                ))}
              </select>
              <label className="block text-xs text-slate-400">Filtrar CNPJs por nicho (texto)</label>
              <input
                value={cnpjNicheFilter}
                onChange={(e) => setCnpjNicheFilter(e.target.value)}
                placeholder="Ex.: Nutra, Saúde, Estética…"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm mb-2"
              />
              <label className="block text-xs text-slate-400">CNPJ cofre</label>
              <select
                value={selCnpj}
                onChange={(e) => setSelCnpj(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              >
                <option value="">— selecione —</option>
                {filteredCnpjs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cnpjMasked}
                    {c.cidade ? ` — ${c.cidade}` : ''}
                    {c.nicheLabel ? ` · ${c.nicheLabel}` : ''}
                  </option>
                ))}
              </select>
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <input
                  value={cnpjTagDraft}
                  onChange={(e) => setCnpjTagDraft(e.target.value)}
                  placeholder="Tag nicho do CNPJ selecionado"
                  className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !selCnpj}
                  onClick={saveCnpjNicheTag}
                  className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-2 text-xs whitespace-nowrap"
                >
                  Salvar tag
                </button>
              </div>
              <label className="block text-xs text-slate-400">Identidade cofre (opcional — sócio / DOB)</label>
              <select
                value={selIdentity}
                onChange={(e) => setSelIdentity(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              >
                <option value="">— nenhuma —</option>
                {(catalog?.identities || []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nameMasked} / {i.cpfMasked}
                  </option>
                ))}
              </select>
              <input
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="Nome do sócio (atualiza cofre se preenchido)"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              />
              <input
                value={partnerBirth}
                onChange={(e) => setPartnerBirth(e.target.value)}
                placeholder="Nascimento (YYYY-MM-DD)"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy}
                onClick={runGeoProvision}
                className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 text-sm font-medium w-full"
              >
                Executar esteira (AdsPower + proxy + identidade)
              </button>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
              <h3 className="text-sm font-medium text-slate-300">Pool de proxies (manual / Bright Data / Asdl)</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  value={pxProvider}
                  onChange={(e) => setPxProvider(e.target.value)}
                  placeholder="provider"
                  className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                />
                <input
                  value={pxDdd}
                  onChange={(e) => setPxDdd(e.target.value)}
                  placeholder="DDD"
                  className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                />
                <input
                  value={pxCity}
                  onChange={(e) => setPxCity(e.target.value)}
                  placeholder="Cidade"
                  className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                />
                <input
                  value={pxUf}
                  onChange={(e) => setPxUf(e.target.value)}
                  placeholder="UF"
                  className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                />
                <input
                  value={pxHost}
                  onChange={(e) => setPxHost(e.target.value)}
                  placeholder="host"
                  className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                />
                <input
                  value={pxPort}
                  onChange={(e) => setPxPort(e.target.value)}
                  placeholder="porta"
                  className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                />
                <input
                  value={pxUser}
                  onChange={(e) => setPxUser(e.target.value)}
                  placeholder="usuário"
                  className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs sm:col-span-2"
                />
                <input
                  value={pxPass}
                  onChange={(e) => setPxPass(e.target.value)}
                  placeholder="senha (cifrada no banco)"
                  type="password"
                  className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs sm:col-span-2"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={saveProxy}
                className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-1.5 text-xs"
              >
                Adicionar ao pool
              </button>
            </section>

            <TerminalPanel title="Geo-Provision Terminal (esteira industrial)" accentClass="text-cyan-400" lines={geoLogs} />
          </div>
        </div>
      </div>
    </div>
  )
}
