'use client'

import { useState, useEffect } from 'react'
import { PushNotificationsSetup } from '@/components/PushNotificationsSetup'

type Client = {
  id: string
  user: { name: string | null; email: string }
}

type Colaborador = {
  id: string
  name: string | null
  email: string
  role: string
}

type Meeting = {
  id: string
  title: string
  notes: string | null
  scheduledAt: string
  durationMinutes: number
  status: string
  client: { user: { name: string | null; email: string } }
  participants: { user: { id: string; name: string | null; email: string } }[]
  createdBy: { name: string | null } | null
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendado',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  RESCHEDULED: 'Reagendado',
}

export function OnboardingClient() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    clientId: '',
    title: 'Onboarding Cliente',
    notes: '',
    scheduledAt: '',
    durationMinutes: 30,
    participantIds: [] as string[],
  })

  const today = new Date().toISOString().slice(0, 16)
  const monthEnd = new Date()
  monthEnd.setDate(monthEnd.getDate() + 30)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const from = new Date().toISOString()
    const to = monthEnd.toISOString()
    try {
      const [mRes, cRes, colRes] = await Promise.all([
        fetch(`/api/onboarding/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        fetch('/api/clientes'),
        fetch('/api/onboarding/colaboradores'),
      ])
      if (mRes.ok) setMeetings(await mRes.json())
      if (cRes.ok) setClients(await cRes.json())
      if (colRes.ok) setColaboradores(await colRes.json())
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.clientId) {
      setError('Selecione o cliente')
      return
    }
    if (!form.scheduledAt) {
      setError('Informe data e horário')
      return
    }
    if (form.participantIds.length === 0) {
      setError('Selecione ao menos um participante')
      return
    }
    setSubmitting(true)
    try {
      const dt = new Date(form.scheduledAt)
      const res = await fetch('/api/onboarding/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          scheduledAt: dt.toISOString(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao agendar')
        return
      }
      setShowForm(false)
      setForm({ clientId: '', title: 'Onboarding Cliente', notes: '', scheduledAt: '', durationMinutes: 30, participantIds: [] })
      load()
    } finally {
      setSubmitting(false)
    }
  }

  function toggleParticipant(id: string) {
    setForm((prev) =>
      prev.participantIds.includes(id)
        ? { ...prev, participantIds: prev.participantIds.filter((x) => x !== id) }
        : { ...prev, participantIds: [...prev.participantIds, id] }
    )
  }

  if (loading) {
    return (
      <div>
        <h1 className="heading-1 mb-6">Agenda de Onboarding</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="heading-1 mb-6">Agenda de Onboarding</h1>
      <p className="text-gray-600 mb-6">
        Agende reuniões de onboarding com clientes novos. Integrado ao Google Agenda. Participantes recebem push no celular.
      </p>

      <div className="mb-6">
        <PushNotificationsSetup />
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : '+ Nova reunião'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6">
          <h2 className="font-semibold mb-4">Agendar onboarding</h2>
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Cliente *</label>
              <select
                value={form.clientId}
                onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
                className="w-full rounded border-gray-300"
                required
              >
                <option value="">Selecione...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.user.name || c.user.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Data e horário *</label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))}
                min={today}
                className="w-full rounded border-gray-300"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Título</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full rounded border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Duração (min)</label>
              <select
                value={form.durationMinutes}
                onChange={(e) => setForm((p) => ({ ...p, durationMinutes: Number(e.target.value) }))}
                className="w-full rounded border-gray-300"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 h</option>
                <option value={90}>1h30</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="w-full rounded border-gray-300"
              rows={2}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-2">Participantes * (recebem push no celular)</label>
            <div className="flex flex-wrap gap-2">
              {colaboradores.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.participantIds.includes(c.id)}
                    onChange={() => toggleParticipant(c.id)}
                  />
                  <span className="text-sm">{c.name || c.email}</span>
                </label>
              ))}
            </div>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Agendando...' : 'Agendar'}
          </button>
        </form>
      )}

      <div className="card">
        <h2 className="font-semibold mb-4">Próximas reuniões</h2>
        {meetings.length === 0 ? (
          <p className="text-gray-500">Nenhuma reunião agendada.</p>
        ) : (
          <div className="space-y-4">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary-600/30 transition-colors"
              >
                <div className="flex flex-wrap justify-between items-start gap-4">
                  <div>
                    <p className="font-semibold">{m.title}</p>
                    <p className="text-sm text-gray-600">
                      {m.client.user.name || m.client.user.email}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(m.scheduledAt).toLocaleString('pt-BR', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}{' '}
                      · {m.durationMinutes} min
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {m.participants.map((p) => (
                        <span
                          key={p.user.id}
                          className="text-xs px-2 py-1 bg-primary-500/10 text-primary-600 rounded"
                        >
                          {p.user.name || p.user.email}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      m.status === 'SCHEDULED' ? 'bg-green-100 text-green-700' :
                      m.status === 'COMPLETED' ? 'bg-gray-100 text-gray-700' :
                      'bg-red-100 text-red-700'
                    }`}
                  >
                    {STATUS_LABELS[m.status] || m.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
