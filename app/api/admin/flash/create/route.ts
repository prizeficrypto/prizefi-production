import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { flashEvents, adminSessions, auditLogs } from '@/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'

const FLASH_DURATION_DAYS = 2

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.headers.get('x-admin-session')
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.sessionToken, sessionToken))
      .limit(1)

    if (session.length === 0 || new Date(session[0].expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    const body = await request.json()
    const { prizePoolWld } = body

    if (prizePoolWld === undefined) {
      return NextResponse.json({ error: 'Prize pool is required' }, { status: 400 })
    }

    if (prizePoolWld < 1 || prizePoolWld > 1000) {
      return NextResponse.json({ error: 'Prize must be between 1 and 1000 WLD' }, { status: 400 })
    }

    const now = new Date()
    const activeFlash = await db
      .select()
      .from(flashEvents)
      .where(
        and(
          lte(flashEvents.startsAt, now),
          gte(flashEvents.endsAt, now),
          eq(flashEvents.frozen, false)
        )
      )
      .limit(1)

    if (activeFlash.length > 0) {
      return NextResponse.json({ error: 'An active flash event already exists' }, { status: 400 })
    }

    const startsAt = now
    const endsAt = new Date(now.getTime() + FLASH_DURATION_DAYS * 24 * 60 * 60 * 1000)

    const [newFlash] = await db.insert(flashEvents).values({
      startsAt,
      endsAt,
      prizePoolWld: prizePoolWld.toString(),
      frozen: false,
    }).returning()

    await db.insert(auditLogs).values({
      action: 'CREATE_FLASH_EVENT',
      adminEmail: session[0].email,
      metadata: JSON.stringify({ 
        flashEventId: newFlash.id, 
        prizePoolWld,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        durationDays: FLASH_DURATION_DAYS
      }),
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    })

    return NextResponse.json({ 
      success: true, 
      flashEventId: newFlash.id,
      prizePoolWld,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString()
    })
  } catch (error) {
    console.error('Error creating flash event:', error)
    return NextResponse.json({ error: 'Failed to create flash event' }, { status: 500 })
  }
}
