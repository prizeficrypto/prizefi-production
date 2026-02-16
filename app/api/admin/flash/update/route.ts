import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { flashEvents, adminSessions, auditLogs } from '@/db/schema'
import { eq } from 'drizzle-orm'

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
    const { flashEventId, prizePoolWld } = body

    if (!flashEventId || prizePoolWld === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (prizePoolWld < 1 || prizePoolWld > 1000) {
      return NextResponse.json({ error: 'Prize must be between 1 and 1000 WLD' }, { status: 400 })
    }

    const existingFlash = await db
      .select()
      .from(flashEvents)
      .where(eq(flashEvents.id, flashEventId))
      .limit(1)

    if (existingFlash.length === 0) {
      return NextResponse.json({ error: 'Flash event not found' }, { status: 404 })
    }

    await db
      .update(flashEvents)
      .set({ prizePoolWld: prizePoolWld.toString() })
      .where(eq(flashEvents.id, flashEventId))

    await db.insert(auditLogs).values({
      action: 'UPDATE_FLASH_PRIZE',
      adminEmail: session[0].email,
      metadata: JSON.stringify({ flashEventId, prizePoolWld }),
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    })

    return NextResponse.json({ success: true, prizePoolWld })
  } catch (error) {
    console.error('Error updating flash prize:', error)
    return NextResponse.json({ error: 'Failed to update flash prize' }, { status: 500 })
  }
}
