'use client'

import dynamic from 'next/dynamic'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { GTMProvider } from '@/components/GTMProvider'
import { FooterCustomScripts } from '@/components/FooterCustomScripts'
import { JoinChatWidget } from '@/components/JoinChatWidget'

const SessionAuthProvider = dynamic(
  () => import('@/components/auth/SessionAuthProvider').then((m) => m.SessionAuthProvider),
  { ssr: false },
)

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionAuthProvider>
        <GTMProvider>
          {children}
          <JoinChatWidget />
          <FooterCustomScripts />
        </GTMProvider>
      </SessionAuthProvider>
    </ThemeProvider>
  )
}
