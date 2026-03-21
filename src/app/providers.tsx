'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { GTMProvider } from '@/components/GTMProvider'
import { JoinChatWidget } from '@/components/JoinChatWidget'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <GTMProvider>
        <SessionProvider>{children}</SessionProvider>
        <JoinChatWidget />
      </GTMProvider>
    </ThemeProvider>
  )
}
