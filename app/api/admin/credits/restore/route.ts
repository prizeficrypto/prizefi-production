import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { credits, runs, auditLogs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getClientIP } from '@/app/lib/admin-auth'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

function verifyApiKey(apiKey: string | null): boolean {
  if (!apiKey) return false
  return apiKey === process.env.ADMIN_API_KEY
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-admin-key')
    
    if (!verifyApiKey(apiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { address, eventId } = body

    if (!address || !eventId) {
      return NextResponse.json(
        { error: 'Missing address or eventId' },
        { status: 400 }
      )
    }

    // Find the credit with case-insensitive address matching
    const allCreditsForEvent = await db
      .select()
      .from(credits)
      .where(eq(credits.eventId, eventId))
    
    const matchingCredit = allCreditsForEvent.find(
      c => c.address.toLowerCase() === address.toLowerCase()
    )
    
    if (!matchingCredit) {
      return NextResponse.json({
        success: false,
        error: 'No credit found for this address and event',
        debug: { 
          searchedAddress: address.toLowerCase(),
          eventId,
          creditsInEvent: allCreditsForEvent.map(c => c.address.substring(0, 10))
        }
      }, { status: 404 })
    }

    const actualAddress = matchingCredit.address

    const allRunsForEvent = await db
      .select()
      .from(runs)
      .where(eq(runs.eventId, eventId))
    
    const existingRun = allRunsForEvent.find(
      r => r.address.toLowerCase() === address.toLowerCase()
    )

    if (existingRun) {
      return NextResponse.json({
        success: false,
        error: 'User already has a run for this event - cannot restore credit'
      }, { status: 400 })
    }

    if (!matchingCredit.used) {
      return NextResponse.json({
        success: false,
        error: 'Credit is not used - no need to restore'
      }, { status: 400 })
    }

    const normalizedAddress = address.toLowerCase()
    
    await db
      .update(credits)
      .set({
        address: normalizedAddress,
        used: false,
        balance: 1,
        updatedAt: new Date()
      })
      .where(eq(credits.id, matchingCredit.id))

    await db.insert(auditLogs).values({
      action: 'RESTORE_CREDIT',
      adminEmail: 'api-key',
      metadata: JSON.stringify({
        address: normalizedAddress,
        eventId,
        reason: 'Score submission failed - credit restored for retry'
      }),
      ipAddress: getClientIP(req),
    })

    return NextResponse.json({
      success: true,
      message: `Credit restored for ${normalizedAddress} on event ${eventId}`
    })
  } catch (error) {
    console.error('Restore credit error:', error)
    return NextResponse.json(
      { error: 'Failed to restore credit', details: String(error) },
      { status: 500 }
    )
  }
}
