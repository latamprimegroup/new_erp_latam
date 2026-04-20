import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export default function AdsWarRoomLayout({ children }: { children: React.ReactNode }) {
  return <div className={`min-h-full ${inter.className}`}>{children}</div>
}
