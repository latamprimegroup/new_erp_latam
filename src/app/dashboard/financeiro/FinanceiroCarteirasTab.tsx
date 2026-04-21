'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Wallet, Plus, Edit2, Trash2, Loader2, CheckCircle2,
  XCircle, TrendingUp, DollarSign, Building2, RefreshCw,
} from 'lucide-react'

type FinWallet = {
  id: string
  name: string
  bankName: string | null
  accountType: string
  currency: string
  balance: number
  icon: string | null
  color: string | null
  notes: string | null
  active: boolean
  createdAt: string
  _count: { entries: number }
}

const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'DIGITAL', 'CREDIT', 'CRIPTO'] as const
const ACCOUNT_LABELS: Record<string, string> = {
  CHECKING: 'Conta Corrente', SAVINGS: 'Poupança',
  DIGITAL: 'Conta Digital', CREDIT: 'Cartão Crédito', CRIPTO: 'Criptomoeda',
}
const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP']

const brl = (v: number, currency = 'BRL') =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: currency === 'BRL' ? 'BRL' : 'USD' })

const PRESET_ICONS = ['🏦', '💳', '💰', '₿', '🌐', '🏧', '💵', '🪙']

const PRESET_COLORS = ['#00B8D9', '#36B37E', '#FF5630', '#6554C0', '#FF8B00', '#0052CC', '#00875A']

export function FinanceiroCarteirasTab() {
  const [wallets, setWallets]           = useState<FinWallet[]>([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [editing, setEditing]           = useState<FinWallet | null>(null)
  const [flash, setFlash]               = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  const [form, setForm] = useState({
    name: '', bankName: '', accountType: 'CHECKING', currency: 'BRL',
    balance: '', icon: '🏦', color: '#00B8D9', notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/financeiro/carteiras')
    if (res.ok) {
      const j = await res.json()
      setWallets(j.wallets ?? [])
      setTotalBalance(j.totalBalance ?? 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => setForm({ name: '', bankName: '', accountType: 'CHECKING', currency: 'BRL', balance: '', icon: '🏦', color: '#00B8D9', notes: '' })

  const openNew = () => { resetForm(); setEditing(null); setShowForm(true) }

  const openEdit = (w: FinWallet) => {
    setForm({ name: w.name, bankName: w.bankName ?? '', accountType: w.accountType, currency: w.currency, balance: String(w.balance), icon: w.icon ?? '🏦', color: w.color ?? '#00B8D9', notes: w.notes ?? '' })
    setEditing(w)
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setFlash({ type: 'err', msg: 'Nome obrigatório' }); return }
    setSaving(true)

    const payload = {
      name: form.name.trim(), bankName: form.bankName || null,
      accountType: form.accountType, currency: form.currency,
      balance: parseFloat(form.balance || '0'),
      icon: form.icon || null, color: form.color || null,
      notes: form.notes || null,
    }

    const res = editing
      ? await fetch(`/api/financeiro/carteiras/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/financeiro/carteiras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

    setSaving(false)
    if (res.ok) {
      setFlash({ type: 'ok', msg: editing ? 'Carteira atualizada!' : 'Carteira criada!' })
      setShowForm(false)
      resetForm()
      load()
    } else {
      const e = await res.json().catch(() => ({}))
      setFlash({ type: 'err', msg: (e as { error?: string }).error ?? 'Erro ao salvar' })
    }
    setTimeout(() => setFlash(null), 4000)
  }

  const remove = async (id: string) => {
    if (!confirm('Arquivar esta carteira?')) return
    await fetch(`/api/financeiro/carteiras/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-zinc-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando carteiras...
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Flash */}
      {flash && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${flash.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {flash.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {flash.msg}
        </div>
      )}

      {/* KPI de saldo total */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-gradient-to-br from-primary-600 to-indigo-700 text-white p-4">
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Saldo Total Consolidado</span>
          </div>
          <p className="text-3xl font-bold">{brl(totalBalance)}</p>
          <p className="text-xs opacity-70 mt-1">{wallets.length} carteira(s) ativa(s)</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <p className="text-xs text-zinc-500 mb-1">Maior saldo</p>
          <p className="font-bold text-lg truncate">
            {wallets.length ? brl(Math.max(...wallets.map((w) => Number(w.balance)))) : '—'}
          </p>
          <p className="text-xs text-zinc-400 truncate">
            {wallets.sort((a, b) => Number(b.balance) - Number(a.balance))[0]?.name ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <p className="text-xs text-zinc-500 mb-1">Lançamentos vinculados</p>
          <p className="font-bold text-lg">{wallets.reduce((sum, w) => sum + w._count.entries, 0)}</p>
          <p className="text-xs text-zinc-400">total de entradas</p>
        </div>
      </div>

      {/* Lista + botão */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary-500" /> Carteiras Cadastradas
        </h3>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <RefreshCw className="w-4 h-4 text-zinc-400" />
          </button>
          <button onClick={openNew} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Nova Carteira
          </button>
        </div>
      </div>

      {wallets.length === 0
        ? (
          <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-10 text-center">
            <Wallet className="w-10 h-10 mx-auto text-zinc-300 mb-3" />
            <p className="text-zinc-500 font-medium">Nenhuma carteira cadastrada</p>
            <p className="text-xs text-zinc-400 mt-1">Adicione bancos, contas digitais e carteiras cripto</p>
          </div>
        )
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {wallets.map((w) => (
              <div key={w.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-1.5" style={{ backgroundColor: w.color ?? '#6B7280' }} />
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{w.icon ?? '🏦'}</span>
                      <div>
                        <p className="font-semibold text-sm">{w.name}</p>
                        <p className="text-xs text-zinc-400">{ACCOUNT_LABELS[w.accountType] ?? w.accountType}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(w)} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(w.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className={`text-xl font-bold ${Number(w.balance) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {brl(Number(w.balance), w.currency)}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-zinc-400">{w.currency} · {w._count.entries} lançamentos</span>
                    {w.bankName && (
                      <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                        <Building2 className="w-3 h-3" />{w.bankName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }

      {/* Modal / Formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{editing ? 'Editar Carteira' : 'Nova Carteira'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <XCircle className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Nome *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Ex: Banco Inter Conta PJ" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Banco / Instituição</label>
                <input value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} className="input-field" placeholder="Ex: Nubank, Stone, Binance" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tipo</label>
                <select value={form.accountType} onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value }))} className="input-field">
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Moeda</label>
                <select value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} className="input-field">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Saldo Atual</label>
                <input type="number" step="0.01" value={form.balance} onChange={(e) => setForm((p) => ({ ...p, balance: e.target.value }))} className="input-field" placeholder="0,00" />
              </div>

              {/* Ícone */}
              <div>
                <label className="block text-sm font-medium mb-1">Ícone</label>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_ICONS.map((ic) => (
                    <button key={ic} onClick={() => setForm((p) => ({ ...p, icon: ic }))}
                      className={`text-lg rounded-lg p-1.5 border transition-all ${form.icon === ic ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-zinc-200 dark:border-zinc-700'}`}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              {/* Cor */}
              <div>
                <label className="block text-sm font-medium mb-1">Cor da carteira</label>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} onClick={() => setForm((p) => ({ ...p, color: c }))}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Observações</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="input-field" placeholder="Chave PIX, número de conta, etc." />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {saving ? 'Salvando...' : 'Salvar Carteira'}
              </button>
              <button onClick={() => { setShowForm(false); resetForm() }} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
