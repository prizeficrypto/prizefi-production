import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { quests, userQuestProgress, demoScores, runs, tryCounter, users } from '@/db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'

const STANDARD_QUESTS = ['practice_score_500', 'competition_score_100']
const BOOSTED_QUESTS = ['competition_plays_5', 'practice_score_1000', 'competition_score_200', 'competition_score_500', 'competition_score_1000', 'competition_score_1500']

const DEFAULT_QUESTS = [
  { questKey: 'competition_plays_5', title: 'Tournament Regular', description: 'Participate in the competition 5 times', targetValue: 5, questType: 'competition_plays', isActive: true, sortOrder: 1 },
  { questKey: 'practice_score_500', title: 'Score Seeker', description: 'Reach a combined score of 500 in practice', targetValue: 500, questType: 'practice_total_score', isActive: true, sortOrder: 2 },
  { questKey: 'practice_score_1000', title: 'Score Hunter', description: 'Reach a combined score of 1,000 in practice', targetValue: 1000, questType: 'practice_total_score', isActive: true, sortOrder: 3 },
  { questKey: 'competition_score_100', title: 'Rising Star', description: 'Get a score of 100 in competition', targetValue: 100, questType: 'competition_high_score', isActive: true, sortOrder: 4 },
  { questKey: 'competition_score_200', title: 'Sharp Player', description: 'Get a score of 200 in competition', targetValue: 200, questType: 'competition_high_score', isActive: true, sortOrder: 5 },
  { questKey: 'competition_score_500', title: 'Elite Competitor', description: 'Get a score of 500 in competition', targetValue: 500, questType: 'competition_high_score', isActive: true, sortOrder: 6 },
  { questKey: 'competition_score_1000', title: 'Champion', description: 'Get a score of 1,000 in competition', targetValue: 1000, questType: 'competition_high_score', isActive: true, sortOrder: 7 },
  { questKey: 'competition_score_1500', title: 'Legend', description: 'Get a score of 1,500 in competition', targetValue: 1500, questType: 'competition_high_score', isActive: true, sortOrder: 8 },
]

async function ensureQuestsSeeded() {
  const existing = await db.select({ id: quests.id }).from(quests).limit(1)
  if (existing.length === 0) {
    console.log('[QUESTS] No quests found in database, seeding defaults...')
    await db.insert(quests).values(DEFAULT_QUESTS)
    console.log('[QUESTS] Seeded', DEFAULT_QUESTS.length, 'default quests')
  }
}

const QUEST_EPOCH = new Date('2026-02-10T04:00:00.000Z')

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawAddress = searchParams.get('address')

    await ensureQuestsSeeded()

    const allQuests = await db.select().from(quests).where(eq(quests.isActive, true)).orderBy(quests.sortOrder)

    if (!rawAddress) {
      return NextResponse.json({
        quests: allQuests.map(q => ({
          ...q,
          currentValue: 0,
          completed: false,
          rewardClaimed: false,
          rewardTier: BOOSTED_QUESTS.includes(q.questKey) ? 'boosted' : 'standard'
        }))
      })
    }

    const address = rawAddress.toLowerCase()

    const userProgress = await db.select().from(userQuestProgress).where(
      sql`LOWER(${userQuestProgress.address}) = ${address}`
    )
    const progressMap = new Map(userProgress.map(p => [p.questId, p]))

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

    const stats: Record<string, number> = {
      practice_total_score: Number(practiceStats[0]?.totalScore || 0),
      practice_games_played: Number(practiceStats[0]?.gamesPlayed || 0),
      practice_high_score: Number(practiceStats[0]?.highScore || 0),
      competition_plays: Number(competitionPlays[0]?.total || 0),
      competition_high_score: Number(competitionRuns[0]?.highScore || 0),
      daily_streak: 0
    }

    const questsWithProgress = allQuests.map(q => {
      const progress = progressMap.get(q.id)
      let currentValue = 0

      if (progress?.rewardClaimed) {
        currentValue = q.targetValue
      } else {
        currentValue = stats[q.questType] || 0
      }

      const completed = currentValue >= q.targetValue
      const rewardClaimed = progress?.rewardClaimed || false

      return {
        ...q,
        currentValue: Math.min(currentValue, q.targetValue),
        completed,
        rewardClaimed,
        rewardTier: BOOSTED_QUESTS.includes(q.questKey) ? 'boosted' : 'standard'
      }
    })

    return NextResponse.json({ quests: questsWithProgress })
  } catch (error) {
    console.error('Error fetching quests:', error)
    return NextResponse.json({ error: 'Failed to fetch quests' }, { status: 500 })
  }
}
