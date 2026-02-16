import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { flashEvents, flashCredits, flashGameSessions, users } from '@/db/schema'
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import crypto from 'crypto'
import { createHmac } from 'crypto'

const HMAC_SECRET = process.env.SERVER_HMAC_SECRET || 'flash-default-secret'

function generateSeed(): string {
  return crypto.randomBytes(16).toString('hex')
}

function generateStartToken(address: string, flashEventId: number, seed: string, startedAt: number): string {
  const payload = `flash:${address}:${flashEventId}:${seed}:${startedAt}`
  return createHmac('sha256', HMAC_SECRET).update(payload).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address } = body

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 })
    }

    const now = new Date()
    const currentFlash = await db
      .select()
      .from(flashEvents)
      .where(
        and(
          lte(flashEvents.startsAt, now),
          gte(flashEvents.endsAt, now),
          eq(flashEvents.frozen, false)
        )
      )
      .orderBy(desc(flashEvents.id))
      .limit(1)

    if (currentFlash.length === 0) {
      return NextResponse.json({ error: 'No active flash event' }, { status: 400 })
    }

    const flashEvent = currentFlash[0]

    const creditResult = await db
      .select()
      .from(flashCredits)
      .where(
        and(
          eq(flashCredits.address, address),
          eq(flashCredits.flashEventId, flashEvent.id)
        )
      )
      .limit(1)

    if (creditResult.length === 0 || creditResult[0].balance <= 0) {
      return NextResponse.json({ 
        error: 'No flash credit available',
        needsPayment: true 
      }, { status: 400 })
    }

    if (creditResult[0].used) {
      return NextResponse.json({ 
        error: 'Flash credit already used for this event',
        alreadyUsed: true 
      }, { status: 400 })
    }

    const existingSession = await db
      .select()
      .from(flashGameSessions)
      .where(
        and(
          eq(flashGameSessions.address, address),
          eq(flashGameSessions.flashEventId, flashEvent.id),
          eq(flashGameSessions.status, 'in_progress')
        )
      )
      .limit(1)

    if (existingSession.length > 0) {
      return NextResponse.json({
        seed: existingSession[0].seed,
        flashEventId: flashEvent.id,
        startToken: existingSession[0].startToken,
        startedAt: existingSession[0].startedAt,
        resuming: true,
      })
    }

    const seed = generateSeed()
    const startedAt = Date.now()
    const startToken = generateStartToken(address, flashEvent.id, seed, startedAt)

    await db.insert(flashGameSessions).values({
      flashEventId: flashEvent.id,
      address,
      tryNumber: 1,
      seed,
      startToken,
      status: 'in_progress',
      startedAt,
    })

    await db
      .update(flashCredits)
      .set({ used: true, updatedAt: new Date() })
      .where(eq(flashCredits.id, creditResult[0].id))

    return NextResponse.json({
      seed,
      flashEventId: flashEvent.id,
      startToken,
      startedAt,
      prizePool: parseFloat(flashEvent.prizePoolWld),
    })
  } catch (error) {
    console.error('Error starting flash run:', error)
    return NextResponse.json({ error: 'Failed to start flash run' }, { status: 500 })
  }
}
