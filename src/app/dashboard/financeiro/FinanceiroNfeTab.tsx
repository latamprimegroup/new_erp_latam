'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FileText, Plus, Loader2, CheckCircle2, XCircle, ExternalLink,
  RefreshCw, FileBarChart2, Clock,
} from 'lucide-react'

type FinNfe = {
  id: string
  nfeNumber: string | null
  series: string | null
  nfeStatus: string
  issueDate: string | null
  totalAmount: number | null
  serviceDesc: string | null
  clientCnpj: string | null
  clientName: string | null
  externalId: string | null
  pdfUrl: string | null
  xmlUrl: string | null
  notes: string | null
  createdAt: string
  wallet: { name: string } | null
}

const STATUS_BADGE: Record<string, string> = {
  PENDENTE:  'bg-amber-100 text-amber-700',
  EMITIDA:   'bg-green-100 text-green-700',
  CANCELADA: 'bg-zinc-200 text-zinc-600',
  ERRO:      'bg-red-100 text-red-700',
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

export function FinanceiroNfeTab() {
  const [nfes, setNfes]           = useState<FinNfe[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<FinNfe | null>(null)
  const [flash, setFlash]         = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [filterStatus, setFilter] = useState('')

  const [form, setForm] = useState({
    nfeNumber: '', series: '', nfeStatus: 'PENDENTE',
    issueDate: '', totalAmount: '', serviceDesc: '',
    clientCnpj: '', clientName: '', externalId: '',
    pdfUrl: '', xmlUrl: '', notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const qs = filterStatus ? `?status=${filterStatus}` : ''
    const res = await fetch(`/api/financeiro/nfes${qs}`)
    if (res.ok) {
      const j = await res.json()
      setNfes(j.nfes ?? [])
      setTotal(j.total ?? 0)
    }
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const resetForm = () => setForm({ nfeNumber: '', series: '', nfeStatus: 'PENDENTE', issueDate: '', totalAmount: '', serviceDesc: '', clientCnpj: '', clientName: '', externalId: '', pdfUrl: '', xmlUrl: '', notes: '' })

  const openEdit = (n: FinNfe) => {
    setForm({
      nfeNumber: n.nfeNumber ?? '', series: n.series ?? '', nfeStatus: n.nfeStatus,
      issueDate: n.issueDate ? new Date(n.issueDate).toISOString().slice(0, 10) : '',
      totalAmount: n.totalAmount ? String(n.totalAmount) : '',
      serviceDesc: n.serviceDesc ?? '', clientCnpj: n.clientCnpj ?? '',
      clientName: n.clientName ?? '', externalId: n.externalId ?? '',
      pdfUrl: n.pdfUrl ?? '', xmlUrl: n.xmlUrl ?? '', notes: n.notes ?? '',
    })
    setEditing(n)
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true)
    const payload = {
      nfeNumber:   form.nfeNumber || null,
      series:      form.series || null,
      nfeStatus:   form.nfeStatus,
      issueDate:   form.issueDate ? new Date(form.issueDate).toISOString() : undefined,
      totalAmount: form.totalAmount ? parseFloat(form.totalAmount) : undefined,
      serviceDesc: form.serviceDesc || null,
      clientCnpj:  form.clientCnpj || null,
      clientName:  form.clientName || null,
      externalId:  form.externalId || null,
      pdfUrl:      form.pdfUrl || null,
      xmlUrl:      form.xmlUrl || null,
      notes:       form.notes || null,
    }
    const res = editing
      ? await fetch(`/api/financeiro/nfes/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/financeiro/nfes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (res.ok) {
      setFlash({ type: 'ok', msg: 'NF-e salva com sucesso!' })
      setShowForm(false); resetForm(); setEditing(null); load()
    } else {
      const e = await res.json().catch(() => ({}))
      setFlash({ type: 'err', msg: (e as { error?: string }).error ?? 'Erro ao salvar' })
    }
    setTimeout(() => setFlash(null), 4000)
  }

  const emitted = nfes.filter((n) => n.nfeStatus === 'EMITIDA')
  const pending  = nfes.filter((n) => n.nfeStatus === 'PENDENTE')
  const totalEmitted = emitted.reduce((s, n) => s + Number(n.totalAmount ?? 0), 0)

  return (
    <div className="space-y-5">
      {flash && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${flash.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {flash.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {flash.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <p className="text-xs text-zinc-500 mb-1">Total de NF-e</p>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-4">
          <p className="text-xs text-green-600 font-medium mb-1">Emitidas</p>
          <p className="text-2xl font-bold text-green-700">{emitted.length}</p>
          <p className="text-xs text-green-600">{brl(totalEmitted)}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4">
          <p className="text-xs text-amber-600 font-medium mb-1">Pendentes</p>
          <p className="text-2xl font-bold text-amber-700">{pending.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
          <p className="text-xs text-zinc-500 mb-1">Receita Faturada</p>
          <p className="text-xl font-bold text-primary-600">{brl(totalEmitted)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          <select value={filterStatus} onChange={(e) => setFilter(e.target.value)} className="input-field text-sm py-1.5 min-w-[140px]">
            <option value="">Todos os status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="EMITIDA">Emitida</option>
            <option value="CANCELADA">Cancelada</option>
            <option value="ERRO">Erro</option>
          </select>
          <button onClick={load} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <RefreshCw className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
        <button onClick={() => { resetForm(); setEditing(null); setShowForm(true) }} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Nova NF-e
        </button>
      </div>

      {loading
        ? <div className="flex justify-center py-12 text-zinc-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando...</div>
        : nfes.length === 0
          ? (
            <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-10 text-center">
              <FileText className="w-10 h-10 mx-auto text-zinc-300 mb-3" />
              <p className="text-zinc-500 font-medium">Nenhuma NF-e registrada</p>
            </div>
          )
          : (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <div className="grid grid-cols-12 gap-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
                <div className="col-span-1">Status</div>
                <div className="col-span-2">Número</div>
                <div className="col-span-3">Cliente</div>
                <div className="col-span-2">Emissão</div>
                <div className="col-span-2 text-right">Valor</div>
                <div className="col-span-2 text-right">Ações</div>
              </div>
              {nfes.map((n) => (
                <div key={n.id} className="grid grid-cols-12 gap-0 items-center px-4 py-3 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <div className="col-span-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_BADGE[n.nfeStatus] ?? 'bg-zinc-100 text-zinc-600'}`}>
                      {n.nfeStatus}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <p className="font-mono text-xs">{n.nfeNumber ?? '—'}</p>
                    {n.series && <p className="text-[10px] text-zinc-400">Série {n.series}</p>}
                  </div>
                  <div className="col-span-3 pr-2">
                    <p className="font-medium text-xs truncate">{n.clientName ?? '—'}</p>
                    <p className="text-[10px] text-zinc-400">{n.clientCnpj ?? ''}</p>
                  </div>
                  <div className="col-span-2 flex items-center gap-1 text-zinc-500">
                    <Clock className="w-3 h-3" />
                    <span className="text-xs">{fmtDate(n.issueDate)}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="font-bold text-sm">{n.totalAmount ? brl(Number(n.totalAmount)) : '—'}</p>
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    <button onClick={() => openEdit(n)} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700">
                      <FileBarChart2 className="w-3.5 h-3.5" />
                    </button>
                    {n.pdfUrl && (
                      <a href={n.pdfUrl} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-green-50 text-zinc-400 hover:text-green-600">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
      }

      {/* Modal NF-e */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{editing ? 'Editar NF-e' : 'Nova NF-e'}</h3>
              <button onClick={() => { setShowForm(false); resetForm(); setEditing(null) }} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <XCircle className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Número da NF-e</label>
                <input value={form.nfeNumber} onChange={(e) => setForm((p) => ({ ...p, nfeNumber: e.target.value }))} className="input-field" placeholder="Ex: 000123" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Série</label>
                <input value={form.series} onChange={(e) => setForm((p) => ({ ...p, series: e.target.value }))} className="input-field" placeholder="A1" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select value={form.nfeStatus} onChange={(e) => setForm((p) => ({ ...p, nfeStatus: e.target.value }))} className="input-field">
                  {['PENDENTE', 'EMITIDA', 'CANCELADA', 'ERRO'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Data de Emissão</label>
                <input type="date" value={form.issueDate} onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor Total (R$)</label>
                <input type="number" step="0.01" value={form.totalAmount} onChange={(e) => setForm((p) => ({ ...p, totalAmount: e.target.value }))} className="input-field" placeholder="0,00" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CNPJ do Cliente</label>
                <input value={form.clientCnpj} onChange={(e) => setForm((p) => ({ ...p, clientCnpj: e.target.value }))} className="input-field" placeholder="00.000.000/0001-00" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Razão Social do Cliente</label>
                <input value={form.clientName} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} className="input-field" placeholder="Nome da empresa..." />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Descrição do Serviço</label>
                <textarea value={form.serviceDesc} onChange={(e) => setForm((p) => ({ ...p, serviceDesc: e.target.value }))} rows={2} className="input-field" placeholder="Gestão de tráfego pago, contingência de contas..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ID Externo (FocusNFe)</label>
                <input value={form.externalId} onChange={(e) => setForm((p) => ({ ...p, externalId: e.target.value }))} className="input-field" placeholder="ID da API..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL do PDF</label>
                <input value={form.pdfUrl} onChange={(e) => setForm((p) => ({ ...p, pdfUrl: e.target.value }))} className="input-field" placeholder="https://..." />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {saving ? 'Salvando...' : 'Salvar NF-e'}
              </button>
              <button onClick={() => { setShowForm(false); resetForm(); setEditing(null) }} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
