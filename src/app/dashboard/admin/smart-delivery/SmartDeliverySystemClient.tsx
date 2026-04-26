'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldCheck, RefreshCcw, Loader2, Save, Power,
  AlertTriangle, CheckCircle2, Clock, Users, Ban,
  ShieldAlert, KeyRound, Timer, Mail, Braces,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Settings = {
  kycAmountThreshold: number
  linkExpirationMinutes: number
  suspiciousEmailDomains: string
  adspowerProductMap: string
  utmifyToken: string
  globalKillSwitch: boolean
}

type Metrics = {
  kycAmountThreshold: number
  kycPendingCount: number
  killSwitchBlockCount: number
  shareAttemptCount: number
}

type ApiData = {
  settings: Settings
  metrics: Metrics
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
  sub?: string
}) {
  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 ${color}`}>
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function SmartDeliverySystemClient() {
  const [data, setData]         = useState<ApiData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Form state (carregado do backend)
  const [kycAmount, setKycAmount]               = useState('300')
  const [linkExpiry, setLinkExpiry]             = useState('60')
  const [suspDomains, setSuspDomains]           = useState('')
  const [adspowerMap, setAdspowerMap]           = useState('{}')
  const [utmifyToken, setUtmifyToken]           = useState('')
  const [killSwitch, setKillSwitch]             = useState(false)
  const [togglingKill, setTogglingKill]         = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/smart-delivery')
      if (!res.ok) throw new Error('Erro ao carregar')
      const json = (await res.json()) as ApiData
      setData(json)
      setKycAmount(String(json.settings.kycAmountThreshold))
      setLinkExpiry(String(json.settings.linkExpirationMinutes))
      setSuspDomains(json.settings.suspiciousEmailDomains)
      setAdspowerMap(json.settings.adspowerProductMap)
      setUtmifyToken(json.settings.utmifyToken)
      setKillSwitch(json.settings.globalKillSwitch)
    } catch {
      setError('Erro ao carregar configurações do SmartDelivery.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // Validar JSON do mapa AdsPower
      try { JSON.parse(adspowerMap) } catch {
        setError('JSON inválido no campo Mapa AdsPower.')
        setSaving(false)
        return
      }
      const res = await fetch('/api/admin/smart-delivery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kycAmountThreshold:    parseFloat(kycAmount) || 300,
          linkExpirationMinutes: parseInt(linkExpiry) || 60,
          suspiciousEmailDomains: suspDomains,
          adspowerProductMap: adspowerMap,
          utmifyToken: utmifyToken || undefined,
        }),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const toggleKillSwitch = async () => {
    setTogglingKill(true)
    try {
      const res = await fetch('/api/admin/smart-delivery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalKillSwitch: !killSwitch }),
      })
      if (res.ok) {
        setKillSwitch(!killSwitch)
        await load()
      }
    } finally {
      setTogglingKill(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Carregando SmartDelivery System...
      </div>
    )
  }

  const m = data?.metrics

  return (
    <div className="space-y-8">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" />
            SmartDelivery System
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Regras de gatilho KYC, antifraude, blacklist e aprovação manual — Visão CEO
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-white/15 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Atualizar painel
          </button>

          {/* Kill Switch Global */}
          <button
            onClick={toggleKillSwitch}
            disabled={togglingKill}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
              killSwitch
                ? 'bg-red-600 border-red-600 text-white hover:bg-red-700'
                : 'border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-950/20 hover:border-red-400 dark:hover:border-red-700'
            }`}
          >
            {togglingKill ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Power className="w-4 h-4" />
            )}
            {killSwitch ? '🔴 Kill Switch ATIVO' : '⚪ Kill Switch OFF'}
          </button>
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          label="Limite Atual KYC"
          value={brl(m?.kycAmountThreshold ?? 300)}
          icon={KeyRound}
          color="border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300"
        />
        <MetricCard
          label="KYC Pendentes"
          value={String(m?.kycPendingCount ?? 0)}
          sub="checkouts acima do limiar"
          icon={Clock}
          color={
            (m?.kycPendingCount ?? 0) > 0
              ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300'
              : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400'
          }
        />
        <MetricCard
          label="Bloqueios Kill Switch"
          value={String(m?.killSwitchBlockCount ?? 0)}
          sub="clientes bloqueados"
          icon={Ban}
          color={
            (m?.killSwitchBlockCount ?? 0) > 0
              ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
              : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400'
          }
        />
        <MetricCard
          label="Tentativas de Compartilhamento"
          value={String(m?.shareAttemptCount ?? 0)}
          sub="CPFs com múltiplos checkouts"
          icon={Users}
          color={
            (m?.shareAttemptCount ?? 0) > 0
              ? 'border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300'
              : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400'
          }
        />
      </div>

      {/* Kill Switch Warning */}
      {killSwitch && (
        <div className="rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-950/30 px-5 py-4 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
          <div>
            <p className="font-bold text-red-700 dark:text-red-300">Kill Switch Global ATIVO</p>
            <p className="text-sm text-red-600 dark:text-red-400">Todos os novos checkouts PIX estão bloqueados. Desative quando a situação estiver normalizada.</p>
          </div>
        </div>
      )}

      {/* Formulário de configurações */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-6 space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Configuração Global de Segurança</h2>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* KYC Threshold */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              Exigir verificação para vendas acima de (BRL)
            </label>
            <input
              type="number"
              min={0}
              step={50}
              value={kycAmount}
              onChange={(e) => setKycAmount(e.target.value)}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              Permitido: R$ 15 — R$ 120 min (padrão 60)
            </p>
          </div>

          {/* Link Expiration */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              <Timer className="w-3.5 h-3.5" />
              Link Expiration Time (minutos)
            </label>
            <input
              type="number"
              min={15}
              max={120}
              step={5}
              value={linkExpiry}
              onChange={(e) => setLinkExpiry(e.target.value)}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              Intervalo permitido: 15 a 120 minutos (padrão 60)
            </p>
          </div>

          {/* Utmify Token */}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Novo Token Utmify (opcional)
            </label>
            <input
              type="text"
              value={utmifyToken}
              onChange={(e) => setUtmifyToken(e.target.value)}
              placeholder="Deixe em branco para manter atual"
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition font-mono"
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              Token atual: <span className="font-mono">{data?.settings.utmifyToken ? `${data.settings.utmifyToken.slice(0, 8)}…` : 'não definido (usa UTMIFY_API_TOKEN do .env)'}</span>
            </p>
          </div>

          {/* Domínios suspeitos */}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              <Mail className="w-3.5 h-3.5" />
              Domínios suspeitos de e-mail (1 por linha)
            </label>
            <textarea
              rows={5}
              value={suspDomains}
              onChange={(e) => setSuspDomains(e.target.value)}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white font-mono placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition resize-y"
            />
          </div>

          {/* Mapa AdsPower */}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              <Braces className="w-3.5 h-3.5" />
              Mapa Product ID — Group ID AdsPower (JSON)
            </label>
            <textarea
              rows={4}
              value={adspowerMap}
              onChange={(e) => setAdspowerMap(e.target.value)}
              placeholder='{  "produto_slug": "adspower_group_id" }'
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white font-mono placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition resize-y"
            />
          </div>
        </div>

        {/* Botão salvar */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-white/10">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            As configurações são aplicadas imediatamente em novos checkouts.
          </p>
          <button
            onClick={save}
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50'
            }`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar configurações'}
          </button>
        </div>
      </div>

      {/* Nota informativa */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-semibold">ℹ️ Sobre o SmartDelivery System</p>
        <p><strong>KYC Threshold</strong>: checkouts acima deste valor ficam pendentes até revisão manual.</p>
        <p><strong>Kill Switch Global</strong>: bloqueia imediatamente TODOS os novos checkouts PIX. Use em emergências.</p>
        <p><strong>Domínios suspeitos</strong>: e-mails desses domínios são sinalizados automaticamente como risco alto.</p>
        <p><strong>Mapa AdsPower</strong>: vincula slugs de produto a grupos do AdsPower para automação de entrega.</p>
      </div>
    </div>
  )
}
