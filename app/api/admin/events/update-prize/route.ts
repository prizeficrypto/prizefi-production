import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { events, auditLogs } from '@/db/schema'
import { eq } from 'drizzle-orm'

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

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.headers.get('x-admin-session')
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await verifyAdminSession(sessionToken)
    if (!session.valid) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const body = await request.json()
    const { eventId, prizePoolWld } = body

    if (!eventId || prizePoolWld === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const prizePool = parseFloat(prizePoolWld)
    if (isNaN(prizePool) || prizePool < 0.5 || prizePool > 100000) {
      return NextResponse.json({ error: 'Prize must be between 0.5 and 100,000 WLD' }, { status: 400 })
    }

    if (prizePool % 0.5 !== 0) {
      return NextResponse.json({ error: 'Prize pool must be a multiple of 0.5' }, { status: 400 })
    }

    const existingEvent = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)

    if (existingEvent.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const oldPrizePool = existingEvent[0].prizePoolWld

    await db
      .update(events)
      .set({ prizePoolWld: prizePool.toString() })
      .where(eq(events.id, eventId))

    await db.insert(auditLogs).values({
      action: 'UPDATE_EVENT_PRIZE',
      adminEmail: session.email || 'unknown',
      metadata: JSON.stringify({ 
        eventId, 
        oldPrizePool,
        newPrizePool: prizePool 
      }),
      ipAddress: getClientIP(request),
    })

    return NextResponse.json({ 
      success: true, 
      eventId,
      prizePoolWld: prizePool 
    })
  } catch (error) {
    console.error('Error updating event prize:', error)
    return NextResponse.json({ error: 'Failed to update event prize' }, { status: 500 })
  }
}
