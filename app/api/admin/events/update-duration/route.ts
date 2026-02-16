import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { events, auditLogs } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'

const updateDurationSchema = z.object({
  eventId: z.number().int().positive(),
  durationDays: z.number().min(0).max(30),
  durationHours: z.number().min(0).max(23),
})

function getClientIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
         req.headers.get('x-real-ip') || 
         'unknown'
}

async function verifyAdminSession(sessionToken: string): Promise<{ valid: boolean; email?: string }> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000'}/api/admin/session`, {
      headers: { 'x-admin-session': sessionToken },
    })
    if (!res.ok) return { valid: false }
    const data = await res.json()
    return { valid: true, email: data.email }
  } catch {
    return { valid: false }
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.headers.get('x-admin-session')
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await verifyAdminSession(sessionToken)
    if (!session.valid) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const body = await req.json()
    const validated = updateDurationSchema.parse(body)

    const totalDurationSec = validated.durationDays * 24 * 60 * 60 + validated.durationHours * 60 * 60

    if (totalDurationSec < 3600) {
      return NextResponse.json({ error: 'Duration must be at least 1 hour' }, { status: 400 })
    }

    const eventResult = await db
      .select()
      .from(events)
      .where(eq(events.id, validated.eventId))
      .limit(1)

    if (eventResult.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const event = eventResult[0]
    const oldEndsAt = event.endsAt
    const newEndsAt = new Date(event.startsAt.getTime() + totalDurationSec * 1000)

    await db
      .update(events)
      .set({ endsAt: newEndsAt })
      .where(eq(events.id, validated.eventId))

    await db.insert(auditLogs).values({
      action: 'UPDATE_EVENT_DURATION',
      adminEmail: session.email || 'unknown',
      metadata: JSON.stringify({
        eventId: validated.eventId,
        oldEndsAt: oldEndsAt.toISOString(),
        newEndsAt: newEndsAt.toISOString(),
        durationDays: validated.durationDays,
        durationHours: validated.durationHours,
      }),
      ipAddress: getClientIP(req),
    })

    return NextResponse.json({
      success: true,
      eventId: validated.eventId,
      newEndsAt: newEndsAt.toISOString(),
      message: `Event ${validated.eventId} duration updated successfully`,
    })
  } catch (error) {
    console.error('Error updating event duration:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input data' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
