'use client'

import { useState, useEffect } from 'react'

type User = {
  id: string
  email: string
  name: string | null
  phone: string | null
  role: string
  createdAt: string
  clientCode?: string | null
}

const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'PRODUCER', label: 'Produtor' },
  { value: 'PRODUCTION_MANAGER', label: 'Gerente de Produção' },
  { value: 'DELIVERER', label: 'Entregador' },
  { value: 'FINANCE', label: 'Financeiro' },
  { value: 'COMMERCIAL', label: 'Comercial' },
  { value: 'CLIENT', label: 'Cliente' },
  { value: 'MANAGER', label: 'Gestor' },
  { value: 'PLUG_PLAY', label: 'Plug & Play' },
]

export function UsuariosClient() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'CLIENT' as string,
    phone: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [nextClientId, setNextClientId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/usuarios')
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!showForm || form.role !== 'CLIENT') {
      setNextClientId(null)
      return
    }
    fetch('/api/admin/clientes/next-id')
      .then((r) => r.json())
      .then((d) => setNextClientId(d.nextClientId ?? null))
      .catch(() => setNextClientId(null))
  }, [showForm, form.role])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        name: form.name,
        password: form.password,
        role: form.role,
        phone: form.phone || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      if (data.clientCode) {
        alert(`Cliente criado. Código de guerra: ${data.clientCode}`)
      }
      setForm({ email: '', name: '', password: '', role: 'CLIENT', phone: '' })
      setShowForm(false)
      load()
    } else {
      alert(data.error || 'Erro ao criar')
    }
    setSubmitting(false)
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSubmitting(true)
    const body: Record<string, unknown> = {
      name: form.name,
      role: form.role,
      phone: form.phone || null,
    }
    if (form.password) body.password = form.password
    const res = await fetch(`/api/admin/usuarios/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setEditing(null)
      setForm({ email: '', name: '', password: '', role: 'CLIENT', phone: '' })
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao atualizar')
    }
    setSubmitting(false)
  }

  function openEdit(u: User) {
    setEditing(u)
    setForm({ email: u.email, name: u.name || '', password: '', role: u.role, phone: u.phone || '' })
  }

  const editingClientCode = editing?.role === 'CLIENT' ? editing.clientCode : null

  return (
    <div>
      <h1 className="heading-1 mb-6">Gestão de Usuários</h1>

      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Usuários</h2>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            {showForm ? 'Cancelar' : 'Novo usuário'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">E-mail *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Senha *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="input-field"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Perfil *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="input-field"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Telefone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="input-field"
                />
              </div>
              {form.role === 'CLIENT' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Próximo ID sugerido (somente leitura)</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={nextClientId ?? '…'}
                    className="input-field font-mono bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Código sequencial tipo C288+ atribuído automaticamente ao salvar (TinTim / buscas).
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Salvando...' : 'Criar'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {editing && (
          <form onSubmit={handleUpdate} className="mb-6 p-4 bg-blue-50 rounded-lg space-y-3 border border-blue-200">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="font-medium">Editando: {editing.email}</h3>
              {editingClientCode && (
                <span className="font-mono text-sm font-semibold px-2 py-0.5 rounded bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200">
                  {editingClientCode}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Perfil *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="input-field"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Telefone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nova senha (deixe em branco para manter)</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="input-field"
                  minLength={8}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-gray-500 py-4">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">E-mail</th>
                  <th className="pb-2 pr-4">Nome</th>
                  <th className="pb-2 pr-4 font-mono text-xs">Código</th>
                  <th className="pb-2 pr-4">Perfil</th>
                  <th className="pb-2 pr-4">Cadastro</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">{u.email}</td>
                    <td className="py-3 pr-4">{u.name || '—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {u.clientCode || '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100">{u.role}</span>
                    </td>
                    <td className="py-3 pr-4">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-primary-600 hover:underline text-sm"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
