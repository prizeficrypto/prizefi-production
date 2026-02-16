import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { runs, demoScores, events, flashRuns, flashEvents } from '@/db/schema'
import { eq, desc, count, avg, max, sql, and, gte } from 'drizzle-orm'

function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-wallet')
  return response
}

export async function OPTIONS() {
  return addCorsHeaders(new NextResponse(null, { status: 200 }))
}

export async function GET(request: NextRequest) {
  try {
    const address = request.headers.get('x-wallet')?.toLowerCase()
    
    if (!address) {
      return addCorsHeaders(NextResponse.json(
        { error: 'wallet_required', message: 'Wallet address required' },
        { status: 400 }
      ))
    }

    const competitionStats = await db
      .select({
        totalGames: count(runs.id),
        totalScore: sql<number>`COALESCE(SUM(${runs.score}), 0)`,
        highScore: max(runs.score),
        avgScore: avg(runs.score),
      })
      .from(runs)
      .where(and(eq(runs.address, address), eq(runs.valid, true)))

    const recentCompetitionRuns = await db
      .select({
        id: runs.id,
        eventId: runs.eventId,
        score: runs.score,
        finishedAt: runs.finishedAt,
      })
      .from(runs)
      .where(and(eq(runs.address, address), eq(runs.valid, true)))
      .orderBy(desc(runs.finishedAt))
      .limit(10)

    const demoStats = await db
      .select({
        totalGames: count(demoScores.id),
        highScore: max(demoScores.score),
        avgScore: avg(demoScores.score),
      })
      .from(demoScores)
      .where(eq(demoScores.walletAddress, address))

    const recentDemoGames = await db
      .select({
        id: demoScores.id,
        playerName: demoScores.playerName,
        score: demoScores.score,
        submittedAt: demoScores.submittedAt,
      })
      .from(demoScores)
      .where(eq(demoScores.walletAddress, address))
      .orderBy(desc(demoScores.submittedAt))
      .limit(10)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const activityStats = await db
      .select({
        gamesLast30Days: count(runs.id),
      })
      .from(runs)
      .where(and(
        eq(runs.address, address),
        eq(runs.valid, true),
        gte(runs.finishedAt, thirtyDaysAgo)
      ))

    const demoActivityStats = await db
      .select({
        gamesLast30Days: count(demoScores.id),
      })
      .from(demoScores)
      .where(and(
        eq(demoScores.walletAddress, address),
        gte(demoScores.submittedAt, thirtyDaysAgo)
      ))

    const eventsParticipated = await db
      .select({
        eventCount: sql<number>`COUNT(DISTINCT ${runs.eventId})`,
      })
      .from(runs)
      .where(and(eq(runs.address, address), eq(runs.valid, true)))

    const flashStats = await db
      .select({
        totalGames: count(flashRuns.id),
        highScore: max(flashRuns.score),
        avgScore: avg(flashRuns.score),
      })
      .from(flashRuns)
      .where(and(eq(flashRuns.address, address), eq(flashRuns.valid, true)))

    const flashEventsParticipated = await db
      .select({
        eventCount: sql<number>`COUNT(DISTINCT ${flashRuns.flashEventId})`,
      })
      .from(flashRuns)
      .where(and(eq(flashRuns.address, address), eq(flashRuns.valid, true)))

    const recentFlashRuns = await db
      .select({
        id: flashRuns.id,
        flashEventId: flashRuns.flashEventId,
        score: flashRuns.score,
        finishedAt: flashRuns.finishedAt,
      })
      .from(flashRuns)
      .where(and(eq(flashRuns.address, address), eq(flashRuns.valid, true)))
      .orderBy(desc(flashRuns.finishedAt))
      .limit(10)

    const flashActivityStats = await db
      .select({
        gamesLast30Days: count(flashRuns.id),
      })
      .from(flashRuns)
      .where(and(
        eq(flashRuns.address, address),
        eq(flashRuns.valid, true),
        gte(flashRuns.finishedAt, thirtyDaysAgo)
      ))

    const performanceHistory = await db
      .select({
        score: runs.score,
        date: runs.finishedAt,
        type: sql<string>`'competition'`,
      })
      .from(runs)
      .where(and(eq(runs.address, address), eq(runs.valid, true)))
      .orderBy(desc(runs.finishedAt))
      .limit(30)

    const demoPerformanceHistory = await db
      .select({
        score: demoScores.score,
        date: demoScores.submittedAt,
        type: sql<string>`'demo'`,
      })
      .from(demoScores)
      .where(eq(demoScores.walletAddress, address))
      .orderBy(desc(demoScores.submittedAt))
      .limit(30)

    const flashPerformanceHistory = await db
      .select({
        score: flashRuns.score,
        date: flashRuns.finishedAt,
        type: sql<string>`'flash'`,
      })
      .from(flashRuns)
      .where(and(eq(flashRuns.address, address), eq(flashRuns.valid, true)))
      .orderBy(desc(flashRuns.finishedAt))
      .limit(30)

    const allPerformance = [
      ...performanceHistory.map(p => ({ score: p.score, date: p.date, type: 'competition' as const })),
      ...demoPerformanceHistory.map(p => ({ score: p.score, date: p.date, type: 'demo' as const })),
      ...flashPerformanceHistory.map(p => ({ score: p.score, date: p.date, type: 'flash' as const })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50)

    const stats = {
      competition: {
        totalGames: Number(competitionStats[0]?.totalGames || 0),
        totalScore: Number(competitionStats[0]?.totalScore || 0),
        highScore: Number(competitionStats[0]?.highScore || 0),
        avgScore: Math.round(Number(competitionStats[0]?.avgScore || 0)),
        eventsParticipated: Number(eventsParticipated[0]?.eventCount || 0),
        recentGames: recentCompetitionRuns.map(r => ({
          id: r.id,
          eventId: r.eventId,
          score: r.score,
          date: r.finishedAt,
        })),
      },
      demo: {
        totalGames: Number(demoStats[0]?.totalGames || 0),
        highScore: Number(demoStats[0]?.highScore || 0),
        avgScore: Math.round(Number(demoStats[0]?.avgScore || 0)),
        recentGames: recentDemoGames.map(g => ({
          id: g.id,
          playerName: g.playerName,
          score: g.score,
          date: g.submittedAt,
        })),
      },
      flash: {
        totalGames: Number(flashStats[0]?.totalGames || 0),
        highScore: Number(flashStats[0]?.highScore || 0),
        avgScore: Math.round(Number(flashStats[0]?.avgScore || 0)),
        eventsParticipated: Number(flashEventsParticipated[0]?.eventCount || 0),
        recentGames: recentFlashRuns.map(r => ({
          id: r.id,
          flashEventId: r.flashEventId,
          score: r.score,
          date: r.finishedAt,
        })),
      },
      activity: {
        competitionGamesLast30Days: Number(activityStats[0]?.gamesLast30Days || 0),
        demoGamesLast30Days: Number(demoActivityStats[0]?.gamesLast30Days || 0),
        flashGamesLast30Days: Number(flashActivityStats[0]?.gamesLast30Days || 0),
        totalGamesLast30Days: Number(activityStats[0]?.gamesLast30Days || 0) + 
          Number(demoActivityStats[0]?.gamesLast30Days || 0) +
          Number(flashActivityStats[0]?.gamesLast30Days || 0),
      },
      totals: {
        allTimeGames: Number(competitionStats[0]?.totalGames || 0) + 
          Number(demoStats[0]?.totalGames || 0) +
          Number(flashStats[0]?.totalGames || 0),
        overallHighScore: Math.max(
          Number(competitionStats[0]?.highScore || 0),
          Number(demoStats[0]?.highScore || 0),
          Number(flashStats[0]?.highScore || 0)
        ),
      },
      performanceHistory: allPerformance,
    }

    return addCorsHeaders(NextResponse.json(stats))
  } catch (error) {
    console.error('Error fetching stats:', error)
    return addCorsHeaders(NextResponse.json(
      { error: 'server_error', message: 'Failed to fetch stats' },
      { status: 500 }
    ))
  }
}
