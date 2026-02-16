import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { runs, leaderboard, events, credits, tryCounter } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

function verifyApiKey(apiKey: string | null): boolean {
  if (!apiKey) return false
  return apiKey === process.env.ADMIN_API_KEY
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-admin-key')
    
    if (!verifyApiKey(apiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const address = req.nextUrl.searchParams.get('address')

    const allEvents = await db.select().from(events).orderBy(desc(events.id)).limit(5)
    
    const recentRuns = await db.select().from(runs).orderBy(desc(runs.id)).limit(10)
    
    const allLeaderboard = await db.select().from(leaderboard).orderBy(desc(leaderboard.id)).limit(20)
    
    const allCredits = await db.select().from(credits).orderBy(desc(credits.updatedAt)).limit(20)
    
    const allTries = await db.select().from(tryCounter).orderBy(desc(tryCounter.count)).limit(20)

    let userRuns = null
    let userLeaderboard = null
    let userCredits = null
    if (address) {
      userRuns = await db.select().from(runs).where(eq(runs.address, address)).orderBy(desc(runs.id)).limit(10)
      userLeaderboard = await db.select().from(leaderboard).where(eq(leaderboard.address, address)).limit(10)
      userCredits = await db.select().from(credits).where(eq(credits.address, address)).limit(10)
    }

    return NextResponse.json({
      events: allEvents.map(e => ({
        id: e.id,
        startsAt: e.startsAt?.toISOString(),
        endsAt: e.endsAt?.toISOString(),
        frozen: e.frozen
      })),
      recentRuns: recentRuns.map(r => ({
        id: r.id,
        eventId: r.eventId,
        address: r.address?.substring(0, 10) + '...',
        score: r.score,
        finishedAt: r.finishedAt?.toISOString()
      })),
      leaderboardEntries: allLeaderboard.map(l => ({
        id: l.id,
        eventId: l.eventId,
        address: l.address?.substring(0, 10) + '...',
        totalScore: l.totalScore,
        rank: l.rank
      })),
      credits: allCredits.map(c => ({
        address: c.address?.substring(0, 10) + '...',
        eventId: c.eventId,
        balance: c.balance,
        used: c.used,
        expiredAt: c.expiredAt?.toISOString()
      })),
      tries: allTries.map(t => ({
        address: t.address?.substring(0, 10) + '...',
        eventId: t.eventId,
        count: t.count
      })),
      userSpecific: address ? {
        runs: userRuns,
        leaderboard: userLeaderboard,
        credits: userCredits
      } : null
    })
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 })
  }
}
