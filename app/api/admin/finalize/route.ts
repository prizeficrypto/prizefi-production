import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { events, leaderboard, eventWinners, adminSessions, appConfig, eventChampions, users } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateMerkleTree, calculatePrizeAmount } from '@/lib/merkle'
import { ethers } from 'ethers'
import { z } from 'zod'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

const finalizeSchema = z.object({
  eventId: z.number().int().positive(),
})

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
  
  // CRITICAL: Require MFA verification before allowing event finalization
  if (!session.mfaVerified) return false

  return true
}

export async function POST(request: NextRequest) {
  try {
    // CRITICAL: Enforce MFA-verified session for privileged finalization
    const sessionToken = request.headers.get('x-admin-session')
    if (!await verifyAdminSession(sessionToken)) {
      return NextResponse.json(
        { error: 'Unauthorized - MFA verification required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { eventId } = finalizeSchema.parse(body)

    if (!eventId) {
      return NextResponse.json(
        { error: 'Event ID required' },
        { status: 400 }
      )
    }

    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    if (event.frozen) {
      return NextResponse.json(
        { error: 'Event already finalized' },
        { status: 400 }
      )
    }

    // Get the current prize pool from config
    const configs = await db.select().from(appConfig).limit(1)
    const prizePoolWld = configs.length > 0 ? parseFloat(configs[0].prizePoolWld) : 100

    const leaders = await db
      .select({
        id: leaderboard.id,
        eventId: leaderboard.eventId,
        address: leaderboard.address,
        totalScore: leaderboard.totalScore,
        rank: leaderboard.rank,
        updatedAt: leaderboard.updatedAt,
        isVerified: users.isVerified,
      })
      .from(leaderboard)
      .leftJoin(users, eq(leaderboard.address, users.address))
      .where(eq(leaderboard.eventId, eventId))
      .orderBy(desc(leaderboard.totalScore))
      .limit(100)

    if (leaders.length === 0) {
      return NextResponse.json(
        { error: 'No valid scores for event' },
        { status: 400 }
      )
    }

    const PRIZE_DIST = [24.50, 14.50, 12.00, 10.00, 9.00, 8.00, 7.00, 6.00, 5.00, 4.00]
    const winners = leaders.map((leader, index) => {
      const rank = index + 1
      const pct = rank <= 10 ? PRIZE_DIST[rank - 1] : 0
      let prizeAmount = (prizePoolWld * pct) / 100
      const isVerified = leader.isVerified ?? false
      if (!isVerified && prizeAmount > 0) {
        prizeAmount = prizeAmount * 0.25
      }
      prizeAmount = Math.round(prizeAmount * 100) / 100
      return {
        address: leader.address,
        amount: prizeAmount > 0 ? ethers.parseEther(prizeAmount.toString()).toString() : '0',
      }
    })

    const merkleData = generateMerkleTree(winners)

    await db.transaction(async (tx) => {
      await tx
        .update(events)
        .set({ frozen: true })
        .where(eq(events.id, eventId))

      const allLeaders = await tx
        .select()
        .from(leaderboard)
        .where(eq(leaderboard.eventId, eventId))
        .orderBy(desc(leaderboard.totalScore))

      for (let i = 0; i < allLeaders.length; i++) {
        await tx
          .update(leaderboard)
          .set({ rank: i + 1 })
          .where(eq(leaderboard.id, allLeaders[i].id))
      }

      await tx.insert(eventWinners).values({
        eventId,
        merkleRoot: merkleData.root,
        winnersData: JSON.stringify(winners),
        proofsData: JSON.stringify(merkleData.proofs),
      })

      if (allLeaders.length > 0) {
        const champion = allLeaders[0]
        const [championUser] = await tx
          .select()
          .from(users)
          .where(eq(users.address, champion.address))
          .limit(1)
        
        await tx.insert(eventChampions).values({
          eventId,
          address: champion.address,
          username: championUser?.worldAppUsername || championUser?.username || null,
          score: champion.totalScore,
          eventStartedAt: event.startsAt,
          eventEndedAt: event.endsAt,
        })
      }
    })

    console.log(`Event finalized successfully: ${eventId}, merkle root: ${merkleData.root}`)

    return NextResponse.json({
      success: true,
      eventId,
      merkleRoot: merkleData.root,
      winnersCount: winners.length,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error finalizing event:', error)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}
