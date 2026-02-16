import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { events, appConfig, adminSessions, auditLogs, credits } from '@/db/schema'
import { eq, and, sql as sqlOp } from 'drizzle-orm'
import { z } from 'zod'
import { getClientIP } from '@/app/lib/admin-auth'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

const newEventSchema = z.object({
  durationHours: z.number().min(1).max(720).optional(),
  prizePoolWld: z.number().min(0.5).max(100000).optional(),
})

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

async function verifyApiKey(apiKey: string | null): Promise<boolean> {
  if (!apiKey) return false
  return apiKey === process.env.ADMIN_API_KEY
}

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.headers.get('x-admin-session')
    const apiKey = req.headers.get('x-admin-key')
    
    const session = await verifyAdminSession(sessionToken)
    const validApiKey = await verifyApiKey(apiKey)
    
    if (!session && !validApiKey) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let body = {}
    try {
      body = await req.json()
    } catch {
      // Empty body is OK, we'll use defaults
    }
    
    const validated = newEventSchema.parse(body)

    const configs = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.id, 'global'))
      .limit(1)

    let defaultDurationSec = 2 * 24 * 60 * 60
    let defaultPrizePool = 2500
    
    if (configs.length > 0) {
      defaultDurationSec = configs[0].eventDurationSec
      defaultPrizePool = parseFloat(configs[0].prizePoolWld)
    }

    const durationSec = validated.durationHours 
      ? validated.durationHours * 60 * 60 
      : defaultDurationSec
    
    const prizePool = validated.prizePoolWld ?? defaultPrizePool

    if (validated.prizePoolWld !== undefined) {
      await db
        .update(appConfig)
        .set({
          prizePoolWld: prizePool.toString(),
          eventDurationSec: durationSec,
          updatedAt: new Date(),
          updatedBy: session?.email || 'api-key',
        })
        .where(eq(appConfig.id, 'global'))
    }

    const now = new Date()
    const endsAt = new Date(now.getTime() + durationSec * 1000)

    const [newEvent] = await db
      .insert(events)
      .values({
        startsAt: now,
        endsAt: endsAt,
        frozen: false,
      })
      .returning()

    // CRITICAL: Expire all unused credits from previous events
    // This prevents "unusedCreditExists" errors when users try to buy for the new event
    const expiredCredits = await db
      .update(credits)
      .set({
        expiredAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(credits.used, false),
        sqlOp`${credits.expiredAt} IS NULL`,
        sqlOp`${credits.eventId} != ${newEvent.id}`
      ))
      .returning()

    console.log(`[EVENT] Expired ${expiredCredits.length} unused credits from previous events`)

    await db.insert(auditLogs).values({
      action: 'CREATE_EVENT',
      adminEmail: session?.email || 'api-key',
      metadata: JSON.stringify({
        eventId: newEvent.id,
        durationHours: durationSec / 3600,
        prizePool,
        startsAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
      }),
      ipAddress: getClientIP(req),
    })

    return NextResponse.json({
      success: true,
      event: {
        id: newEvent.id,
        startsAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
        durationHours: Math.round(durationSec / 3600),
        prizePoolWld: prizePool,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Create event error:', error)
    return NextResponse.json(
      { error: 'Failed to create event' },
      { status: 500 }
    )
  }
}
