import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { adminSessions, adminUsers } from '@/db/schema'
import { generateTOTPSecret, getTOTPUrl } from '@/app/lib/admin-auth'
import { eq } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

export async function POST(req: NextRequest) {
  try {
    const { sessionToken } = await req.json()

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

    // Check if MFA is already set up for this admin
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

    // Prevent re-setup if MFA is already configured
    if (admin.totpSecret) {
      return NextResponse.json(
        { error: 'MFA already set up for this admin' },
        { status: 400 }
      )
    }

    // Generate TOTP secret
    const totpSecret = generateTOTPSecret()

    // Store TOTP secret in adminUsers table (persistent)
    await db
      .update(adminUsers)
      .set({ 
        totpSecret,
        mfaSetupAt: new Date(),
      })
      .where(eq(adminUsers.email, session.email))

    // Generate QR code URL for Google Authenticator
    const otpauthURL = getTOTPUrl(session.email, totpSecret)

    // SECURITY: Never return the raw secret to client, only the QR URL
    return NextResponse.json({
      success: true,
      qrCodeURL: otpauthURL,
    })
  } catch (error) {
    console.error('MFA setup error:', error)
    return NextResponse.json(
      { error: 'MFA setup failed' },
      { status: 500 }
    )
  }
}
