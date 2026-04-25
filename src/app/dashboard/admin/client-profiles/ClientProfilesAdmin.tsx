'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, ChevronDown, Save, Eye } from 'lucide-react'
import Link from 'next/link'
import {
  PROFILE_TYPE_LABELS,
  PROFILE_THEMES,
  ALL_MODULES,
  PROFILE_MODULES,
  type ClientProfileType,
  type ModuleKey,
} from '@/lib/client-profile-config'

type ClientRow = {
  id:            string
  profileType:   ClientProfileType
  activeModules: string[]
  spendFeePct:   number | null
  monthlyFeeBrl: number | null
  nextBillingAt: string | null
  clientStatus:  string
  totalSpent:    number | null
  user: { id: string; name: string | null; email: string }
}

const ALL_PROFILE_TYPES = Object.keys(PROFILE_TYPE_LABELS) as ClientProfileType[]

export function ClientProfilesAdmin() {
  const [rows, setRows]       = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<ClientProfileType | ''>('')
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving]   = useState<string | null>(null)

  // Estado local de edição por cliente
  const [draftProfile,  setDraftProfile]  = useState<ClientProfileType | ''>('')
  const [draftModules,  setDraftModules]  = useState<string[]>([])
  const [draftSpend,    setDraftSpend]    = useState<string>('')
  const [draftMonthly,  setDraftMonthly]  = useState<string>('')

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (search)  qs.set('search', search)
    if (filter)  qs.set('profileType', filter)
    fetch(`/api/admin/client-profile-type?${qs}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.profiles) ? d.profiles : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [search, filter])

  useEffect(() => { load() }, [load])

  function startEdit(row: ClientRow) {
    setEditing(row.id)
    setDraftProfile(row.profileType)
    setDraftModules(Array.isArray(row.activeModules) ? row.activeModules : [])
    setDraftSpend(row.spendFeePct?.toString() ?? '')
    setDraftMonthly(row.monthlyFeeBrl?.toString() ?? '')
  }

  async function save(clientProfileId: string) {
    setSaving(clientProfileId)
    try {
      const res = await fetch('/api/admin/client-profile-type', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          clientProfileId,
          profileType:   draftProfile || undefined,
          activeModules: draftModules.length > 0 ? draftModules : undefined,
          spendFeePct:   draftSpend ? parseFloat(draftSpend) : null,
          monthlyFeeBrl: draftMonthly ? parseFloat(draftMonthly) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error ?? 'Erro ao salvar'); return }
      setEditing(null)
      load()
    } finally {
      setSaving(null)
    }
  }

  function toggleModule(key: ModuleKey) {
    setDraftModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function resetToDefault() {
    if (!draftProfile) return
    setDraftModules([])  // Vazio = usa o padrão do perfil
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          🛡️ Gestão de Perfis de Cliente
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Defina o tipo de acesso, módulos e faturamento de cada cliente no War Room OS.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-white"
          />
        </div>
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ClientProfileType | '')}
            className="appearance-none rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-white px-3 py-2 pr-8"
          >
            <option value="">Todos os perfis</option>
            {ALL_PROFILE_TYPES.map((t) => (
              <option key={t} value={t}>{PROFILE_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 w-4 h-4 text-zinc-500" />
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-400 px-3 py-2 hover:bg-zinc-800 transition"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {/* Legenda de perfis */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ALL_PROFILE_TYPES.map((pt) => {
          const theme = PROFILE_THEMES[pt]
          return (
            <div
              key={pt}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs"
              style={{ borderLeftColor: theme.accentHex, borderLeftWidth: 3 }}
            >
              <p className="font-bold text-white">{theme.emoji} {theme.label}</p>
              <p className="text-zinc-500 mt-0.5">{theme.description}</p>
            </div>
          )
        })}
      </div>

      {/* Tabela */}
      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-500 text-sm">Nenhum cliente encontrado.</p>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/60">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase">Perfil</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase hidden md:table-cell">Faturamento</th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const theme  = PROFILE_THEMES[row.profileType]
                const isEdit = editing === row.id
                return (
                  <>
                    <tr key={row.id} className="border-t border-zinc-800 hover:bg-zinc-900/40 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{row.user.name ?? '—'}</p>
                        <p className="text-xs text-zinc-500">{row.user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                          style={{ background: theme.accentHex + '33', color: theme.accentHex }}
                        >
                          {theme.emoji} {theme.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-zinc-400">
                        {row.monthlyFeeBrl != null && (
                          <span className="mr-2">R$ {Number(row.monthlyFeeBrl).toFixed(2)}/mês</span>
                        )}
                        {row.spendFeePct != null && (
                          <span>{Number(row.spendFeePct).toFixed(1)}% spend</span>
                        )}
                        {row.monthlyFeeBrl == null && row.spendFeePct == null && (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href={`/api/admin/god-view?clientId=${row.user.id}&label=${encodeURIComponent(row.user.name ?? row.user.email)}&profileType=${row.profileType}`}
                            className="flex items-center gap-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition"
                          >
                            <Eye className="w-3.5 h-3.5" /> Ver como
                          </Link>
                          <button
                            type="button"
                            onClick={() => isEdit ? setEditing(null) : startEdit(row)}
                            className="rounded-lg bg-violet-600 hover:bg-violet-500 px-2.5 py-1.5 text-xs text-white font-medium transition"
                          >
                            {isEdit ? 'Cancelar' : 'Editar'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Painel de edição inline */}
                    {isEdit && (
                      <tr key={`${row.id}-edit`} className="border-t border-violet-600/30 bg-violet-950/10">
                        <td colSpan={4} className="px-4 py-4">
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {/* Perfil */}
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-zinc-400 uppercase">Tipo de Perfil</label>
                              <div className="relative">
                                <select
                                  value={draftProfile}
                                  onChange={(e) => {
                                    setDraftProfile(e.target.value as ClientProfileType)
                                    setDraftModules([]) // reset ao trocar perfil
                                  }}
                                  className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white pr-8"
                                >
                                  {ALL_PROFILE_TYPES.map((t) => (
                                    <option key={t} value={t}>{PROFILE_TYPE_LABELS[t]}</option>
                                  ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 w-4 h-4 text-zinc-500" />
                              </div>
                            </div>

                            {/* Faturamento */}
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-zinc-400 uppercase">Mensalidade (R$)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draftMonthly}
                                onChange={(e) => setDraftMonthly(e.target.value)}
                                placeholder="0.00"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-zinc-400 uppercase">% sobre Spend</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={draftSpend}
                                onChange={(e) => setDraftSpend(e.target.value)}
                                placeholder="0.0"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                              />
                            </div>
                          </div>

                          {/* Módulos */}
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-zinc-400 uppercase">Módulos Ativos</label>
                              <button
                                type="button"
                                onClick={resetToDefault}
                                className="text-xs text-violet-400 hover:underline"
                              >
                                Usar padrão do perfil
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {ALL_MODULES.map((mod) => {
                                const isDefault = draftProfile
                                  ? PROFILE_MODULES[draftProfile as ClientProfileType]?.includes(mod.key as ModuleKey)
                                  : false
                                const isActive = draftModules.length > 0
                                  ? draftModules.includes(mod.key)
                                  : isDefault
                                return (
                                  <label
                                    key={mod.key}
                                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition ${
                                      isActive
                                        ? 'border-violet-500 bg-violet-950/40 text-white'
                                        : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="sr-only"
                                      checked={isActive}
                                      onChange={() => {
                                        if (draftModules.length === 0) {
                                          // Inicializa a partir do padrão
                                          const defaults = PROFILE_MODULES[draftProfile as ClientProfileType] ?? []
                                          setDraftModules(
                                            isActive
                                              ? defaults.filter((k) => k !== mod.key)
                                              : [...defaults, mod.key]
                                          )
                                        } else {
                                          toggleModule(mod.key as ModuleKey)
                                        }
                                      }}
                                    />
                                    <span>{mod.icon}</span>
                                    {mod.label}
                                    {isDefault && draftModules.length === 0 && (
                                      <span className="ml-auto text-[9px] text-zinc-600 uppercase">padrão</span>
                                    )}
                                  </label>
                                )
                              })}
                            </div>
                          </div>

                          {/* Salvar */}
                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => save(row.id)}
                              disabled={saving === row.id}
                              className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-bold text-white transition"
                            >
                              <Save className="w-4 h-4" />
                              {saving === row.id ? 'Salvando...' : 'Salvar alterações'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
