import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { getCached, setCache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Keep database connection warm
    await db.execute(sql`SELECT 1`)
    
    // Pre-warm leaderboard cache if not already cached
    const demoKey = 'demo-leaderboard-10'
    if (!getCached(demoKey)) {
      const topScores = await db.execute(sql`
        SELECT 
          ROW_NUMBER() OVER (ORDER BY d.score DESC, d.submitted_at ASC) AS rank,
          d.player_name AS "playerName",
          d.wallet_address AS "walletAddress",
          d.score,
          d.submitted_at AS "submittedAt",
          u.world_app_username AS "worldAppUsername",
          COALESCE(u.is_verified, false) AS "isVerified"
        FROM demo_scores d
        LEFT JOIN users u ON LOWER(d.wallet_address) = LOWER(u.address)
        ORDER BY d.score DESC, d.submitted_at ASC
        LIMIT 10
      `)
      
      let champion = null
      if (topScores.rows.length > 0) {
        const topEntry = topScores.rows[0] as any
        champion = {
          score: topEntry.score,
          playerName: topEntry.playerName,
          walletAddress: topEntry.walletAddress,
          username: topEntry.worldAppUsername || null,
          isVerified: topEntry.isVerified ?? false,
          achievedAt: topEntry.submittedAt
        }
      }
      
      const formattedLeaderboard = topScores.rows.map((row: any) => ({
        ...row,
        username: row.worldAppUsername || null,
        isVerified: row.isVerified ?? false
      }))
      
      setCache(demoKey, { 
        leaderboard: formattedLeaderboard,
        myRank: null,
        myBestScore: null,
        champion
      }, 15000)
    }
    
    return NextResponse.json({ status: 'warm', timestamp: Date.now() })
  } catch (error) {
    console.error('Warmup failed:', error)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
