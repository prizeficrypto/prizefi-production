import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { flashLeaderboard, flashEvents, users } from '@/db/schema'
import { eq, desc, and, gte, lte, asc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const flashEventId = searchParams.get('flashEventId')
    const address = searchParams.get('address')

    let targetFlashEventId: number

    if (flashEventId) {
      targetFlashEventId = parseInt(flashEventId)
    } else {
      const now = new Date()
      const currentFlash = await db
        .select({ id: flashEvents.id })
        .from(flashEvents)
        .where(
          and(
            lte(flashEvents.startsAt, now),
            gte(flashEvents.endsAt, now)
          )
        )
        .orderBy(desc(flashEvents.id))
        .limit(1)

      if (currentFlash.length === 0) {
        const lastFlash = await db
          .select({ id: flashEvents.id })
          .from(flashEvents)
          .orderBy(desc(flashEvents.id))
          .limit(1)

        if (lastFlash.length === 0) {
          return NextResponse.json({
            leaderboard: [],
            flashEventId: null,
            prizePool: 0,
          })
        }
        targetFlashEventId = lastFlash[0].id
      } else {
        targetFlashEventId = currentFlash[0].id
      }
    }

    const flashEvent = await db
      .select()
      .from(flashEvents)
      .where(eq(flashEvents.id, targetFlashEventId))
      .limit(1)

    const prizePool = flashEvent.length > 0 ? parseFloat(flashEvent[0].prizePoolWld) : 0

    const leaderboardData = await db
      .select({
        address: flashLeaderboard.address,
        totalScore: flashLeaderboard.totalScore,
        rank: flashLeaderboard.rank,
        username: users.username,
        worldAppUsername: users.worldAppUsername,
        isVerified: users.isVerified,
        allTimeBestScore: users.allTimeBestScore,
      })
      .from(flashLeaderboard)
      .innerJoin(users, eq(flashLeaderboard.address, users.address))
      .where(eq(flashLeaderboard.flashEventId, targetFlashEventId))
      .orderBy(asc(flashLeaderboard.rank))
      .limit(100)

    let userRank = null
    let userScore = null
    if (address) {
      const userEntry = leaderboardData.find(
        (entry) => entry.address.toLowerCase() === address.toLowerCase()
      )
      if (userEntry) {
        userRank = userEntry.rank
        userScore = userEntry.totalScore
      }
    }

    return NextResponse.json({
      leaderboard: leaderboardData.map((entry) => ({
        address: entry.address,
        username: entry.worldAppUsername || entry.username || entry.address.slice(0, 8) + '...',
        totalScore: entry.totalScore,
        rank: entry.rank,
        isVerified: entry.isVerified,
        allTimeBestScore: entry.allTimeBestScore ?? 0,
      })),
      flashEventId: targetFlashEventId,
      prizePool,
      userRank,
      userScore,
      endsAt: flashEvent.length > 0 ? flashEvent[0].endsAt.toISOString() : null,
    })
  } catch (error) {
    console.error('Error fetching flash leaderboard:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
