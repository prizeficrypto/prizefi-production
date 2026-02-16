import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { adminSessions, adminUsers } from '@/db/schema'
import { verifyTOTP } from '@/app/lib/admin-auth'
import { eq } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

export async function POST(req: NextRequest) {
  try {
    const { sessionToken, totpToken } = await req.json()

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

    // Get admin user with persistent TOTP secret
    const admins = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, session.email))
      .limit(1)

    if (admins.length === 0) {
      return NextResponse.json(
        { error: 'Admin user not found' },
        { status: 404 }
      )
    }

    const admin = admins[0]

    // Check if TOTP secret exists
    if (!admin.totpSecret) {
      return NextResponse.json(
        { error: 'MFA not set up' },
        { status: 400 }
      )
    }

    // Verify TOTP token against persistent secret
    if (!verifyTOTP(admin.totpSecret, totpToken)) {
      return NextResponse.json(
        { error: 'Invalid TOTP token' },
        { status: 401 }
      )
    }

    // Mark session as MFA verified
    await db
      .update(adminSessions)
      .set({ mfaVerified: true })
      .where(eq(adminSessions.id, session.id))

    return NextResponse.json({
      success: true,
      message: 'MFA verified successfully',
    })
  } catch (error) {
    console.error('MFA verification error:', error)
    return NextResponse.json(
      { error: 'MFA verification failed' },
      { status: 500 }
    )
  }
}
