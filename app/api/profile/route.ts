import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { demoScores, runs, leaderboard, users } from '@/db/schema'
import { eq, sql, desc } from 'drizzle-orm'
import { checkRateLimit } from '@/app/lib/rateLimit'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { createServerError } from '@/lib/security/validation'

const sqlClient = neon(process.env.DATABASE_URL!)
const db = drizzle(sqlClient)

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const playerName = searchParams.get('playerName')
    const rawWalletAddress = searchParams.get('walletAddress')
    const walletAddress = rawWalletAddress?.toLowerCase() || null

    if (!playerName && !walletAddress) {
      return addCorsHeaders(NextResponse.json(
        { error: 'playerName or walletAddress required' },
        { status: 400 }
      ))
    }

    // When walletAddress is provided without playerName, fetch full stats
    if (walletAddress && !playerName) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.address, walletAddress))
        .limit(1)
      
      const displayName = user?.worldAppUsername || user?.username || null
      
      // Get demo stats by wallet address
      const demoStats = await db
        .select({
          count: sql<number>`COUNT(*)`,
          highScore: sql<number>`MAX(score)`,
        })
        .from(demoScores)
        .where(eq(demoScores.walletAddress, walletAddress))
      
      // Get competition stats
      const competitionStats = await db
        .select({
          count: sql<number>`COUNT(*)`,
          highScore: sql<number>`MAX(score)`,
        })
        .from(runs)
        .where(eq(runs.address, walletAddress))
      
      // Get current rank
      const currentLeaderboard = await db
        .select({
          rank: leaderboard.rank,
        })
        .from(leaderboard)
        .where(eq(leaderboard.address, walletAddress))
        .orderBy(desc(leaderboard.updatedAt))
        .limit(1)
      
      return addCorsHeaders(NextResponse.json({
        walletAddress,
        username: displayName,
        worldAppUsername: user?.worldAppUsername || null,
        playerName: displayName || 'Unknown',
        isVerified: user?.isVerified ?? false,
        allTimeBestScore: user?.allTimeBestScore ?? 0,
        demoGamesPlayed: Number(demoStats[0]?.count || 0),
        demoHighScore: Number(demoStats[0]?.highScore || 0),
        competitionGamesPlayed: Number(competitionStats[0]?.count || 0),
        competitionHighScore: Number(competitionStats[0]?.highScore || 0),
        currentRank: currentLeaderboard[0]?.rank || null,
      }))
    }

    const identifier = walletAddress || playerName || 'anonymous'
    const rateLimit = await checkRateLimit(identifier, 'profile')
    if (!rateLimit.allowed) {
      return addCorsHeaders(NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many requests', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      ))
    }

    let profileData: any = {
      playerName: playerName || 'Unknown',
      walletAddress: walletAddress || null,
      username: null,
      worldAppUsername: null,
      isVerified: false,
      allTimeBestScore: 0,
      demoGamesPlayed: 0,
      demoHighScore: 0,
      competitionGamesPlayed: 0,
      competitionHighScore: 0,
      currentRank: null,
    }

    if (playerName) {
      // Try to find wallet address from demo scores first (prefer non-null, most recent)
      const walletLookup = await db
        .select({ walletAddress: demoScores.walletAddress })
        .from(demoScores)
        .where(sql`${demoScores.playerName} = ${playerName} AND ${demoScores.walletAddress} IS NOT NULL`)
        .orderBy(desc(demoScores.submittedAt))
        .limit(1)

      if (walletLookup.length > 0 && walletLookup[0].walletAddress) {
        profileData.walletAddress = walletLookup[0].walletAddress
      }

      // Get demo stats - use wallet address for count if available, otherwise player name
      // This ensures all games by the same wallet are counted together
      const effectiveWalletForDemo = walletAddress || profileData.walletAddress
      
      if (effectiveWalletForDemo) {
        // Count by wallet address - this captures all games by this player
        const demoStats = await db
          .select({
            count: sql<number>`COUNT(*)`,
            highScore: sql<number>`MAX(score)`,
          })
          .from(demoScores)
          .where(eq(demoScores.walletAddress, effectiveWalletForDemo))

        if (demoStats.length > 0 && Number(demoStats[0].count) > 0) {
          profileData.demoGamesPlayed = Number(demoStats[0].count)
          profileData.demoHighScore = Number(demoStats[0].highScore || 0)
        }
      }
      
      // Fallback: if no wallet-based stats, try playerName (for old entries without wallet)
      if (profileData.demoGamesPlayed === 0) {
        const demoStats = await db
          .select({
            count: sql<number>`COUNT(*)`,
            highScore: sql<number>`MAX(score)`,
          })
          .from(demoScores)
          .where(eq(demoScores.playerName, playerName))

        if (demoStats.length > 0) {
          profileData.demoGamesPlayed = Number(demoStats[0].count)
          profileData.demoHighScore = Number(demoStats[0].highScore || 0)
        }
      }
    }

    // Fetch competition stats if we have a wallet address (from param or discovered)
    const effectiveWallet = walletAddress || profileData.walletAddress
    if (effectiveWallet) {
      profileData.walletAddress = effectiveWallet
      
      // Fetch username from users table
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.address, effectiveWallet))
        .limit(1)
      
      if (user) {
        profileData.worldAppUsername = user.worldAppUsername || null
        profileData.username = user.worldAppUsername || user.username || null
        profileData.isVerified = user.isVerified ?? false
        profileData.allTimeBestScore = user.allTimeBestScore ?? 0
      }
      
      const competitionStats = await db
        .select({
          count: sql<number>`COUNT(*)`,
          highScore: sql<number>`MAX(score)`,
        })
        .from(runs)
        .where(eq(runs.address, effectiveWallet))

      if (competitionStats.length > 0) {
        profileData.competitionGamesPlayed = Number(competitionStats[0].count)
        profileData.competitionHighScore = Number(competitionStats[0].highScore || 0)
      }

      const currentLeaderboard = await db
        .select({
          rank: leaderboard.rank,
          totalScore: leaderboard.totalScore,
        })
        .from(leaderboard)
        .where(eq(leaderboard.address, effectiveWallet))
        .orderBy(desc(leaderboard.updatedAt))
        .limit(1)

      if (currentLeaderboard.length > 0) {
        profileData.currentRank = currentLeaderboard[0].rank
      }

      // If we didn't get demo stats via playerName, get them via wallet
      if (!playerName) {
        const demoStatsByWallet = await db
          .select({
            count: sql<number>`COUNT(*)`,
            highScore: sql<number>`MAX(score)`,
            playerName: sql<string>`MAX(${demoScores.playerName})`,
          })
          .from(demoScores)
          .where(eq(demoScores.walletAddress, effectiveWallet))

        if (demoStatsByWallet.length > 0) {
          profileData.demoGamesPlayed = Number(demoStatsByWallet[0].count)
          profileData.demoHighScore = Number(demoStatsByWallet[0].highScore)
          profileData.playerName = demoStatsByWallet[0].playerName || profileData.playerName
        }
      }
    }

    return addCorsHeaders(NextResponse.json(profileData))
  } catch (error) {
    console.error('Error fetching profile:', error)
    return createServerError()
  }
}
