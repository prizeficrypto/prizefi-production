import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { quests, userQuestProgress, userRewards, demoScores, tryCounter, users, runs } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'

const QUEST_EPOCH = new Date('2026-02-10T04:00:00.000Z')

const STANDARD_QUESTS = ['practice_score_500', 'competition_score_100']
const BOOSTED_QUESTS = ['competition_plays_5', 'practice_score_1000', 'competition_score_200', 'competition_score_500', 'competition_score_1000', 'competition_score_1500']

function rollStandardReward(): { type: 'discount' | 'free_play'; discountPercent: number | null } {
  const roll = Math.random()
  if (roll < 0.0075) {
    return { type: 'free_play', discountPercent: null }
  }
  return { type: 'discount', discountPercent: 15 }
}

function rollBoostedReward(): { type: 'discount' | 'free_play'; discountPercent: number | null } {
  const roll = Math.random()
  if (roll < 0.0095) {
    return { type: 'free_play', discountPercent: null }
  } else if (roll < 0.2095) {
    return { type: 'discount', discountPercent: 15 }
  } else {
    return { type: 'discount', discountPercent: 25 }
  }
}

export async function POST(request: NextRequest) {
  try {
    const walletHeader = request.headers.get('x-wallet')
    const { address, questId } = await request.json()

    if (!address || !questId) {
      return NextResponse.json({ error: 'Missing address or questId' }, { status: 400 })
    }

    if (!walletHeader || walletHeader.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const normalizedAddress = address.toLowerCase()

    const quest = await db.select().from(quests).where(eq(quests.id, questId)).limit(1)
    if (!quest.length) {
      return NextResponse.json({ error: 'Quest not found' }, { status: 404 })
    }

    const existingProgress = await db
      .select()
      .from(userQuestProgress)
      .where(and(
        sql`LOWER(${userQuestProgress.address}) = ${normalizedAddress}`,
        eq(userQuestProgress.questId, questId)
      ))
      .limit(1)

    if (existingProgress.length && existingProgress[0].rewardClaimed) {
      return NextResponse.json({ error: 'Reward already claimed' }, { status: 400 })
    }

    const stats = await getQuestStats(normalizedAddress)
    const currentValue = stats[quest[0].questType as keyof typeof stats] || 0

    if (currentValue < quest[0].targetValue) {
      return NextResponse.json({ error: 'Quest not completed yet' }, { status: 400 })
    }

    const isBoosted = BOOSTED_QUESTS.includes(quest[0].questKey)
    const reward = isBoosted ? rollBoostedReward() : rollStandardReward()

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await db.insert(userRewards).values({
      address: normalizedAddress,
      rewardType: reward.type,
      discountPercent: reward.discountPercent,
      questId,
      expiresAt,
      used: false
    })

    if (existingProgress.length) {
      await db
        .update(userQuestProgress)
        .set({
          completed: true,
          rewardClaimed: true,
          completedAt: new Date(),
          claimedAt: new Date(),
          currentValue: quest[0].targetValue,
          updatedAt: new Date()
        })
        .where(eq(userQuestProgress.id, existingProgress[0].id))
    } else {
      await db.insert(userQuestProgress).values({
        address: normalizedAddress,
        questId,
        currentValue: quest[0].targetValue,
        completed: true,
        rewardClaimed: true,
        completedAt: new Date(),
        claimedAt: new Date()
      })
    }

    return NextResponse.json({
      success: true,
      reward: {
        type: reward.type,
        discountPercent: reward.discountPercent,
        rewardTier: isBoosted ? 'boosted' : 'standard'
      }
    })
  } catch (error) {
    console.error('Error claiming quest reward:', error)
    return NextResponse.json({ error: 'Failed to claim reward' }, { status: 500 })
  }
}

async function getQuestStats(address: string) {
  const practiceStats = await db
    .select({
      totalScore: sql<number>`COALESCE(SUM(score), 0)`,
      gamesPlayed: sql<number>`COUNT(*)`,
      highScore: sql<number>`COALESCE(MAX(score), 0)`
    })
    .from(demoScores)
    .where(and(
      sql`LOWER(${demoScores.walletAddress}) = ${address}`,
      sql`submitted_at >= ${QUEST_EPOCH}`
    ))

  const competitionPlays = await db
    .select({ total: sql<number>`COALESCE(SUM(count), 0)` })
    .from(tryCounter)
    .where(and(
      sql`LOWER(${tryCounter.address}) = ${address}`,
      sql`updated_at >= ${QUEST_EPOCH}`
    ))

  const competitionRuns = await db
    .select({
      highScore: sql<number>`COALESCE(MAX(score), 0)`
    })
    .from(runs)
    .where(and(
      sql`LOWER(${runs.address}) = ${address}`,
      sql`finished_at >= ${QUEST_EPOCH}`
    ))

  return {
    practice_total_score: Number(practiceStats[0]?.totalScore || 0),
    practice_games_played: Number(practiceStats[0]?.gamesPlayed || 0),
    practice_high_score: Number(practiceStats[0]?.highScore || 0),
    competition_plays: Number(competitionPlays[0]?.total || 0),
    competition_high_score: Number(competitionRuns[0]?.highScore || 0),
    daily_streak: 0
  }
}
