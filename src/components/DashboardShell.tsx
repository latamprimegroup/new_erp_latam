'use client'

import { useState } from 'react'
import { DashboardNav } from './DashboardNav'
import { DashboardHeader } from './DashboardHeader'

export function DashboardShell({
  user,
  children,
}: {
  user: { name?: string; email?: string; role?: string }
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-white to-primary-50/30 dark:from-ads-dark-bg dark:via-ads-dark-bg dark:to-ads-dark-bg">
      <DashboardNav
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader user={user} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
