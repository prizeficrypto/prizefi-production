import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { events, leaderboard, users, adminSessions } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

const sqlClient = neon(process.env.DATABASE_URL!)
const db = drizzle(sqlClient)

async function verifyAdminSession(sessionToken: string | null) {
  if (!sessionToken) return null

  const sessions = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.sessionToken, sessionToken))
    .limit(1)

  if (sessions.length === 0) return null

  const session = sessions[0]
  if (new Date() > session.expiresAt) return null
  
  if (!session.mfaVerified) return null

  return session
}

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.headers.get('x-admin-session')
    
    const adminSession = await verifyAdminSession(sessionToken)
    if (!adminSession) {
      return NextResponse.json({ error: 'Unauthorized - MFA verification required' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const eventId = searchParams.get('eventId')
    const limit = parseInt(searchParams.get('limit') || '100')

    const allEvents = await db
      .select({
        id: events.id,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        frozen: events.frozen,
      })
      .from(events)
      .orderBy(desc(events.id))
      .limit(20)

    let participants: any[] = []

    if (eventId) {
      const eventIdNum = parseInt(eventId)
      
      participants = await db
        .select({
          rank: leaderboard.rank,
          address: leaderboard.address,
          totalScore: leaderboard.totalScore,
          username: users.username,
          isVerified: users.isVerified,
        })
        .from(leaderboard)
        .leftJoin(users, eq(leaderboard.address, users.address))
        .where(eq(leaderboard.eventId, eventIdNum))
        .orderBy(leaderboard.rank)
        .limit(limit)
    }

    return NextResponse.json({
      events: allEvents,
      participants,
      adminEmail: adminSession.email
    })
  } catch (error) {
    console.error('Error fetching admin rounds:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
