import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { appConfig, adminSessions, auditLogs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getClientIP } from '@/app/lib/admin-auth'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

const updateConfigSchema = z.object({
  prizePoolWld: z.number().min(0.5).max(100000).multipleOf(0.5),
  eventDurationSec: z.number().int().min(60).max(60 * 60 * 24 * 30),
  cooldownSec: z.number().int().min(60).max(60 * 60 * 24).optional(),
  nextEventStartAt: z.string().nullable().optional(),
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
  
  // CRITICAL: Require MFA verification before allowing config updates
  if (!session.mfaVerified) return null

  return session
}

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.headers.get('x-admin-session')
    const session = await verifyAdminSession(sessionToken)

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const validatedData = updateConfigSchema.parse(body)

    // Get current config for audit log
    const currentConfigs = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.id, 'global'))
      .limit(1)

    const currentConfig = currentConfigs.length > 0 ? currentConfigs[0] : null

    // Update config
    const newVersion = (currentConfig?.version || 0) + 1

    // Parse the nextEventStartAt if provided
    const nextEventStartAt = validatedData.nextEventStartAt 
      ? new Date(validatedData.nextEventStartAt)
      : null

    if (currentConfig) {
      const updateData: any = {
        prizePoolWld: validatedData.prizePoolWld.toString(),
        eventDurationSec: validatedData.eventDurationSec,
        nextEventStartAt,
        version: newVersion,
        updatedBy: session.email,
        updatedAt: new Date(),
      }
      if (validatedData.cooldownSec !== undefined) {
        updateData.cooldownSec = validatedData.cooldownSec
      }
      await db
        .update(appConfig)
        .set(updateData)
        .where(eq(appConfig.id, 'global'))
    } else {
      await db.insert(appConfig).values({
        id: 'global',
        prizePoolWld: validatedData.prizePoolWld.toString(),
        eventDurationSec: validatedData.eventDurationSec,
        cooldownSec: validatedData.cooldownSec || 600,
        nextEventStartAt,
        version: newVersion,
        updatedBy: session.email,
      } as any)
    }

    // Create audit log
    await db.insert(auditLogs).values({
      action: 'UPDATE_CONFIG',
      adminEmail: session.email,
      metadata: JSON.stringify({
        oldPrizePool: currentConfig ? parseFloat(currentConfig.prizePoolWld) : null,
        newPrizePool: validatedData.prizePoolWld,
        oldEventDuration: currentConfig?.eventDurationSec || null,
        newEventDuration: validatedData.eventDurationSec,
        oldNextEventStartAt: currentConfig?.nextEventStartAt?.toISOString() || null,
        newNextEventStartAt: nextEventStartAt?.toISOString() || null,
      }),
      ipAddress: getClientIP(req),
    })

    return NextResponse.json({
      success: true,
      version: newVersion,
      prizePoolWld: validatedData.prizePoolWld,
      eventDurationSec: validatedData.eventDurationSec,
      nextEventStartAt: nextEventStartAt?.toISOString() || null,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Update config error:', error)
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 }
    )
  }
}
