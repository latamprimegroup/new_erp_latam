'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Crosshair, Globe, Radio, RefreshCw, Shield, Sparkles, X } from 'lucide-react'
import { Joyride, STATUS, type EventData, type Step } from 'react-joyride'

const TOUR_KEY = 'ads_war_room_tour_v1'
const NEON = '#00FF00'
const BG = '#0A0A0A'

type WarRoomJson = {
  client: {
    id: string
    trustLevelStars: number | null
    operationNiche: string | null
    widgetNiche: string | null
  }
  kpis: {
    uniSummary: {
      assigned: number
      ready: boolean
      allKilled: boolean
      label: string
    }
    googleAdsAssets: number
    ecosystemRoiAvgBrl: number | null
  }
  unis: {
    id: string
    displayName: string
    status: string
    readiness: { ready: boolean; label: string }
    primaryDomainHost: string | null
    proxyMasked: string
    proxyProvider: string | null
    fingerprint: string
    gmailMasked: string
    cnpjMasked: string
    lastProxyProbeOk: boolean | null
    killedAt: string | null
  }[]
  contingencyPing: { at: string | null; ok: boolean | null; latencyMs: number | null }
  eliteFeed: { id: string; kind: 'creative' | 'shield' | 'ops'; title: string; detail: string; createdAt: string }[]
}

const tourSteps: Step[] = [
  {
    target: '[data-tour="war-hero"]',
    content: 'Aqui é o centro da sua operação: inicie o protocolo e mantenha a identidade isolada.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="war-kpis"]',
    content: 'Estado da UNI, contas Google Ads associadas ao seu perfil e média do ecossistema (referência).',
    placement: 'top',
  },
  {
    target: '[data-tour="war-unis"]',
    content: 'Proxy mascarado e fingerprint simulado — o servidor de borda aplica a política; não exponha IPs reais em grupos.',
    placement: 'top',
  },
  {
    target: '[data-tour="war-feed"]',
    content: 'Últimas da guerra: criativos, Shield e avisos operacionais. Vamos faturar?',
    placement: 'left',
  },
]

export function AdsWarRoomClient({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [data, setData] = useState<WarRoomJson | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [runTour, setRunTour] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)

  const load = useCallback(() => {
    setErr(null)
    fetch('/api/cliente/ads-war-room')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<WarRoomJson>
      })
      .then(setData)
      .catch(() => setErr('Não foi possível carregar a War Room.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(() => load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem(TOUR_KEY)) {
      const id = window.setTimeout(() => setRunTour(true), 900)
      return () => clearTimeout(id)
    }
  }, [])

  const joyrideOnEvent = (data: EventData) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      localStorage.setItem(TOUR_KEY, '1')
      setRunTour(false)
    }
  }

  const pingLabel = () => {
    if (!data?.contingencyPing.at) return 'Sem ping recente'
    const dt = new Date(data.contingencyPing.at)
    const ok = data.contingencyPing.ok
    const ms = data.contingencyPing.latencyMs
    return `${ok === false ? 'Alerta' : 'OK'} · ${dt.toLocaleString('pt-BR')}${ms != null ? ` · ${ms}ms` : ''}`
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] text-zinc-100" style={{ backgroundColor: BG }}>
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        scrollToFirstStep
        locale={{
          back: 'Voltar',
          close: 'Fechar',
          last: 'Concluir',
          next: 'Seguinte',
          skip: 'Saltar tour',
        }}
        options={{
          showProgress: true,
          buttons: ['back', 'close', 'primary', 'skip'],
          primaryColor: NEON,
          textColor: '#e4e4e7',
          backgroundColor: '#111111',
          arrowColor: '#111111',
          overlayColor: 'rgba(0,0,0,0.88)',
          zIndex: 10050,
        }}
        styles={{
          buttonPrimary: { backgroundColor: NEON, color: BG, fontWeight: 700 },
          buttonBack: { color: NEON },
          buttonSkip: { color: '#71717a' },
        }}
        onEvent={joyrideOnEvent}
      />

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: NEON }}>
              Módulo 01 · Ads Ativos
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Crosshair className="w-8 h-8 shrink-0 opacity-90" style={{ color: NEON }} />
              War Room
            </h1>
            <p className="text-sm text-zinc-500 mt-2 max-w-xl">
              Olá, <span className="text-zinc-300">{userName}</span> — identidade isolada, tráfego com disciplina.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                load()
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(TOUR_KEY)
                setRunTour(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:text-[#00FF00] hover:border-[#00FF00]/40"
            >
              <Sparkles className="w-4 h-4" />
              Tour guiado
            </button>
          </div>
        </header>

        {err && (
          <p className="text-sm text-red-400 border border-red-900/50 rounded-lg px-4 py-3 bg-red-950/20">{err}</p>
        )}

        <section
          data-tour="war-hero"
          className="relative overflow-hidden rounded-2xl border border-zinc-800 p-8 sm:p-10"
          style={{
            background: `linear-gradient(135deg, #111 0%, ${BG} 50%, #0f1a0f 100%)`,
            boxShadow: `0 0 60px rgba(0, 255, 0, 0.06)`,
          }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none bg-[#00FF00]" />
          <div className="relative max-w-2xl space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Protocolo 15 minutos: iniciar operação</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Assistente rápido para não saltar identidade, UNI e primeiro anúncio. O Google cruza sinais — aqui você
              mantém o isolamento profissional.
            </p>
            <button
              type="button"
              onClick={() => {
                setWizardOpen(true)
                setWizardStep(0)
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold transition-transform hover:scale-[1.02] active:scale-[0.99]"
              style={{ backgroundColor: NEON, color: BG }}
            >
              Iniciar assistente
            </button>
          </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div data-tour="war-kpis" className="grid sm:grid-cols-3 gap-4">
              <KpiCard
                label="UNI (identidade)"
                value={data?.kpis.uniSummary.label ?? '—'}
                sub={data ? `${data.kpis.uniSummary.assigned} unidade(s)` : ''}
                accent={!!(data && data.kpis.uniSummary.ready && !data.kpis.uniSummary.allKilled)}
              />
              <KpiCard
                label="Saldo de ativos"
                value={data ? String(data.kpis.googleAdsAssets) : '—'}
                sub="Contas Google Ads no seu perfil"
                accent
              />
              <KpiCard
                label="ROI médio (ecossistema)"
                value={
                  data?.kpis.ecosystemRoiAvgBrl != null
                    ? `R$ ${data.kpis.ecosystemRoiAvgBrl.toFixed(2)}`
                    : '—'
                }
                sub="Vendas validadas (referência)"
                accent={false}
              />
            </div>

            <div
              className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-xs text-zinc-400"
              data-tour="war-ping"
            >
              <Radio className="w-4 h-4 shrink-0" style={{ color: NEON }} />
              <span>
                <strong className="text-zinc-300">Contingência / edge:</strong> {pingLabel()}
              </span>
            </div>

            <section data-tour="war-unis" className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-2">
                <Shield className="w-4 h-4" style={{ color: NEON }} />
                Unidades de identidade (UNI)
              </h3>
              {!data || data.unis.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6 text-sm text-zinc-500">
                  Nenhuma UNI atribuída à sua conta. O comercial liga a sua War Room à unidade correta — fale com o
                  suporte se já tiver conta entregue.
                  <div className="mt-4">
                    <Link
                      href="/dashboard/cliente/suporte"
                      className="text-[#00FF00] font-medium hover:underline"
                    >
                      Abrir suporte
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="space-y-4">
                  {data.unis.map((u) => (
                    <li
                      key={u.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-white">{u.displayName}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${
                            u.killedAt
                              ? 'border-red-800 text-red-300 bg-red-950/40'
                              : u.readiness.ready
                                ? 'border-emerald-800 text-emerald-300 bg-emerald-950/30'
                                : 'border-amber-800 text-amber-200 bg-amber-950/20'
                          }`}
                        >
                          {u.killedAt ? 'Kill-switch' : u.readiness.label}
                        </span>
                      </div>
                      <dl className="grid sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <dt className="text-zinc-500">Proxy dedicado (mascarado)</dt>
                          <dd className="font-mono text-zinc-200 mt-0.5">{u.proxyMasked}</dd>
                          {u.proxyProvider && (
                            <dd className="text-zinc-600 mt-0.5">Fornecedor: {u.proxyProvider}</dd>
                          )}
                        </div>
                        <div>
                          <dt className="text-zinc-500">Fingerprint (simulado)</dt>
                          <dd className="text-zinc-300 mt-0.5 leading-snug">{u.fingerprint}</dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Gmail / CNPJ (mascarados)</dt>
                          <dd className="text-zinc-400 mt-0.5">
                            {u.gmailMasked} · {u.cnpjMasked}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Domínio operacional</dt>
                          <dd className="text-zinc-300 mt-0.5">{u.primaryDomainHost || '— (definir com suporte)'}</dd>
                        </div>
                      </dl>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Link
                          href="/dashboard/cliente/landing"
                          className="inline-flex items-center gap-2 rounded-lg border border-[#00FF00]/35 bg-[#00FF00]/5 px-3 py-2 text-xs font-semibold text-[#00FF00] hover:bg-[#00FF00]/10"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          Vincular / blindar domínio (Fábrica de Landings)
                        </Link>
                        <Link
                          href="/dashboard/cliente/suporte"
                          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-white"
                        >
                          Pedir domínio ao time
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="text-[10px] text-zinc-600">
              Nível de confiança operacional: {data?.client.trustLevelStars ?? '—'}
              /5 (definido pelo time Ads Ativos). Nicho: {data?.client.operationNiche || data?.client.widgetNiche || '—'}
            </p>
          </div>

          <aside
            data-tour="war-feed"
            className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 h-fit lg:sticky lg:top-24"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: NEON }} />
              Últimas da guerra
            </h3>
            <ul className="space-y-4">
              {(data?.eliteFeed ?? []).map((f) => (
                <li key={f.id} className="text-sm border-l-2 pl-3 border-zinc-700 hover:border-[#00FF00]/60 transition-colors">
                  <p className="font-medium text-zinc-200">{f.title}</p>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{f.detail}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>

      {wizardOpen && (
        <div className="fixed inset-0 z-[10040] flex items-center justify-center p-4 bg-black/80">
          <div
            className="w-full max-w-lg rounded-2xl border border-zinc-800 p-6 shadow-2xl"
            style={{ backgroundColor: '#111' }}
          >
            <div className="flex justify-between items-start gap-4 mb-4">
              <h4 className="text-lg font-bold text-white">Protocolo 15 minutos</h4>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm text-zinc-400 space-y-4 min-h-[140px]">
              {wizardStep === 0 && (
                <p>
                  Passo 1/4 — Confirme que está na War Room com a conta correta ({userEmail}). Toda operação deve
                  respeitar a UNI atribuída; não misture browsers pessoais com o perfil de anúncio.
                </p>
              )}
              {wizardStep === 1 && (
                <p>
                  Passo 2/4 — Verifique o estado da UNI e o proxy mascarado. Se estiver em provisionamento, aguarde o
                  time ou abra suporte antes de gastar mídia.
                </p>
              )}
              {wizardStep === 2 && (
                <p>
                  Passo 3/4 — GTM e conversões: configure em{' '}
                  <Link href="/dashboard/cliente/gtm" className="text-[#00FF00] underline">
                    GTM &amp; Conversões
                  </Link>{' '}
                  para o Google receber sinais consistentes com a sua landing.
                </p>
              )}
              {wizardStep === 3 && (
                <p>
                  Passo 4/4 — Pronto para escalar: use{' '}
                  <Link href="/dashboard/cliente/solicitar" className="text-[#00FF00] underline">
                    Solicitar contas
                  </Link>{' '}
                  se precisar de mais ativos. Boa operação.
                </p>
              )}
            </div>
            <div className="flex justify-between mt-6 gap-2">
              <button
                type="button"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-800 disabled:opacity-30"
              >
                Voltar
              </button>
              {wizardStep < 3 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => s + 1)}
                  className="px-4 py-2 rounded-lg text-sm font-bold"
                  style={{ backgroundColor: NEON, color: BG }}
                >
                  Seguinte
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setWizardOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-bold"
                  style={{ backgroundColor: NEON, color: BG }}
                >
                  Concluir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? 'border-[#00FF00]/25 bg-[#00FF00]/[0.04]' : 'border-zinc-800 bg-zinc-950/50'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-white mt-2 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-1">{sub}</p>}
    </div>
  )
}
