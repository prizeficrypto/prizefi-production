import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { createServerError } from '@/lib/security/validation'
import { getCached, setCache } from '@/lib/cache'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limitParam = searchParams.get('limit') || '10'
    const parsedLimit = parseInt(limitParam, 10)
    const limit = isNaN(parsedLimit) ? 10 : Math.min(Math.max(parsedLimit, 1), 10)
    const walletAddress = searchParams.get('address')
    const noCache = searchParams.get('nocache') === '1'

    // Check cache first (15 second TTL for high traffic)
    const cacheKey = `demo-leaderboard-v2-${limit}`
    const cached = getCached<any>(cacheKey)
    if (cached && !walletAddress && !noCache) {
      return addCorsHeaders(NextResponse.json(cached))
    }

    // Get each user's BEST score only using ROW_NUMBER deduplication
    const topScores = await db.execute(sql`
      WITH ranked AS (
        SELECT 
          d.player_name,
          d.wallet_address,
          d.score,
          d.submitted_at,
          u.world_app_username,
          COALESCE(u.is_verified, false) as is_verified,
          COALESCE(
            NULLIF(TRIM(u.world_app_username), ''),
            NULLIF(TRIM(d.wallet_address), ''),
            d.player_name
          ) as display_key,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(
              NULLIF(TRIM(u.world_app_username), ''),
              NULLIF(TRIM(d.wallet_address), ''),
              d.player_name
            )
            ORDER BY d.score DESC, d.submitted_at ASC
          ) as rn
        FROM demo_scores d
        LEFT JOIN users u ON LOWER(d.wallet_address) = LOWER(u.address)
      )
      SELECT 
        ROW_NUMBER() OVER (ORDER BY score DESC, submitted_at ASC) AS rank,
        ranked.player_name AS "playerName",
        ranked.wallet_address AS "walletAddress",
        ranked.score,
        ranked.submitted_at AS "submittedAt",
        ranked.world_app_username AS "worldAppUsername",
        ranked.is_verified AS "isVerified",
        COALESCE(u2.all_time_best_score, 0) AS "allTimeBestScore"
      FROM ranked
      LEFT JOIN users u2 ON LOWER(ranked.wallet_address) = LOWER(u2.address)
      WHERE rn = 1
      ORDER BY ranked.score DESC, ranked.submitted_at ASC
      LIMIT ${limit}
    `)

    // Get user's personal ranking if wallet address provided
    let myRank: number | null = null
    let myBestScore: number | null = null

    if (walletAddress) {
      const normalizedAddress = walletAddress.toLowerCase()
      // Get user's best score and rank among unique users (not all scores)
      const myRankResult = await db.execute(sql`
        WITH user_best_scores AS (
          SELECT COALESCE(NULLIF(LOWER(wallet_address), ''), player_name) as user_id, MAX(score) as best_score
          FROM demo_scores
          GROUP BY COALESCE(NULLIF(LOWER(wallet_address), ''), player_name)
        )
        SELECT 
          (SELECT COUNT(*) + 1 FROM user_best_scores WHERE best_score > (
            SELECT best_score FROM user_best_scores WHERE user_id = ${normalizedAddress}
          )) AS rank,
          (SELECT best_score FROM user_best_scores WHERE user_id = ${normalizedAddress}) AS score
      `)
      
      if (myRankResult.rows.length > 0 && myRankResult.rows[0].score) {
        myRank = Number(myRankResult.rows[0].rank)
        myBestScore = Number(myRankResult.rows[0].score)
      }
    }

    // Extract champion info from the first entry
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

    const responseData = { 
      leaderboard: formattedLeaderboard,
      myRank,
      myBestScore,
      champion
    }
    
    // Only cache non-personalized responses (no wallet address)
    // CRITICAL: Never cache personalized responses as they contain user-specific data
    if (!walletAddress) {
      setCache(cacheKey, responseData, 15000)
    }

    return addCorsHeaders(NextResponse.json(responseData))
  } catch (error) {
    console.error('Error fetching demo leaderboard:', error)
    return createServerError()
  }
}
