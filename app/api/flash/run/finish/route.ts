import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { flashEvents, flashRuns, flashGameSessions, flashLeaderboard, users } from '@/db/schema'
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm'
import { createHmac } from 'crypto'
import { validateRunInputs } from '@/lib/runValidator'

const HMAC_SECRET = process.env.SERVER_HMAC_SECRET || 'flash-default-secret'

function verifyStartToken(address: string, flashEventId: number, seed: string, startedAt: number, token: string): boolean {
  const payload = `flash:${address}:${flashEventId}:${seed}:${startedAt}`
  const expected = createHmac('sha256', HMAC_SECRET).update(payload).digest('hex')
  return token === expected
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address, flashEventId, score, seed, inputLog, startToken, startedAt } = body

    if (!address || !flashEventId || score === undefined || !seed || !inputLog || !startToken || !startedAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!verifyStartToken(address, flashEventId, seed, startedAt, startToken)) {
      return NextResponse.json({ error: 'Invalid start token' }, { status: 400 })
    }

    const now = new Date()
    const flashEvent = await db
      .select()
      .from(flashEvents)
      .where(eq(flashEvents.id, flashEventId))
      .limit(1)

    if (flashEvent.length === 0) {
      return NextResponse.json({ error: 'Flash event not found' }, { status: 404 })
    }

    if (flashEvent[0].frozen || flashEvent[0].endsAt < now) {
      return NextResponse.json({ error: 'Flash event has ended' }, { status: 400 })
    }

    const existingRun = await db
      .select()
      .from(flashRuns)
      .where(eq(flashRuns.startToken, startToken))
      .limit(1)

    if (existingRun.length > 0) {
      return NextResponse.json({ error: 'Run already submitted' }, { status: 400 })
    }

    const validation = validateRunInputs(inputLog, seed, score, startedAt)
    if (!validation.valid) {
      console.error('Flash run validation failed:', validation.error)
      return NextResponse.json({ 
        error: 'Score validation failed',
        serverScore: validation.serverScore,
        clientScore: score,
        reason: validation.error
      }, { status: 400 })
    }

    const validatedScore = validation.serverScore || score

    const [newRun] = await db.insert(flashRuns).values({
      flashEventId,
      address,
      seed,
      inputLen: inputLog.length,
      score: validatedScore,
      startToken,
      startedAt,
      valid: true,
    }).returning()

    await db
      .update(flashGameSessions)
      .set({ 
        status: 'completed',
        finishedRunId: newRun.id,
        updatedAt: new Date()
      })
      .where(eq(flashGameSessions.startToken, startToken))

    const existingEntry = await db
      .select()
      .from(flashLeaderboard)
      .where(
        and(
          eq(flashLeaderboard.flashEventId, flashEventId),
          eq(flashLeaderboard.address, address)
        )
      )
      .limit(1)

    if (existingEntry.length > 0) {
      if (validatedScore > existingEntry[0].totalScore) {
        await db
          .update(flashLeaderboard)
          .set({ 
            totalScore: validatedScore,
            updatedAt: new Date()
          })
          .where(eq(flashLeaderboard.id, existingEntry[0].id))
      }
    } else {
      await db.insert(flashLeaderboard).values({
        flashEventId,
        address,
        totalScore: validatedScore,
      })
    }

    await db
      .update(users)
      .set({ allTimeBestScore: sql`GREATEST(${users.allTimeBestScore}, ${validatedScore})` })
      .where(eq(users.address, address))

    await db.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_score DESC) as new_rank
        FROM flash_leaderboard
        WHERE flash_event_id = ${flashEventId}
      )
      UPDATE flash_leaderboard
      SET rank = ranked.new_rank
      FROM ranked
      WHERE flash_leaderboard.id = ranked.id
    `)

    const userRank = await db
      .select({ rank: flashLeaderboard.rank })
      .from(flashLeaderboard)
      .where(
        and(
          eq(flashLeaderboard.flashEventId, flashEventId),
          eq(flashLeaderboard.address, address)
        )
      )
      .limit(1)

    return NextResponse.json({
      success: true,
      score: validatedScore,
      rank: userRank.length > 0 ? userRank[0].rank : null,
      prizePool: parseFloat(flashEvent[0].prizePoolWld),
    })
  } catch (error) {
    console.error('Error finishing flash run:', error)
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 })
  }
}
