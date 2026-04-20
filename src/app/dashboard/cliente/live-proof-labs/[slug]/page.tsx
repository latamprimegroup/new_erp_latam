import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LiveProofLabDetailClient } from './LiveProofLabDetailClient'

export default async function LiveProofLabDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard/cliente/live-proof-labs')
  if (session.user?.role !== 'CLIENT') redirect('/dashboard')
  const { slug } = await params
  return <LiveProofLabDetailClient slug={slug} />
}
