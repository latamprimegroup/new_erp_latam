'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Ticket = {
  id: string
  ticketNumber: string
  subject: string
  description: string
  category: string
  status: string
  createdAt: string
  client: { user: { name: string | null; email: string } }
  serviceOrder?: { orderNumber: string }
}

type Ordem = {
  id: string
  orderNumber: string
  title: string
  description: string
  type: string
  status: string
  createdAt: string
  client: { user: { name: string | null; email: string } }
  ticket?: { ticketNumber: string }
}

const STATUS_TICKET = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const STATUS_OS = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'CONCLUIDA', 'CANCELADA']

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tickets' | 'ordens'>('tickets')
  const [editId, setEditId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editNote, setEditNote] = useState('')

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/tickets?type=tickets').then((r) => r.json()),
      fetch('/api/admin/tickets?type=ordens').then((r) => r.json()),
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

  async function handleUpdate() {
    if (!editId) return
    const type = tab === 'tickets' ? 'ticket' : 'ordem'
    const res = await fetch('/api/admin/tickets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editId,
        type,
        status: editStatus || undefined,
        resolvedNote: editNote || undefined,
      }),
    })
    if (res.ok) {
      setEditId(null)
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-primary-600">
          ← Admin
        </Link>
        <h1 className="heading-1">Tickets e Ordens de Serviço</h1>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab('tickets')}
          className={`px-4 py-2 rounded-lg font-medium ${
            tab === 'tickets' ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-white/10'
          }`}
        >
          Tickets ({tickets.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('ordens')}
          className={`px-4 py-2 rounded-lg font-medium ${
            tab === 'ordens' ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-white/10'
          }`}
        >
          Ordens de Serviço ({ordens.length})
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : tab === 'tickets' ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  <th className="text-left py-2">#</th>
                  <th className="text-left py-2">Cliente</th>
                  <th className="text-left py-2">Assunto</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2"></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 dark:border-white/5">
                    <td className="py-3 font-mono text-primary-600">{t.ticketNumber}</td>
                    <td>
                      {t.client.user.name || t.client.user.email}
                      <br />
                      <span className="text-xs text-gray-500">{t.client.user.email}</span>
                    </td>
                    <td>
                      {t.subject}
                      {t.serviceOrder && (
                        <span className="text-xs text-primary-600 ml-1">→ {t.serviceOrder.orderNumber}</span>
                      )}
                    </td>
                    <td>{t.status}</td>
                    <td>{new Date(t.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td>
                      {editId === t.id ? (
                        <div className="flex gap-2 items-center">
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="input-field py-1 text-sm"
                          >
                            {STATUS_TICKET.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Nota de resolução"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            className="input-field py-1 text-sm w-40"
                          />
                          <button onClick={handleUpdate} className="btn-primary text-sm py-1">
                            Salvar
                          </button>
                          <button onClick={() => setEditId(null)} className="btn-secondary text-sm py-1">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditId(t.id)
                            setEditStatus(t.status)
                            setEditNote('')
                          }}
                          className="text-primary-600 hover:underline text-sm"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tickets.length === 0 && (
            <p className="text-gray-500 py-8 text-center">Nenhum ticket.</p>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  <th className="text-left py-2">#</th>
                  <th className="text-left py-2">Cliente</th>
                  <th className="text-left py-2">Título</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2"></th>
                </tr>
              </thead>
              <tbody>
                {ordens.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 dark:border-white/5">
                    <td className="py-3 font-mono text-primary-600">{o.orderNumber}</td>
                    <td>
                      {o.client.user.name || o.client.user.email}
                      <br />
                      <span className="text-xs text-gray-500">{o.client.user.email}</span>
                    </td>
                    <td>
                      {o.title}
                      {o.ticket && (
                        <span className="text-xs text-gray-500 ml-1">(Ticket: {o.ticket.ticketNumber})</span>
                      )}
                    </td>
                    <td>{o.status}</td>
                    <td>{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td>
                      {editId === o.id ? (
                        <div className="flex gap-2 items-center">
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="input-field py-1 text-sm"
                          >
                            {STATUS_OS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <button onClick={handleUpdate} className="btn-primary text-sm py-1">
                            Salvar
                          </button>
                          <button onClick={() => setEditId(null)} className="btn-secondary text-sm py-1">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditId(o.id)
                            setEditStatus(o.status)
                          }}
                          className="text-primary-600 hover:underline text-sm"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ordens.length === 0 && (
            <p className="text-gray-500 py-8 text-center">Nenhuma ordem de serviço.</p>
          )}
        </div>
      )}
    </div>
  )
}
