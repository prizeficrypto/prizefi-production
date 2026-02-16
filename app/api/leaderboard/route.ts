import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../db'
import { leaderboard, events, appConfig, users } from '../../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { checkRateLimit } from '../../lib/rateLimit'
import { getCurrentOrCreateEvent, getSecondsRemaining, getEventConfig } from '../../../lib/eventScheduler'
import { validateQueryParams, createServerError } from '@/lib/security/validation'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { logger } from '@/lib/security/logger'
import { LeaderboardQuerySchema } from '@/lib/security/schemas'
import { getCached, setCache } from '@/lib/cache'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

// Prize distribution percentages for top 10 winners
const PRIZE_DISTRIBUTION = [
  { rank: 1, percentage: 24.50 },
  { rank: 2, percentage: 14.50 },
  { rank: 3, percentage: 12.00 },
  { rank: 4, percentage: 10.00 },
  { rank: 5, percentage: 9.00 },
  { rank: 6, percentage: 8.00 },
  { rank: 7, percentage: 7.00 },
  { rank: 8, percentage: 6.00 },
  { rank: 9, percentage: 5.00 },
  { rank: 10, percentage: 4.00 },
]

// Helper function to get prize pool from config (current)
async function getCurrentPrizePool(): Promise<number> {
  const configs = await db
    .select()
    .from(appConfig)
    .where(eq(appConfig.id, 'global'))
    .limit(1)
  
  let prizePool = 100
  if (configs.length > 0) {
    const parsedValue = parseFloat(configs[0].prizePoolWld)
    prizePool = isNaN(parsedValue) ? 100 : parsedValue
  }
  return prizePool
}

// Get prize pool for a specific event (use event's stored prize pool, fallback to current)
function getEventPrizePool(event: any): number {
  if (event && event.prizePoolWld) {
    const parsed = parseFloat(event.prizePoolWld)
    if (!isNaN(parsed)) return parsed
  }
  return 100 // Default fallback
}

// Helper function to calculate WLD prize for a given rank
function calculatePrizeAmount(rank: number, prizePool: number): number {
  const distribution = PRIZE_DISTRIBUTION.find(d => d.rank === rank)
  if (!distribution) return 0
  return (prizePool * distribution.percentage) / 100
}

// Helper function to shorten address for display when no username exists
function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const validation = validateQueryParams(searchParams, LeaderboardQuerySchema)
    if (!validation.success) {
      return validation.response
    }

    const { eventId: eventIdParam, limit: limitParam } = validation.data
    const address = searchParams.get('address')
    const limit = Math.min(limitParam || 10, 10)

    if (address) {
      const rateLimit = await checkRateLimit(address, 'leaderboard')
      if (!rateLimit.allowed) {
        logger.warn('Rate limit exceeded for leaderboard', { address })
        return addCorsHeaders(NextResponse.json(
          { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' },
          { status: 429 }
        ))
      }
    }

    // Check cache first (15 second TTL for high traffic) - only for non-personalized requests
    const cacheKey = `leaderboard-${eventIdParam || 'current'}-${limit}`
    if (!address) {
      const cached = getCached<any>(cacheKey)
      if (cached) {
        return addCorsHeaders(NextResponse.json(cached))
      }
    }

    let eventId: number
    let event: any
    
    if (eventIdParam) {
      eventId = eventIdParam
      
      const [fetchedEvent] = await db
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1)
      
      if (!fetchedEvent) {
        logger.warn('Event not found', { eventId })
        return addCorsHeaders(NextResponse.json(
          { error: 'event_not_found', message: 'Event not found' },
          { status: 404 }
        ))
      }
      
      event = fetchedEvent
    } else {
      event = await getCurrentOrCreateEvent()
      if (!event) {
        // In cooldown - calculate time until next event
        const prizePool = await getCurrentPrizePool()
        const config = await getEventConfig()
        
        // Get last event to calculate cooldown end time
        const [lastEvent] = await db
          .select()
          .from(events)
          .orderBy(desc(events.id))
          .limit(1)
        
        let timeUntilNext = config.cooldownSec
        if (lastEvent) {
          const now = new Date()
          const cooldownEndTime = new Date(lastEvent.endsAt.getTime() + (config.cooldownSec * 1000))
          const secondsUntilNext = Math.max(0, Math.floor((cooldownEndTime.getTime() - now.getTime()) / 1000))
          timeUntilNext = secondsUntilNext
        }
        
        return addCorsHeaders(NextResponse.json({
          eventId: null,
          leaderboard: [],
          myRank: null,
          myTotalScore: 0,
          eventStatus: 'cooldown',
          endTime: null,
          timeUntilNext,
          prizePool,
        }))
      }
      eventId = event.id
    }

    const [totalPlayersResult] = await db
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(leaderboard)
      .where(eq(leaderboard.eventId, eventId))

    const totalPlayers = totalPlayersResult?.count || 0

    const top10Players = await db
      .select({ totalScore: leaderboard.totalScore })
      .from(leaderboard)
      .where(eq(leaderboard.eventId, eventId))
      .orderBy(desc(leaderboard.totalScore))
      .limit(10)

    const top10ThresholdScore = top10Players.length >= 10
      ? top10Players[top10Players.length - 1].totalScore
      : null

    const topPlayers = await db
      .select({
        id: leaderboard.id,
        eventId: leaderboard.eventId,
        address: leaderboard.address,
        totalScore: leaderboard.totalScore,
        rank: leaderboard.rank,
        updatedAt: leaderboard.updatedAt,
        username: users.username,
        worldAppUsername: users.worldAppUsername,
        isVerified: users.isVerified,
        allTimeBestScore: users.allTimeBestScore,
      })
      .from(leaderboard)
      .leftJoin(users, eq(leaderboard.address, users.address))
      .where(eq(leaderboard.eventId, eventId))
      .orderBy(desc(leaderboard.totalScore))
      .limit(limit)

    let myRank: number | null = null
    let myTotalScore = 0
    
    if (address) {
      const normalizedAddress = address.toLowerCase()
      const [myEntry] = await db
        .select()
        .from(leaderboard)
        .where(
          and(
            eq(leaderboard.eventId, eventId),
            sql`LOWER(${leaderboard.address}) = ${normalizedAddress}`
          )
        )
        .limit(1)

      if (myEntry) {
        myTotalScore = myEntry.totalScore
        
        // Always calculate rank dynamically based on current scores
        const [rankResult] = await db
          .select({ count: sql<number>`COUNT(*)`.as('count') })
          .from(leaderboard)
          .where(
            and(
              eq(leaderboard.eventId, eventId),
              sql`${leaderboard.totalScore} > ${myEntry.totalScore}`
            )
          )
        myRank = (rankResult?.count || 0) + 1
      }
    }

    const now = new Date()
    let eventStatus = 'active'
    if (event.frozen) {
      eventStatus = 'finalized'
    } else if (now > event.endsAt) {
      eventStatus = 'ended'
    }

    const secondsRemaining = event ? getSecondsRemaining(event) : 0

    // Calculate time until next event for ended state
    let timeUntilNext = null
    if (eventStatus === 'ended') {
      const config = await getEventConfig()
      const cooldownEndTime = new Date(event.endsAt.getTime() + (config.cooldownSec * 1000))
      const secondsUntilNext = Math.max(0, Math.floor((cooldownEndTime.getTime() - now.getTime()) / 1000))
      timeUntilNext = secondsUntilNext
    }

    // Get prize pool - use event's stored prize pool for past events, current for active events
    const prizePool = getEventPrizePool(event)

    logger.info('Leaderboard fetched', { eventId, playersCount: topPlayers.length, myRank })

    const responseData = {
      eventId,
      leaderboard: topPlayers.map((entry, index) => {
        const rank = index + 1
        const basePrize = rank <= 10 ? calculatePrizeAmount(rank, prizePool) : 0
        const isVerified = entry.isVerified ?? false
        let prizeAmount = basePrize
        if (!isVerified && basePrize > 0) {
          prizeAmount = basePrize * 0.25
        }
        return {
          rank,
          address: entry.address,
          username: entry.worldAppUsername || null,
          isVerified,
          score: entry.totalScore,
          prizeAmount: Math.round(prizeAmount * 100) / 100,
          allTimeBestScore: entry.allTimeBestScore ?? 0,
        }
      }),
      myRank,
      myTotalScore,
      eventStatus,
      endTime: event.endsAt.toISOString(),
      timeUntilNext,
      prizePool,
      prizeDistribution: PRIZE_DISTRIBUTION,
      totalPlayers,
      top10ThresholdScore,
    }
    
    // Cache the result for 15 seconds (high traffic optimization)
    if (!address) {
      setCache(cacheKey, responseData, 15000)
    }

    return addCorsHeaders(NextResponse.json(responseData))
  } catch (error) {
    logger.error('Error fetching leaderboard', { error: String(error) })
    return createServerError()
  }
}
