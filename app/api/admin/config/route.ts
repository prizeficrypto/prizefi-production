import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { appConfig, adminSessions } from '@/db/schema'
import { eq } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

async function verifyAdminSession(sessionToken: string | null): Promise<boolean> {
  if (!sessionToken) return false

  const sessions = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.sessionToken, sessionToken))
    .limit(1)

  if (sessions.length === 0) return false

  const session = sessions[0]
  if (new Date() > session.expiresAt) return false
  
  // CRITICAL: Require MFA verification before granting admin access
  if (!session.mfaVerified) return false

  return true
}

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.headers.get('x-admin-session')

    // Verify admin session
    if (!await verifyAdminSession(sessionToken)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get config
    const configs = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.id, 'global'))
      .limit(1)

    if (configs.length === 0) {
      // Create default config if it doesn't exist
      await db.insert(appConfig).values({
        id: 'global',
        prizePoolWld: '2500',
        eventDurationSec: 5 * 24 * 60 * 60,
        version: 1,
      })

      return NextResponse.json({
        prizePoolWld: 2500,
        eventDurationSec: 5 * 24 * 60 * 60,
        version: 1,
      })
    }

    const config = configs[0]

    return NextResponse.json({
      prizePoolWld: parseFloat(config.prizePoolWld),
      eventDurationSec: config.eventDurationSec,
      cooldownSec: (config as any).cooldownSec || 600,
      nextEventStartAt: config.nextEventStartAt?.toISOString() || null,
      version: config.version,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    })
  } catch (error) {
    console.error('Get config error:', error)
    return NextResponse.json(
      { error: 'Failed to get config' },
      { status: 500 }
    )
  }
}
