'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type SupportTicket = {
  id: string
  ticketNumber: string
  subject: string
  description: string
  category: string
  status: string
  priority?: string
  createdAt: string
  serviceOrder?: { orderNumber: string }
}

type ServiceOrder = {
  id: string
  orderNumber: string
  title: string
  description: string
  type: string
  status: string
  createdAt: string
  ticket?: { ticketNumber: string }
}

const CATEGORIAS = [
  { value: 'GERAL', label: 'Geral' },
  { value: 'DUVIDA', label: 'Dúvida' },
  { value: 'PROBLEMA', label: 'Problema' },
  { value: 'SOLICITACAO', label: 'Solicitação' },
]

const TIPOS_OS = [
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'CONFIGURACAO', label: 'Configuração' },
  { value: 'TREINAMENTO', label: 'Treinamento' },
  { value: 'SUPORTE', label: 'Suporte técnico' },
  { value: 'OUTRO', label: 'Outro' },
]

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_CLIENTE: 'Aguardando você',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

export default function SuportePage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [ordens, setOrdens] = useState<ServiceOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tickets' | 'ordens' | 'novo'>('tickets')
  const [tipoForm, setTipoForm] = useState<'ticket' | 'ordem'>('ticket')
  const [form, setForm] = useState({
    subject: '',
    title: '',
    description: '',
    category: 'GERAL',
    priority: 'NORMAL',
    type: 'SUPORTE',
    createServiceOrder: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/cliente/tickets').then((r) => r.json()),
      fetch('/api/cliente/ordens-servico').then((r) => r.json()),
    ])
      .then(([t, o]) => {
        setTickets(Array.isArray(t) ? t : [])
        setOrdens(Array.isArray(o) ? o : [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setWhatsappUrl(null)
    try {
      const res = await fetch('/api/cliente/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: form.subject,
          description: form.description,
          category: form.category,
          priority: form.priority,
          createServiceOrder: form.createServiceOrder,
          serviceOrderType: form.type,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setForm({ ...form, subject: '', description: '' })
        load()
        setTab('tickets')
        if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl)
      } else {
        alert(data.error || 'Erro ao criar ticket')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateOrdem(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setWhatsappUrl(null)
    try {
      const res = await fetch('/api/cliente/ordens-servico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          type: form.type,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setForm({ ...form, title: '', description: '' })
        load()
        setTab('ordens')
        if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl)
      } else {
        alert(data.error || 'Erro ao criar ordem de serviço')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/cliente" className="text-gray-500 dark:text-gray-400 hover:text-primary-600">
          ← Voltar
        </Link>
        <h1 className="heading-1">Suporte e Ordens de Serviço</h1>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab('tickets')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === 'tickets'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20'
          }`}
        >
          Meus tickets
        </button>
        <button
          type="button"
          onClick={() => setTab('ordens')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === 'ordens'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20'
          }`}
        >
          Ordens de serviço
        </button>
        <button
          type="button"
          onClick={() => setTab('novo')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === 'novo'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20'
          }`}
        >
          + Novo
        </button>
      </div>

      {whatsappUrl && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200 mb-2">Registro criado com sucesso!</p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 btn-primary text-sm py-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Abrir no WhatsApp
          </a>
        </div>
      )}

      {tab === 'tickets' && (
        <div className="card">
          <h2 className="heading-2 mb-4">Meus Tickets</h2>
          {loading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : tickets.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Nenhum ticket ainda. Crie um novo acima.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="border border-gray-200 dark:border-white/10 rounded-lg p-4 hover:border-primary-600/30 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-mono text-primary-600 bg-primary-500/10 px-2 py-0.5 rounded">
                        {t.ticketNumber}
                      </span>
                      {t.priority && t.priority !== 'NORMAL' && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 ml-1">
                          {PRIORITY_LABELS[t.priority] || t.priority}
                        </span>
                      )}
                      <h3 className="font-medium mt-1">{t.subject}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{t.description}</p>
                      {t.serviceOrder && (
                        <p className="text-xs text-primary-600 mt-1">OS: {t.serviceOrder.orderNumber}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        t.status === 'RESOLVED' || t.status === 'CLOSED'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}
                    >
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'ordens' && (
        <div className="card">
          <h2 className="heading-2 mb-4">Ordens de Serviço</h2>
          {loading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : ordens.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Nenhuma ordem ainda.</p>
          ) : (
            <div className="space-y-3">
              {ordens.map((o) => (
                <div
                  key={o.id}
                  className="border border-gray-200 dark:border-white/10 rounded-lg p-4 hover:border-primary-600/30 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-mono text-primary-600 bg-primary-500/10 px-2 py-0.5 rounded">
                        {o.orderNumber}
                      </span>
                      <h3 className="font-medium mt-1">{o.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{o.description}</p>
                      {o.ticket && (
                        <p className="text-xs text-gray-500 mt-1">Ticket: {o.ticket.ticketNumber}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        o.status === 'CONCLUIDA'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}
                    >
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(o.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'novo' && (
        <div className="card">
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setTipoForm('ticket')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                tipoForm === 'ticket' ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-white/10'
              }`}
            >
              Ticket de suporte
            </button>
            <button
              type="button"
              onClick={() => setTipoForm('ordem')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                tipoForm === 'ordem' ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-white/10'
              }`}
            >
              Ordem de serviço
            </button>
          </div>

          {tipoForm === 'ticket' ? (
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Assunto</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="input-field"
                  placeholder="Ex: Problema na conta entregue"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Mensagem</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="input-field min-h-[120px]"
                  placeholder="Descreva em detalhes..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Categoria</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="input-field"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Prioridade</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="input-field"
                >
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="createOS"
                  checked={form.createServiceOrder}
                  onChange={(e) => setForm((f) => ({ ...f, createServiceOrder: e.target.checked }))}
                  className="rounded border-gray-300 text-primary-600"
                />
                <label htmlFor="createOS" className="text-sm text-gray-700 dark:text-gray-300">
                  Criar ordem de serviço vinculada
                </label>
              </div>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Enviando...' : 'Criar ticket e notificar via WhatsApp'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateOrdem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Título</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="input-field"
                  placeholder="Ex: Configuração de remarketing"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="input-field min-h-[120px]"
                  placeholder="Descreva o serviço desejado..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="input-field"
                >
                  {TIPOS_OS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Enviando...' : 'Criar ordem e notificar via WhatsApp'}
              </button>
            </form>
          )}

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Ao criar, nossa equipe será notificada e você poderá acompanhar pelo WhatsApp.
          </p>
        </div>
      )}
    </div>
  )
}
