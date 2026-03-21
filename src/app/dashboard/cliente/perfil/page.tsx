'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Profile = {
  email: string
  name: string | null
  phone: string | null
  photo?: string | null
  whatsapp: string | null
  country: string | null
  notifyEmail?: boolean
  notifyWhatsapp?: boolean
}

export default function PerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', whatsapp: '', country: '', photo: '', notifyEmail: true, notifyWhatsapp: true })
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPwd, setChangingPwd] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/cliente/perfil')
      .then((r) => r.json())
      .then((data) => {
        setProfile(data)
        setForm({
          name: data.name || '',
          phone: data.phone || '',
          whatsapp: data.whatsapp || '',
          country: data.country || '',
          photo: data.photo || '',
          notifyEmail: data.notifyEmail !== false,
          notifyWhatsapp: data.notifyWhatsapp !== false,
        })
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    const res = await fetch('/api/cliente/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, photo: form.photo || null }),
    })
    if (res.ok) {
      setMessage('Dados atualizados com sucesso!')
    } else {
      const err = await res.json()
      setMessage(err.error || 'Erro ao atualizar')
    }
    setSaving(false)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (passwordForm.new !== passwordForm.confirm) {
      setMessage('Nova senha e confirmação não conferem.')
      return
    }
    setChangingPwd(true)
    setMessage('')
    const res = await fetch('/api/user/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.new,
      }),
    })
    if (res.ok) {
      setMessage('Senha alterada com sucesso!')
      setPasswordForm({ current: '', new: '', confirm: '' })
    } else {
      const err = await res.json()
      setMessage(err.error || 'Erro ao alterar senha')
    }
    setChangingPwd(false)
  }

  if (loading) return <p className="text-gray-500 py-8">Carregando...</p>

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700">
          ← Voltar
        </Link>
        <h1 className="heading-1">
          Editar Dados Pessoais
        </h1>
      </div>

      <div className="card max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {message && (
            <div className={`p-3 rounded ${message.includes('sucesso') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">E-mail</label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="input-field bg-gray-100 dark:bg-white/5"
            />
            <p className="text-xs text-gray-500 mt-1">O e-mail não pode ser alterado.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Telefone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="input-field"
              placeholder="(00) 00000-0000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp</label>
            <input
              type="text"
              value={form.whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
              className="input-field"
              placeholder="5511999999999"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">País</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              className="input-field"
              placeholder="Brasil"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Foto / Avatar (URL)</label>
            <input
              type="url"
              value={form.photo}
              onChange={(e) => setForm((f) => ({ ...f, photo: e.target.value }))}
              className="input-field"
              placeholder="https://..."
            />
            {form.photo && (
              <img src={form.photo} alt="Avatar" className="mt-2 w-16 h-16 rounded-full object-cover border" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="block text-sm font-medium">Notificações</label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.notifyEmail}
                onChange={(e) => setForm((f) => ({ ...f, notifyEmail: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Receber por e-mail</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.notifyWhatsapp}
                onChange={(e) => setForm((f) => ({ ...f, notifyWhatsapp: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Receber por WhatsApp</span>
            </label>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>

        <hr className="my-6 border-gray-200" />
        <h2 className="font-semibold mb-4">Alterar senha</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Senha atual</label>
            <input
              type="password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nova senha</label>
            <input
              type="password"
              value={passwordForm.new}
              onChange={(e) => setPasswordForm((f) => ({ ...f, new: e.target.value }))}
              className="input-field"
              minLength={8}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Mínimo 8 caracteres.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmar nova senha</label>
            <input
              type="password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
              className="input-field"
              minLength={8}
              required
            />
          </div>
          <button type="submit" disabled={changingPwd} className="btn-secondary">
            {changingPwd ? 'Alterando...' : 'Alterar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
