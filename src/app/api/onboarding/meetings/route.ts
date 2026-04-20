/**
 * GET - Listar reuniões de onboarding (agenda)
 * POST - Criar reunião, sync Google Calendar, push para participantes
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createCalendarEvent, isGoogleCalendarConfigured } from '@/lib/google-calendar'
import { notifyOnboardingParticipants } from '@/lib/notifications/onboarding-events'

const ONBOARDING_ROLES = ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE', 'MANAGER', 'PRODUCTION_MANAGER'] as const

const createSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().min(1).default('Onboarding Cliente'),
  notes: z.string().optional(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(240).default(30),
  participantIds: z.array(z.string().cuid()).min(1),
})

export async function GET(req: NextRequest) {
  const auth = await requireRoles([...ONBOARDING_ROLES])
  if (!auth.ok) return auth.response

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const clientId = req.nextUrl.searchParams.get('clientId')
  const order = req.nextUrl.searchParams.get('order')

  const where: Record<string, unknown> = {}
  if (from || to) {
    where.scheduledAt = {}
    if (from) (where.scheduledAt as Record<string, Date>).gte = new Date(from)
    if (to) (where.scheduledAt as Record<string, Date>).lte = new Date(to)
  }
  if (clientId) where.clientId = clientId

  const meetings = await prisma.onboardingMeeting.findMany({
    where,
    include: {
      client: {
        include: { user: { select: { name: true, email: true } } },
      },
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { scheduledAt: order === 'desc' ? 'desc' : 'asc' },
  })

  return NextResponse.json(meetings)
}

export async function POST(req: NextRequest) {
  const auth = await requireRoles([...ONBOARDING_ROLES])
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const client = await prisma.clientProfile.findUnique({
      where: { id: data.clientId },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    const start = new Date(data.scheduledAt)
    const end = new Date(start.getTime() + data.durationMinutes * 60 * 1000)

    let googleEventId: string | null = null
    let meetLinkFromCalendar: string | null = null
    if (isGoogleCalendarConfigured()) {
      const attendees = await prisma.user.findMany({
        where: { id: { in: data.participantIds } },
        select: { email: true },
      })
      const attendeeEmails = attendees
        .map((u) => u.email)
        .filter((e): e is string => !!e)
        .map((email) => ({ email }))
      const calEvent = await createCalendarEvent({
        title: data.title,
        description: data.notes || `Onboarding: ${client.user.name}`,
        start,
        end,
        attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
      })
      googleEventId = calEvent?.id ?? null
      meetLinkFromCalendar = calEvent?.hangoutLink ?? null
    }

    const meeting = await prisma.onboardingMeeting.create({
      data: {
        clientId: data.clientId,
        title: data.title,
        notes: data.notes,
        scheduledAt: start,
        durationMinutes: data.durationMinutes,
        googleCalendarEventId: googleEventId,
        meetLink: meetLinkFromCalendar,
        createdById: auth.session!.user!.id,
        participants: {
          create: data.participantIds.map((userId) => ({ userId })),
        },
      },
      include: {
        client: { include: { user: { select: { name: true } } } },
        participants: { include: { user: { select: { id: true } } } },
      },
    })

    await notifyOnboardingParticipants(
      data.participantIds,
      meeting.id,
      client.user.name || client.user.email,
      meeting.scheduledAt,
      meeting.title,
      meetLinkFromCalendar
    )

    return NextResponse.json(meeting)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error('Onboarding create error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao agendar' },
      { status: 500 }
    )
  }
}
