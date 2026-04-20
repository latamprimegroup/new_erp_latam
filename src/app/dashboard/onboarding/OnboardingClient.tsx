'use client'

import { useState, useEffect } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { PushNotificationsSetup } from '@/components/PushNotificationsSetup'
import { FlashBanner } from '@/components/FlashBanner'

const CONFIRM_DELETE =
  'Tem certeza que deseja excluir esta reunião? Esta ação não pode ser desfeita.'

function buildWhatsappInviteUrl(phone: string | null | undefined, message: string): string | null {
  const raw = phone?.replace(/\D/g, '') ?? ''
  if (raw.length < 10) return null
  const n = raw.startsWith('55') ? raw : `55${raw}`
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`
}

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
  meetLink?: string | null
  client: { whatsapp?: string | null; user: { name: string | null; email: string } }
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
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    notes: '',
    scheduledAt: '',
    durationMinutes: 30,
    status: 'SCHEDULED' as string,
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [agendaTab, setAgendaTab] = useState<'upcoming' | 'past'>('upcoming')
  const [pastMeetings, setPastMeetings] = useState<Meeting[]>([])
  const [loadingPast, setLoadingPast] = useState(false)

  const today = new Date().toISOString().slice(0, 16)
  const monthEnd = new Date()
  monthEnd.setDate(monthEnd.getDate() + 30)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (agendaTab !== 'past') return
    let cancelled = false
    ;(async () => {
      setLoadingPast(true)
      const from = new Date()
      from.setFullYear(from.getFullYear() - 1)
      const to = new Date().toISOString()
      try {
        const res = await fetch(
          `/api/onboarding/meetings?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to)}&order=desc`
        )
        if (!res.ok || cancelled) return
        const all: Meeting[] = await res.json()
        const nowMs = Date.now()
        setPastMeetings(all.filter((m) => new Date(m.scheduledAt).getTime() < nowMs))
      } finally {
        if (!cancelled) setLoadingPast(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [agendaTab])

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
      const meetHint = data.meetLink ? ' Link do Meet disponível na lista.' : ''
      setFlash({ type: 'success', text: `Reunião agendada.${meetHint}` })
      setShowForm(false)
      setForm({ clientId: '', title: 'Onboarding Cliente', notes: '', scheduledAt: '', durationMinutes: 30, participantIds: [] })
      load()
      if (agendaTab === 'past') setAgendaTab('upcoming')
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

  function openEditMeeting(m: Meeting) {
    setEditMeeting(m)
    setEditForm({
      title: m.title,
      notes: m.notes || '',
      scheduledAt: new Date(m.scheduledAt).toISOString().slice(0, 16),
      durationMinutes: m.durationMinutes,
      status: m.status,
    })
  }

  async function saveEditMeeting(e: React.FormEvent) {
    e.preventDefault()
    if (!editMeeting) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/onboarding/meetings/${editMeeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          notes: editForm.notes || undefined,
          scheduledAt: new Date(editForm.scheduledAt).toISOString(),
          durationMinutes: editForm.durationMinutes,
          status: editForm.status,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFlash({ type: 'error', text: data.error || 'Erro ao salvar' })
        return
      }
      setFlash({ type: 'success', text: 'Reunião atualizada.' })
      setEditMeeting(null)
      load()
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteMeeting(id: string) {
    if (!confirm(CONFIRM_DELETE)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/onboarding/meetings/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setFlash({ type: 'success', text: 'Reunião excluída.' })
        setEditMeeting(null)
        load()
      } else {
        const err = await res.json()
        setFlash({ type: 'error', text: err.error || 'Erro ao excluir' })
      }
    } finally {
      setDeletingId(null)
    }
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
      <h1 className="heading-1 mb-4">Agenda de Onboarding</h1>
      <FlashBanner
        message={flash?.text ?? null}
        type={flash?.type ?? 'info'}
        onDismiss={() => setFlash(null)}
      />
      <p className="text-gray-600 mb-6 mt-2">
        Agende reuniões de onboarding com clientes novos. Integrado ao Google Agenda. Participantes recebem push no celular.
      </p>

      <div className="mb-6">
        <PushNotificationsSetup />
      </div>

      <div className="card mb-6">
        <details className="group">
          <summary className="font-semibold cursor-pointer text-gray-900 dark:text-gray-100">
            Checklist sugerido para o cliente (antes da reunião)
          </summary>
          <ul className="mt-3 text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-1">
            <li>Baixar/atualizar o navegador indicado pela operação e fechar perfis antigos do anúncio.</li>
            <li>Preparar proxy ou rede estável conforme combinado com o time.</li>
            <li>Ter acesso ao e-mail e meio de pagamento usados na conta (para verificações rápidas).</li>
            <li>Reservar ambiente silencioso e ~30 min sem interrupções.</li>
          </ul>
        </details>
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

      {editMeeting && (
        <form onSubmit={saveEditMeeting} className="card mb-6 border-2 border-primary-500/20">
          <h2 className="font-semibold mb-4">Editar reunião</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Título</label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded border-gray-300 input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Data e horário</label>
              <input
                type="datetime-local"
                value={editForm.scheduledAt}
                onChange={(e) => setEditForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                className="w-full rounded border-gray-300 input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Duração (min)</label>
              <input
                type="number"
                min={15}
                max={240}
                value={editForm.durationMinutes}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, durationMinutes: parseInt(e.target.value, 10) || 30 }))
                }
                className="w-full rounded border-gray-300 input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded border-gray-300 input-field"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Observações</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded border-gray-300 input-field min-h-[80px]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingEdit} className="btn-primary">
              {savingEdit ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button type="button" onClick={() => setEditMeeting(null)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setAgendaTab('upcoming')}
            className={agendaTab === 'upcoming' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          >
            Próximas reuniões
          </button>
          <button
            type="button"
            onClick={() => setAgendaTab('past')}
            className={agendaTab === 'past' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          >
            Histórico
          </button>
        </div>

        {agendaTab === 'past' && loadingPast ? (
          <p className="text-gray-500 dark:text-gray-400">Carregando histórico...</p>
        ) : (agendaTab === 'upcoming' ? meetings : pastMeetings).length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            {agendaTab === 'upcoming' ? 'Nenhuma reunião agendada.' : 'Nenhuma reunião passada no período.'}
          </p>
        ) : (
          <div className="space-y-4">
            {(agendaTab === 'upcoming' ? meetings : pastMeetings).map((m) => {
              const waMsg = `Olá! Segue o convite da reunião de onboarding *${m.title}* em ${new Date(m.scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.${m.meetLink ? ` Meet: ${m.meetLink}` : ''}`
              const waUrl = buildWhatsappInviteUrl(m.client.whatsapp, waMsg)
              return (
                <div
                  key={m.id}
                  className="border border-gray-200 dark:border-white/10 rounded-lg p-4 hover:border-primary-600/30 transition-colors"
                >
                  <div className="flex flex-wrap justify-between items-start gap-4">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{m.title}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {m.client.user.name || m.client.user.email}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(m.scheduledAt).toLocaleString('pt-BR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}{' '}
                        · {m.durationMinutes} min
                      </p>
                      {m.notes ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 whitespace-pre-wrap">{m.notes}</p>
                      ) : null}
                      {m.meetLink ? (
                        <p className="mt-2">
                          <a
                            href={m.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            Abrir Google Meet
                          </a>
                        </p>
                      ) : null}
                      {waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-2 btn-secondary text-xs py-1.5"
                        >
                          Enviar convite (WhatsApp)
                        </a>
                      ) : null}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {m.participants.map((p) => (
                          <span
                            key={p.user.id}
                            className="text-xs px-2 py-1 bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded"
                          >
                            {p.user.name || p.user.email}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          m.status === 'SCHEDULED'
                            ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                            : m.status === 'COMPLETED'
                              ? 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        }`}
                      >
                        {STATUS_LABELS[m.status] || m.status}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEditMeeting(m)}
                          className="p-1.5 rounded text-primary-600 hover:bg-primary-500/10"
                          title="Editar"
                          aria-label="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMeeting(m.id)}
                          disabled={deletingId !== null}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                          title="Excluir"
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
