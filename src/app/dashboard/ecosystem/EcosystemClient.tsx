'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Save,
  Upload,
  ExternalLink,
  Shield,
  Radio,
  CreditCard,
  Server,
} from 'lucide-react'
import { suggestComplianceFooter } from '@/lib/landing-injections'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Overview = {
  profile: {
    globalTrackingScript: string | null
    complianceFooterDefault: string | null
  }
  multilogin: { adsPowerStartUrlTemplate: string; dolphinStartUrlTemplate: string }
  operationCards: Array<{
    accountId: string
    status: string
    loginGoogle: string | null
    proxyHealth: 'green' | 'yellow' | 'red'
    landerUrl: string | null
    proxyNote: string | null
    warmUp: { phase: string; label: string; day: number; maxDays: number }
  }>
  domains: Array<{
    id: string
    domain: string
    sslStatus: string
    sslHealth: 'green' | 'yellow' | 'red'
  }>
  landingPages: Array<{
    id: string
    status: string
    templateMode: string
    briefing: { id: string; nomeEmpresa: string; nomeFantasia: string | null } | null
  }>
  briefings: Array<{
    id: string
    nomeEmpresa: string
    cidade: string
    estado: string
    cnpj: string | null
    templateMode: string
    vturbEmbed: string | null
    footerHtml: string | null
    status: string
  }>
  consolidatedRows: Array<{
    pageId: string
    briefingLabel: string
    pageStatus: string
    templateMode: string
    domain: string
    ssl: string
    hosting: string
    landingUrl: string
    updatedAt: string
  }>
  vccHub: { message: string }
  whmFootprint: { message: string }
}

function Dot({ level }: { level: 'green' | 'yellow' | 'red' }) {
  const cls =
    level === 'green'
      ? 'bg-emerald-500'
      : level === 'yellow'
        ? 'bg-amber-400'
        : 'bg-red-500'
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} title={level} />
}

export function EcosystemClient() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [tracking, setTracking] = useState('')
  const [footerDefault, setFooterDefault] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [briefingId, setBriefingId] = useState<string | null>(null)
  const [bTemplate, setBTemplate] = useState<'WHITE' | 'BLACK'>('WHITE')
  const [bVturb, setBVturb] = useState('')
  const [bFooter, setBFooter] = useState('')
  const [savingBriefing, setSavingBriefing] = useState(false)

  const [pageId, setPageId] = useState<string | null>(null)
  const [pageHtml, setPageHtml] = useState('')
  const [pageCss, setPageCss] = useState('')
  const [loadingPage, setLoadingPage] = useState(false)
  const [savingPage, setSavingPage] = useState(false)
  const [pageTracking, setPageTracking] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/cliente/ecosystem/overview')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d as Overview)
        setTracking(d.profile?.globalTrackingScript ?? '')
        setFooterDefault(d.profile?.complianceFooterDefault ?? '')
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selectedBriefing = useMemo(
    () => data?.briefings.find((b) => b.id === briefingId) ?? null,
    [data, briefingId],
  )

  useEffect(() => {
    if (selectedBriefing) {
      setBTemplate(selectedBriefing.templateMode === 'BLACK' ? 'BLACK' : 'WHITE')
      setBVturb(selectedBriefing.vturbEmbed ?? '')
      setBFooter(selectedBriefing.footerHtml ?? '')
    }
  }, [selectedBriefing])

  useEffect(() => {
    if (!pageId) {
      setPageHtml('')
      setPageCss('')
      setPageTracking('')
      return
    }
    setLoadingPage(true)
    fetch(`/api/cliente/landing-pages/${pageId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        const p = d.page
        setPageHtml(p.html ?? '')
        setPageCss(p.css ?? '')
        setPageTracking(p.pageTrackingScript ?? '')
      })
      .catch(() => setPageHtml(''))
      .finally(() => setLoadingPage(false))
  }, [pageId])

  async function saveProfile() {
    setSavingProfile(true)
    setErr('')
    try {
      const res = await fetch('/api/cliente/ecosystem/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalTrackingScript: tracking || null,
          complianceFooterDefault: footerDefault || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erro ao guardar')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveBriefingPatch() {
    if (!briefingId) return
    setSavingBriefing(true)
    setErr('')
    try {
      const res = await fetch(`/api/cliente/landing-briefing/${briefingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateMode: bTemplate,
          vturbEmbed: bVturb,
          footerHtml: bFooter,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erro ao guardar briefing')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSavingBriefing(false)
    }
  }

  function applyComplianceSuggestion() {
    const b = selectedBriefing
    if (!b) return
    setBFooter(
      suggestComplianceFooter({
        nomeEmpresa: b.nomeEmpresa,
        cnpj: b.cnpj,
        cidade: b.cidade,
        estado: b.estado,
      }),
    )
  }

  async function savePage() {
    if (!pageId) return
    setSavingPage(true)
    setErr('')
    try {
      const res = await fetch(`/api/cliente/landing-pages/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: pageHtml,
          css: pageCss || null,
          pageTrackingScript: pageTracking || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erro ao guardar página')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSavingPage(false)
    }
  }

  async function onVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/cliente/video-process', { method: 'POST', body: fd })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error || 'FFmpeg indisponível no servidor')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'video-sem-metadados.mp4'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" /> A carregar ecossistema…
      </div>
    )
  }

  if (!data) {
    return <p className="text-red-400">{err || 'Sem dados'}</p>
  }

  return (
    <div className="space-y-10">
      {err ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">{err}</div>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
        <div className="mb-4 flex items-center gap-2 text-zinc-100">
          <Radio className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Cards de operação</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.operationCards.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma conta entregue ainda.</p>
          ) : (
            data.operationCards.map((c) => (
              <div
                key={c.accountId}
                className="rounded-lg border border-zinc-800 bg-black/40 p-4 shadow-inner"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-zinc-500">Conta</span>
                  <Dot level={c.proxyHealth} />
                </div>
                <p className="truncate font-mono text-sm text-zinc-200">{c.loginGoogle || '—'}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Aquecimento: <span className="text-amber-300">{c.warmUp.label}</span>
                </p>
                {c.landerUrl ? (
                  <a
                    href={c.landerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
                  >
                    Lander <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-zinc-600">Lander: configurar no Ads Core / produção</p>
                )}
                {c.proxyNote ? (
                  <p className="mt-1 text-[11px] text-zinc-500">{c.proxyNote}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Multilogin local — AdsPower:{' '}
          <code className="rounded bg-zinc-900 px-1 text-[10px]">{data.multilogin.adsPowerStartUrlTemplate}</code>{' '}
          · Dolphin:{' '}
          <code className="rounded bg-zinc-900 px-1 text-[10px]">{data.multilogin.dolphinStartUrlTemplate}</code>
        </p>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-zinc-100">Tracking global e compliance</h2>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Scripts UTMify / Redtrack replicados nas novas gerações de landing (com GTM do cliente).
        </p>
        <label className="block text-xs text-zinc-400">Tracking global (HTML/scripts)</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-black/50 px-3 py-2 font-mono text-xs text-zinc-200"
          rows={4}
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="<!-- UTMify / Redtrack -->"
        />
        <label className="mt-3 block text-xs text-zinc-400">Rodapé padrão (CNPJ / políticas)</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-black/50 px-3 py-2 text-sm text-zinc-200"
          rows={2}
          value={footerDefault}
          onChange={(e) => setFooterDefault(e.target.value)}
        />
        <button
          type="button"
          onClick={saveProfile}
          disabled={savingProfile}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar perfil
        </button>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Lander Builder (briefing)</h2>
        <p className="mb-4 text-xs text-zinc-500">
          White = institucional seguro · Black = oferta/VSL. Gere novamente a página na Fábrica para aplicar Vturb ao HTML.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-zinc-400">Briefing</label>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-black/50 px-3 py-2 text-sm text-zinc-200"
              value={briefingId ?? ''}
              onChange={(e) => setBriefingId(e.target.value || null)}
            >
              <option value="">— escolher —</option>
              {data.briefings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nomeEmpresa} ({b.status})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <span className="text-xs text-zinc-400">Modo</span>
              <div className="mt-1 flex rounded-lg border border-zinc-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setBTemplate('WHITE')}
                  className={`rounded px-3 py-1.5 text-xs ${
                    bTemplate === 'WHITE' ? 'bg-zinc-700 text-white' : 'text-zinc-500'
                  }`}
                >
                  White
                </button>
                <button
                  type="button"
                  onClick={() => setBTemplate('BLACK')}
                  className={`rounded px-3 py-1.5 text-xs ${
                    bTemplate === 'BLACK' ? 'bg-zinc-700 text-white' : 'text-zinc-500'
                  }`}
                >
                  Black
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={applyComplianceSuggestion}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Sugerir rodapé
            </button>
          </div>
        </div>
        <label className="mt-3 block text-xs text-zinc-400">Vturb / VSL (embed)</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-black/50 px-3 py-2 font-mono text-xs text-zinc-200"
          rows={4}
          value={bVturb}
          onChange={(e) => setBVturb(e.target.value)}
        />
        <label className="mt-3 block text-xs text-zinc-400">Rodapé compliance (HTML)</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-black/50 px-3 py-2 font-mono text-xs text-zinc-200"
          rows={3}
          value={bFooter}
          onChange={(e) => setBFooter(e.target.value)}
        />
        <button
          type="button"
          onClick={saveBriefingPatch}
          disabled={!briefingId || savingBriefing}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {savingBriefing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar briefing
        </button>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Editor HTML/CSS (Monaco)</h2>
        <p className="mb-4 text-xs text-zinc-500">Ajustes finos na página já gerada.</p>
        <div className="mb-3 flex flex-wrap gap-3">
          <select
            className="rounded-lg border border-zinc-800 bg-black/50 px-3 py-2 text-sm text-zinc-200"
            value={pageId ?? ''}
            onChange={(e) => setPageId(e.target.value || null)}
          >
            <option value="">— escolher página —</option>
            {data.landingPages.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.briefing?.nomeFantasia || p.briefing?.nomeEmpresa || p.id).slice(0, 40)} — {p.status}
              </option>
            ))}
          </select>
          {loadingPage ? <span className="text-xs text-zinc-500">A carregar…</span> : null}
        </div>
        {pageId ? (
          <>
            <div className="mb-2 h-[320px] overflow-hidden rounded-lg border border-zinc-800">
              <MonacoEditor
                height="320px"
                theme="vs-dark"
                path="page.html"
                defaultLanguage="html"
                value={pageHtml}
                onChange={(v) => setPageHtml(v ?? '')}
                options={{ minimap: { enabled: false }, wordWrap: 'on', fontSize: 12 }}
              />
            </div>
            <label className="mt-3 block text-xs text-zinc-400">CSS extra (opcional)</label>
            <div className="mb-2 h-[120px] overflow-hidden rounded-lg border border-zinc-800">
              <MonacoEditor
                height="120px"
                theme="vs-dark"
                path="page.css"
                defaultLanguage="css"
                value={pageCss}
                onChange={(v) => setPageCss(v ?? '')}
                options={{ minimap: { enabled: false }, fontSize: 12 }}
              />
            </div>
            <label className="mt-3 block text-xs text-zinc-400">Tracking só desta página</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-black/50 px-3 py-2 font-mono text-xs"
              rows={2}
              value={pageTracking}
              onChange={(e) => setPageTracking(e.target.value)}
            />
            <button
              type="button"
              onClick={savePage}
              disabled={savingPage}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {savingPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar página
            </button>
          </>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Tabela consolidada</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="py-2 pr-2">Página</th>
                <th className="py-2 pr-2">Domínio / SSL</th>
                <th className="py-2 pr-2">Hospedagem</th>
                <th className="py-2 pr-2">Lander</th>
                <th className="py-2">Modo</th>
              </tr>
            </thead>
            <tbody>
              {data.consolidatedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-zinc-500">
                    Gere páginas na Fábrica de Landing.
                  </td>
                </tr>
              ) : (
                data.consolidatedRows.map((row) => (
                  <tr key={row.pageId} className="border-b border-zinc-800/80">
                    <td className="py-2 pr-2">{row.briefingLabel}</td>
                    <td className="py-2 pr-2">
                      {row.domain}{' '}
                      <span className="text-zinc-600">· {row.ssl}</span>
                    </td>
                    <td className="py-2 pr-2">{row.hosting}</td>
                    <td className="py-2 pr-2 truncate max-w-[180px]">
                      {row.landingUrl !== '—' ? (
                        <a href={row.landingUrl} className="text-sky-400 hover:underline" target="_blank" rel="noreferrer">
                          abrir
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2">{row.templateMode}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
          <div className="mb-2 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-amber-300" />
            <h2 className="font-semibold text-zinc-100">VCC Hub</h2>
          </div>
          <p className="text-sm text-zinc-500">{data.vccHub.message}</p>
        </section>
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Server className="h-5 w-5 text-zinc-400" />
            <h2 className="font-semibold text-zinc-100">WHM / footprint</h2>
          </div>
          <p className="text-sm text-zinc-500">{data.whmFootprint.message}</p>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Upload className="h-5 w-5 text-zinc-400" />
          <h2 className="font-semibold text-zinc-100">Limpeza de vídeo (FFmpeg)</h2>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Remove metadados EXIF e reencode (novo hash). Requer FFmpeg no servidor (FFMPEG_PATH).
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900">
          <Upload className="h-4 w-4" />
          Enviar vídeo
          <input type="file" accept="video/*" className="hidden" onChange={onVideoUpload} />
        </label>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
        <h2 className="mb-2 font-semibold text-zinc-100">Domínios</h2>
        <ul className="space-y-2 text-sm">
          {data.domains.length === 0 ? (
            <li className="text-zinc-500">Nenhum domínio registado.</li>
          ) : (
            data.domains.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-zinc-300">
                <Dot level={d.sslHealth} />
                {d.domain} <span className="text-zinc-600">({d.sslStatus})</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}
