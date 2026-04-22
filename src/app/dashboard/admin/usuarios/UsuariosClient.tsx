'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  UserCheck, UserX, ShieldAlert, ShieldCheck, Clock, AlertTriangle,
  RefreshCw, Loader2, Eye, EyeOff, Lock, Unlock,
} from 'lucide-react'

type User = {
  id: string; email: string; name: string | null; phone: string | null
  role: string; status: string; createdAt: string; clientCode?: string | null
  banReason?: string | null
}

type AuditLog = {
  id: string; email: string; ip: string; success: boolean
  reason?: string | null; createdAt: string
  user?: { name: string | null; role: string } | null
}

const ROLES = [
  { value: 'ADMIN',              label: 'Admin'              },
  { value: 'PRODUCER',           label: 'Produtor'           },
  { value: 'PRODUCTION_MANAGER', label: 'Gerente de Produção'},
  { value: 'DELIVERER',          label: 'Entregador'         },
  { value: 'FINANCE',            label: 'Financeiro'         },
  { value: 'COMMERCIAL',         label: 'Comercial'          },
  { value: 'CLIENT',             label: 'Cliente'            },
  { value: 'MANAGER',            label: 'Gestor'             },
  { value: 'PLUG_PLAY',          label: 'Plug & Play'        },
  { value: 'PURCHASING',         label: 'Compras'            },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Aguardando',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: <Clock className="w-3 h-3" /> },
  ACTIVE:  { label: 'Ativo',       color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',  icon: <ShieldCheck className="w-3 h-3" /> },
  BANNED:  { label: 'Banido',      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',          icon: <ShieldAlert className="w-3 h-3" /> },
}

type ActiveTab = 'usuarios' | 'pendentes' | 'auditoria'

export function UsuariosClient() {
  const [users,       setUsers]       = useState<User[]>([])
  const [auditLogs,   setAuditLogs]   = useState<AuditLog[]>([])
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<ActiveTab>('pendentes')
  const [showForm,    setShowForm]    = useState(false)
  const [editing,     setEditing]     = useState<User | null>(null)
  const [actioning,   setActioning]   = useState<string | null>(null)
  const [banReason,   setBanReason]   = useState('')
  const [banTarget,   setBanTarget]   = useState<User | null>(null)
  const [nextClientId, setNextClientId] = useState<string | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'CLIENT', phone: '' })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/usuarios')
    if (r.ok) setUsers(await r.json())
    setLoading(false)
  }, [])

  const loadAudit = useCallback(async () => {
    const r = await fetch('/api/admin/login-audit?limit=50')
    if (r.ok) { const d = await r.json(); setAuditLogs(d.logs ?? []) }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { if (tab === 'auditoria') loadAudit() }, [tab, loadAudit])

  useEffect(() => {
    if (!showForm || form.role !== 'CLIENT') { setNextClientId(null); return }
    fetch('/api/admin/clientes/next-id').then((r) => r.json()).then((d) => setNextClientId(d.nextClientId ?? null)).catch(() => setNextClientId(null))
  }, [showForm, form.role])

  async function handleAction(userId: string, action: 'APPROVE' | 'BAN' | 'REACTIVATE', reason?: string) {
    setActioning(userId)
    const res = await fetch(`/api/admin/usuarios/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, banReason: reason }),
    })
    if (res.ok) { setBanTarget(null); setBanReason(''); loadUsers() }
    else { const e = await res.json(); alert(e.error || 'Erro') }
    setActioning(null)
  }

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`Deletar permanentemente ${email}? Esta ação não pode ser desfeita.`)) return
    setActioning(userId)
    await fetch(`/api/admin/usuarios/${userId}`, { method: 'DELETE' })
    loadUsers()
    setActioning(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSubmitting(true)
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email, name: form.name, password: form.password, role: form.role, phone: form.phone || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      if (data.clientCode) alert(`Cliente criado. Código: ${data.clientCode}`)
      setForm({ email: '', name: '', password: '', role: 'CLIENT', phone: '' }); setShowForm(false); loadUsers()
    } else { alert(data.error || 'Erro ao criar') }
    setSubmitting(false)
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault(); if (!editing) return; setSubmitting(true)
    const body: Record<string, unknown> = { name: form.name, role: form.role, phone: form.phone || null }
    if (form.password) body.password = form.password
    const res = await fetch(`/api/admin/usuarios/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) { setEditing(null); setForm({ email: '', name: '', password: '', role: 'CLIENT', phone: '' }); loadUsers() }
    else { const err = await res.json(); alert(err.error || 'Erro ao atualizar') }
    setSubmitting(false)
  }

  function openEdit(u: User) {
    setEditing(u); setForm({ email: u.email, name: u.name || '', password: '', role: u.role, phone: u.phone || '' })
  }

  const pendentes = users.filter((u) => u.status === 'PENDING')
  const todos     = users

  const TABS: { id: ActiveTab; label: string; badge?: number }[] = [
    { id: 'pendentes',  label: '🔐 Aprovações Pendentes', badge: pendentes.length },
    { id: 'usuarios',   label: '👥 Todos os Usuários' },
    { id: 'auditoria',  label: '🔍 Auditoria de Login' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="heading-1">Gestão de Usuários — Painel CEO</h1>
        <button onClick={loadUsers} className="btn-secondary text-sm flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${tab === t.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── ABA: PENDENTES ──────────────────────────────────────────────────── */}
      {tab === 'pendentes' && (
        <div className="space-y-4">
          {pendentes.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-green-400" />
              <p className="font-bold text-lg">Nenhuma aprovação pendente</p>
              <p className="text-sm">Todos os usuários estão aprovados ou banidos.</p>
            </div>
          ) : (
            pendentes.map((u) => (
              <div key={u.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/10 dark:border-amber-700 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-sm">{u.name || '—'}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold">{u.role}</span>
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                      <Clock className="w-3 h-3" />Aguardando
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-0.5">{u.email}</p>
                  <p className="text-xs text-zinc-400">Cadastrado em {new Date(u.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <button onClick={() => handleAction(u.id, 'APPROVE')}
                    disabled={actioning === u.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors disabled:opacity-50">
                    {actioning === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}Aprovar
                  </button>
                  <button onClick={() => setBanTarget(u)}
                    disabled={actioning === u.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50">
                    <UserX className="w-4 h-4" />Recusar
                  </button>
                  <button onClick={() => handleDelete(u.id, u.email)}
                    disabled={actioning === u.id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 text-red-600 text-sm font-bold hover:bg-red-50 transition-colors disabled:opacity-50">
                    Deletar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── ABA: TODOS OS USUÁRIOS ──────────────────────────────────────────── */}
      {tab === 'usuarios' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold">Usuários ({todos.length})</h2>
              <button onClick={() => { setShowForm(!showForm); setEditing(null) }} className="btn-primary text-sm">
                {showForm ? 'Cancelar' : 'Novo usuário'}
              </button>
            </div>

            {showForm && (
              <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-xl space-y-3 border border-zinc-200 dark:border-zinc-700">
                <p className="font-bold text-sm">Novo Usuário</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { label: 'E-mail *', key: 'email', type: 'email', required: true },
                    { label: 'Nome *',   key: 'name',  type: 'text',  required: true },
                    { label: 'Senha *',  key: 'password', type: 'password', required: true },
                    { label: 'Telefone', key: 'phone', type: 'text',  required: false },
                  ].map(({ label, key, type, required }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium mb-1">{label}</label>
                      <input type={type} value={form[key as keyof typeof form]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="input-field" required={required} minLength={key === 'password' ? 8 : undefined} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-medium mb-1">Perfil *</label>
                    <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input-field">
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  {form.role === 'CLIENT' && nextClientId && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Próximo código (automático)</label>
                      <input type="text" readOnly disabled value={nextClientId} className="input-field font-mono opacity-60" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting} className="btn-primary text-sm flex items-center gap-1.5">
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Criar
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancelar</button>
                </div>
              </form>
            )}

            {editing && (
              <form onSubmit={handleUpdate} className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-xl space-y-3 border border-blue-200 dark:border-blue-700">
                <p className="font-bold text-sm">Editando: <span className="text-primary-600">{editing.email}</span></p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { label: 'Nome *', key: 'name', type: 'text', required: true },
                    { label: 'Telefone', key: 'phone', type: 'text', required: false },
                    { label: 'Nova senha', key: 'password', type: 'password', required: false },
                  ].map(({ label, key, type, required }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium mb-1">{label}</label>
                      <input type={type} value={form[key as keyof typeof form]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="input-field" required={required} minLength={key === 'password' ? 8 : undefined} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-medium mb-1">Perfil *</label>
                    <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input-field">
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting} className="btn-primary text-sm">Salvar</button>
                  <button type="button" onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancelar</button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-zinc-400 border-b border-zinc-200 dark:border-zinc-700 text-xs uppercase">
                      <th className="pb-2 pr-4">E-mail / Nome</th>
                      <th className="pb-2 pr-4">Perfil</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Cadastro</th>
                      <th className="pb-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todos.map((u) => {
                      const sc = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.PENDING
                      return (
                        <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                          <td className="py-3 pr-4">
                            <p className="font-medium">{u.name || '—'}</p>
                            <p className="text-xs text-zinc-400">{u.email}</p>
                            {u.clientCode && <p className="text-xs font-mono text-violet-500">{u.clientCode}</p>}
                          </td>
                          <td className="py-3 pr-4">
                            <span className="px-2 py-0.5 rounded text-xs bg-zinc-100 dark:bg-zinc-700 font-mono">{u.role}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold w-fit ${sc.color}`}>
                              {sc.icon}{sc.label}
                            </span>
                            {u.banReason && <p className="text-xs text-red-400 mt-0.5 max-w-[180px] truncate">{u.banReason}</p>}
                          </td>
                          <td className="py-3 pr-4 text-xs text-zinc-400">
                            {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <button onClick={() => openEdit(u)} className="px-2 py-1 rounded text-xs text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 font-medium">Editar</button>
                              {u.status === 'PENDING' && (
                                <button onClick={() => handleAction(u.id, 'APPROVE')} disabled={actioning === u.id} className="px-2 py-1 rounded text-xs text-green-700 bg-green-100 hover:bg-green-200 font-bold flex items-center gap-1">
                                  {actioning === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}Aprovar
                                </button>
                              )}
                              {u.status === 'ACTIVE' && u.role !== 'ADMIN' && (
                                <button onClick={() => setBanTarget(u)} disabled={actioning === u.id} className="px-2 py-1 rounded text-xs text-red-700 bg-red-100 hover:bg-red-200 font-bold flex items-center gap-1">
                                  <Lock className="w-3 h-3" />Banir
                                </button>
                              )}
                              {u.status === 'BANNED' && (
                                <button onClick={() => handleAction(u.id, 'REACTIVATE')} disabled={actioning === u.id} className="px-2 py-1 rounded text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 font-bold flex items-center gap-1">
                                  <Unlock className="w-3 h-3" />Reativar
                                </button>
                              )}
                              {u.role !== 'ADMIN' && (
                                <button onClick={() => handleDelete(u.id, u.email)} disabled={actioning === u.id} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-red-600 hover:bg-red-50 font-medium">Deletar</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ABA: AUDITORIA ──────────────────────────────────────────────────── */}
      {tab === 'auditoria' && (
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <h2 className="font-bold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />Log de Tentativas de Login</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-200 dark:border-zinc-700 text-xs uppercase">
                  <th className="pb-2 pr-4">E-mail</th>
                  <th className="pb-2 pr-4">IP</th>
                  <th className="pb-2 pr-4">Resultado</th>
                  <th className="pb-2 pr-4">Motivo</th>
                  <th className="pb-2">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className={`border-b border-zinc-100 dark:border-zinc-800 last:border-0 ${!log.success ? 'bg-red-50/40 dark:bg-red-950/10' : ''}`}>
                    <td className="py-2 pr-4 font-mono text-xs">{log.email}<br/>{log.user && <span className="text-zinc-400">{log.user.name} ({log.user.role})</span>}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-500">{log.ip}</td>
                    <td className="py-2 pr-4">
                      {log.success
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold"><Eye className="w-3 h-3" />OK</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold"><EyeOff className="w-3 h-3" />FALHA</span>}
                    </td>
                    <td className="py-2 pr-4 text-xs text-zinc-400 font-mono">{log.reason || '—'}</td>
                    <td className="py-2 text-xs text-zinc-400">{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-zinc-400">Nenhum registro de login ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de banimento */}
      {banTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl border border-red-300 p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-red-700">Banir Usuário</h3>
                <p className="text-sm text-zinc-500">{banTarget.email}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">Motivo do banimento *</label>
              <textarea value={banReason} onChange={(e) => setBanReason(e.target.value)}
                className="input-field h-24 resize-none"
                placeholder="Ex: Acesso não autorizado. Usuário externo não aprovado." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleAction(banTarget.id, 'BAN', banReason)}
                disabled={!banReason.trim() || actioning === banTarget.id}
                className="btn-primary bg-red-600 hover:bg-red-700 flex-1 flex items-center justify-center gap-1.5 text-sm">
                {actioning === banTarget.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}Confirmar Banimento
              </button>
              <button onClick={() => { setBanTarget(null); setBanReason('') }} className="btn-secondary text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
