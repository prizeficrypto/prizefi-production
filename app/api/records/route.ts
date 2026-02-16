import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eventChampions, demoScores } from '@/db/schema'
import { desc, sql } from 'drizzle-orm'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { createServerError } from '@/lib/security/validation'

const sqlClient = neon(process.env.DATABASE_URL!)
const db = drizzle(sqlClient)

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(req: NextRequest) {
  try {
    const champions = await db
      .select({
        id: eventChampions.id,
        eventId: eventChampions.eventId,
        address: eventChampions.address,
        username: eventChampions.username,
        score: eventChampions.score,
        eventStartedAt: eventChampions.eventStartedAt,
        eventEndedAt: eventChampions.eventEndedAt,
        createdAt: eventChampions.createdAt,
      })
      .from(eventChampions)
      .orderBy(desc(eventChampions.createdAt))
      .limit(50)

    const practiceHighScores = await db.execute(sql`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY score DESC, "submittedAt" ASC) AS rank,
        "playerName",
        "walletAddress",
        score,
        "submittedAt",
        u.username,
        u.world_app_username AS "worldAppUsername",
        COALESCE(u.world_app_username, u.username, unique_players."playerName") AS "displayName"
      FROM (
        SELECT DISTINCT ON (LOWER(COALESCE(NULLIF(wallet_address, ''), player_name)))
          player_name AS "playerName",
          wallet_address AS "walletAddress",
          score,
          submitted_at AS "submittedAt"
        FROM demo_scores
        ORDER BY 
          LOWER(COALESCE(NULLIF(wallet_address, ''), player_name)),
          score DESC,
          submitted_at ASC
      ) AS unique_players
      LEFT JOIN users u ON (
        unique_players."walletAddress" IS NOT NULL 
        AND unique_players."walletAddress" != '' 
        AND LOWER(unique_players."walletAddress") = LOWER(u.address)
      )
      ORDER BY score DESC, "submittedAt" ASC
      LIMIT 10
    `)

    const allTimeHighScore = practiceHighScores.rows.length > 0 
      ? {
          score: (practiceHighScores.rows[0] as any).score,
          playerName: (practiceHighScores.rows[0] as any).displayName,
          achievedAt: (practiceHighScores.rows[0] as any).submittedAt
        }
      : null

    return addCorsHeaders(NextResponse.json({
      champions,
      practiceHighScores: practiceHighScores.rows,
      allTimeHighScore
    }))
  } catch (error) {
    console.error('Error fetching records:', error)
    return createServerError()
  }
}
