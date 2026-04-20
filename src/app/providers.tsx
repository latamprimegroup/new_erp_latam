'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { GTMProvider } from '@/components/GTMProvider'
import { FooterCustomScripts } from '@/components/FooterCustomScripts'
import { JoinChatWidget } from '@/components/JoinChatWidget'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <GTMProvider>
          {children}
          <JoinChatWidget />
          <FooterCustomScripts />
        </GTMProvider>
      </SessionProvider>
    </ThemeProvider>
  )
}
