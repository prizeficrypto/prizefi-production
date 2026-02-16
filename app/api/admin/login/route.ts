import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { adminSessions, adminUsers } from '@/db/schema'
import { isAuthorizedEmail, generateSessionToken, getClientIP } from '@/app/lib/admin-auth'
import { checkRateLimit } from '@/app/lib/rate-limiter'
import { eq } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

// Rate limit: 5 attempts per 15 minutes
const MAX_LOGIN_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    const ipAddress = getClientIP(req)

    // Check rate limit by IP + email combination
    const rateLimitKey = `${ipAddress}:${email}`
    const rateLimit = await checkRateLimit(
      rateLimitKey,
      'admin-login',
      MAX_LOGIN_ATTEMPTS,
      RATE_LIMIT_WINDOW_MS
    )

    if (!rateLimit.allowed) {
      const waitMinutes = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 60000)
      return NextResponse.json(
        { 
          error: `Too many login attempts. Please try again in ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''}.`,
          retryAfter: rateLimit.resetAt.toISOString(),
        },
        { status: 429 }
      )
    }

    // Check if email is authorized
    if (!isAuthorizedEmail(email)) {
      return NextResponse.json(
        { error: 'Access denied. Unauthorized email.' },
        { status: 403 }
      )
    }

    // Require ADMIN_PASSWORD to be set (no default fallback)
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
    if (!ADMIN_PASSWORD) {
      console.error('ADMIN_PASSWORD environment variable is not set')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    if (password !== ADMIN_PASSWORD) {
      // Log failed attempt for monitoring
      console.warn(`Failed admin login attempt from ${ipAddress} for ${email}`)
      return NextResponse.json(
        { 
          error: 'Invalid password',
          remainingAttempts: rateLimit.remaining,
        },
        { status: 401 }
      )
    }

    // Ensure admin user exists
    const existingAdmins = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1)

    if (existingAdmins.length === 0) {
      // Create admin user record (TOTP secret will be set during MFA setup)
      await db.insert(adminUsers).values({ email })
    }

    const adminUser = existingAdmins.length > 0 ? existingAdmins[0] : { email, totpSecret: null, mfaSetupAt: null }

    // Create session
    const sessionToken = generateSessionToken()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await db.insert(adminSessions).values({
      email,
      sessionToken,
      mfaVerified: false,
      ipAddress,
      expiresAt,
    })

    return NextResponse.json({
      success: true,
      sessionToken,
      requiresMFA: true,
      mfaSetup: !!adminUser.totpSecret, // true if MFA already set up
    })
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}
