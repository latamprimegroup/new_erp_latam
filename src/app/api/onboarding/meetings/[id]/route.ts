/**
 * GET - Detalhe da reunião
 * PATCH - Atualizar (reagendar, concluir, cancelar)
 * DELETE - Remover
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  updateCalendarEvent,
  deleteCalendarEvent,
  createCalendarEvent,
  isGoogleCalendarConfigured,
} from '@/lib/google-calendar'
import { notifyOnboardingParticipants } from '@/lib/notifications/onboarding-events'

const ONBOARDING_ROLES = ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE', 'MANAGER', 'PRODUCTION_MANAGER'] as const

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED']).optional(),
  participantIds: z.array(z.string().cuid()).optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles([...ONBOARDING_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const meeting = await prisma.onboardingMeeting.findUnique({
    where: { id },
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      createdBy: { select: { name: true } },
    },
  })

  if (!meeting) return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 })
  return NextResponse.json(meeting)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles([...ONBOARDING_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const meeting = await prisma.onboardingMeeting.findUnique({
    where: { id },
    include: { client: { include: { user: { select: { name: true } } } } },
  })
  if (!meeting) return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 })

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const updates: Record<string, unknown> = {}
    let start = meeting.scheduledAt
    let end = new Date(start.getTime() + meeting.durationMinutes * 60 * 1000)

    if (data.title !== undefined) updates.title = data.title
    if (data.notes !== undefined) updates.notes = data.notes
    if (data.status !== undefined) updates.status = data.status
    if (data.scheduledAt !== undefined) {
      start = new Date(data.scheduledAt)
      updates.scheduledAt = start
    }
    if (data.durationMinutes !== undefined) {
      updates.durationMinutes = data.durationMinutes
      end = new Date(start.getTime() + data.durationMinutes * 60 * 1000)
    }

    if (data.participantIds && data.participantIds.length > 0) {
      await prisma.onboardingParticipant.deleteMany({ where: { meetingId: id } })
      await prisma.onboardingParticipant.createMany({
        data: data.participantIds.map((userId) => ({ meetingId: id, userId })),
      })
      const newParticipants = await prisma.user.findMany({
        where: { id: { in: data.participantIds } },
        select: { id: true },
      })
      if (meeting.status === 'SCHEDULED') {
        await notifyOnboardingParticipants(
          newParticipants.map((p) => p.id),
          id,
          meeting.client.user.name || 'Cliente',
          start,
          (data.title as string) || meeting.title,
          meeting.meetLink
        )
      }
    }

    if (meeting.googleCalendarEventId && isGoogleCalendarConfigured()) {
      if (data.status === 'CANCELLED') {
        await deleteCalendarEvent(meeting.googleCalendarEventId)
      } else if (data.title || data.scheduledAt || data.durationMinutes) {
        await updateCalendarEvent(meeting.googleCalendarEventId, {
          title: (data.title as string) || meeting.title,
          start,
          end,
        })
      }
    } else if (!meeting.googleCalendarEventId && data.status !== 'CANCELLED' && isGoogleCalendarConfigured()) {
      const calEvent = await createCalendarEvent({
        title: (data.title as string) || meeting.title,
        description: meeting.notes || undefined,
        start,
        end,
      })
      if (calEvent) {
        updates.googleCalendarEventId = calEvent.id
        if (calEvent.hangoutLink) updates.meetLink = calEvent.hangoutLink
      }
    }

    const updated = await prisma.onboardingMeeting.update({
      where: { id },
      data: updates,
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    })

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error('Onboarding update error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao atualizar' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles([...ONBOARDING_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const meeting = await prisma.onboardingMeeting.findUnique({ where: { id } })
  if (!meeting) return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 })

  if (meeting.googleCalendarEventId && isGoogleCalendarConfigured()) {
    await deleteCalendarEvent(meeting.googleCalendarEventId)
  }

  await prisma.onboardingMeeting.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
