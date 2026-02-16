import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { adminSessions } from '@/db/schema'
import { eq } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.headers.get('x-admin-session')

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session token provided' },
        { status: 401 }
      )
    }

    // Find session
    const sessions = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.sessionToken, sessionToken))
      .limit(1)

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    const session = sessions[0]

    // Check if session expired
    if (new Date() > session.expiresAt) {
      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      )
    }

    // CRITICAL: Check MFA verification before granting admin access
    if (!session.mfaVerified) {
      return NextResponse.json(
        { error: 'MFA not verified', mfaVerified: false },
        { status: 401 }
      )
    }

    return NextResponse.json({
      email: session.email,
      verified: true,
      mfaVerified: true,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json(
      { error: 'Session check failed' },
      { status: 500 }
    )
  }
}
