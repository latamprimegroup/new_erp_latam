import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

function safeName(name: string): string | null {
  const decoded = decodeURIComponent(name)
  if (decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) return null
  if (!/^[\w.\-]+$/.test(decoded)) return null
  return decoded
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id, filename: rawName } = await params
  const filename = safeName(rawName)
  if (!filename) return NextResponse.json({ error: 'Nome inválido' }, { status: 400 })

  const rma = await prisma.accountReplacementRequest.findUnique({
    where: { id },
    select: { clientId: true },
  })
  if (!rma) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const role = session.user?.role
  let allowed = false
  if (role === 'CLIENT') {
    const client = await prisma.clientProfile.findUnique({ where: { userId: session.user!.id } })
    allowed = !!client && client.id === rma.clientId
  } else if (
    role &&
    ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'DELIVERER', 'COMMERCIAL', 'FINANCE'].includes(role)
  ) {
    allowed = true
  }

  if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const full = join(process.cwd(), 'uploads', 'rma', id, filename)
  try {
    const buf = await readFile(full)
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    const contentType = MIME[ext] || 'application/octet-stream'
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }
}
