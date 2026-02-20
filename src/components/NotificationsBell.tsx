'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Notification = {
  id: string
  title: string
  message: string
  read: boolean
  link: string | null
  createdAt: string
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  async function load() {
    const res = await fetch('/api/notificacoes')
    const data = await res.json()
    if (res.ok) {
      setList(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  async function markAllRead() {
    await fetch('/api/notificacoes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read: true }) })
    load()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) load(); }}
        className="relative p-2 text-gray-600 hover:text-[#1F2937] transition-colors rounded-lg hover:bg-gray-100"
        aria-label="Notificações"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-white border border-primary-600/10 rounded-lg shadow-ads-md z-20">
            <div className="p-2 border-b flex justify-between items-center">
              <span className="font-semibold text-sm">Notificações</span>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs link-accent">
                  Marcar todas como lidas
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Nenhuma notificação</p>
            ) : (
              <ul className="divide-y">
                {list.slice(0, 15).map((n) => (
                  <li key={n.id} className={n.read ? '' : 'bg-primary-50/50'}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block p-3 text-left hover:bg-gray-50">
                        <p className="text-sm font-medium">{n.title}</p>
                        <p className="text-xs text-gray-500 truncate">{n.message}</p>
                      </Link>
                    ) : (
                      <div className="p-3">
                        <p className="text-sm font-medium">{n.title}</p>
                        <p className="text-xs text-gray-500 truncate">{n.message}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
