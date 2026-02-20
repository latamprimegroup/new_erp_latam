/**
 * Integração com Google Calendar para agenda de onboarding
 * OAuth2 com refresh token
 */
import { google } from 'googleapis'

export type CreateEventParams = {
  title: string
  description?: string
  start: Date
  end: Date
  attendees?: { email: string }[]
}

export type CalendarEventResult = {
  id: string
  htmlLink?: string
}

function getCalendarClient() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) return null

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })

  return google.calendar({ version: 'v3', auth: oauth2 })
}

export function isGoogleCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  )
}

export async function createCalendarEvent(
  params: CreateEventParams
): Promise<CalendarEventResult | null> {
  const calendar = getCalendarClient()
  if (!calendar) return null

  const calendarId = process.env.GOOGLE_CALENDAR_CALENDAR_ID || 'primary'

  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: params.title,
        description: params.description,
        start: {
          dateTime: params.start.toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: params.end.toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
        attendees: params.attendees,
      },
      sendUpdates: 'all',
    })

    const event = res.data
    if (!event.id) return null

    return {
      id: event.id,
      htmlLink: event.htmlLink || undefined,
    }
  } catch (e) {
    console.error('Google Calendar create event error:', e)
    return null
  }
}

export async function updateCalendarEvent(
  eventId: string,
  params: Partial<CreateEventParams>
): Promise<CalendarEventResult | null> {
  const calendar = getCalendarClient()
  if (!calendar) return null

  const calendarId = process.env.GOOGLE_CALENDAR_CALENDAR_ID || 'primary'

  try {
    const body: Record<string, unknown> = {}
    if (params.title) body.summary = params.title
    if (params.description !== undefined) body.description = params.description
    if (params.attendees) body.attendees = params.attendees
    if (params.start || params.end) {
      body.start = {
        dateTime: (params.start || new Date()).toISOString(),
        timeZone: 'America/Sao_Paulo',
      }
      body.end = {
        dateTime: (params.end || new Date()).toISOString(),
        timeZone: 'America/Sao_Paulo',
      }
    }

    const res = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: body,
      sendUpdates: 'all',
    })

    const event = res.data
    if (!event.id) return null

    return {
      id: event.id,
      htmlLink: event.htmlLink || undefined,
    }
  } catch (e) {
    console.error('Google Calendar update event error:', e)
    return null
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const calendar = getCalendarClient()
  if (!calendar) return false

  const calendarId = process.env.GOOGLE_CALENDAR_CALENDAR_ID || 'primary'

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all',
    })
    return true
  } catch (e) {
    console.error('Google Calendar delete event error:', e)
    return false
  }
}
