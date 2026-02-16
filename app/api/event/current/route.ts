import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrCreateEvent, getSecondsRemaining, getEventConfig } from '../../../../lib/eventScheduler'
import { createLogger } from '../../../../lib/logger'
import { db } from '../../../../db'
import { tryCounter, credits, appConfig, events } from '../../../../db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { MAX_TRIES } from '../../../../lib/constants'
import { checkRateLimit } from '../../../lib/rateLimit'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { createServerError } from '@/lib/security/validation'
import { normalizeAddress } from '@/lib/addressUtils'
import { getCached, setCache } from '@/lib/cache'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawAddress = searchParams.get('address')
  const address = rawAddress ? normalizeAddress(rawAddress) : null
  const logger = createLogger('/api/event/current', 'GET', address || undefined)
  
  try {
    const identifier = address || request.headers.get('x-forwarded-for') || 'anonymous'
    const rateLimit = await checkRateLimit(identifier, 'event/current')
    if (!rateLimit.allowed) {
      return addCorsHeaders(NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many requests', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      ))
    }

    logger.info('Fetching current event')
    
    // For anonymous users, check cache first (10 second TTL)
    if (!address) {
      const cached = getCached<any>('event-current-anonymous')
      if (cached) {
        const response = NextResponse.json(cached)
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        return addCorsHeaders(response)
      }
    }
    
    const event = await getCurrentOrCreateEvent()

    const [config] = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.id, 'global'))
      .limit(1)

    const prizePool = config ? parseFloat(config.prizePoolWld) : 100

    if (!event) {
      logger.info('No active event, in cooldown period')
      
      const config = await getEventConfig()
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
      
      return addCorsHeaders(NextResponse.json(
        { 
          eventId: null,
          endsAt: null,
          secondsLeft: 0,
          frozen: true,
          cooldown: true,
          triesRemaining: 0,
          status: 'cooldown',
          timeUntilNext,
          prizePool
        },
        { status: 200 }
      ))
    }

    const secondsLeft = getSecondsRemaining(event)

    let triesRemaining = MAX_TRIES
    let status = 'active'
    let userCredits = 0
    let creditUsed = false
    let attemptsUsed = 0
    let totalPurchased = 0
    let canBuyMore = true
    
    if (event.frozen) {
      status = 'ended'
    }

    if (address) {
      const [tries] = await db
        .select()
        .from(tryCounter)
        .where(
          and(
            eq(tryCounter.eventId, event.id),
            eq(tryCounter.address, address)
          )
        )
        .limit(1)

      attemptsUsed = tries?.count || 0
      triesRemaining = Math.max(0, MAX_TRIES - attemptsUsed)

      const [credit] = await db
        .select()
        .from(credits)
        .where(
          and(
            eq(credits.eventId, event.id),
            eq(credits.address, address)
          )
        )
        .limit(1)

      userCredits = credit?.balance || 0
      creditUsed = credit?.used || false
      totalPurchased = attemptsUsed + userCredits
      canBuyMore = totalPurchased < MAX_TRIES
    }

    logger.success('Event fetched', { 
      eventId: event.id, 
      secondsLeft, 
      triesRemaining, 
      credits: userCredits, 
      used: creditUsed,
      attemptsUsed,
      totalPurchased,
      canBuyMore
    })

    let timeUntilNext = null
    if (status === 'ended' || event.frozen) {
      const config = await getEventConfig()
      const now = new Date()
      const cooldownEndTime = new Date(event.endsAt.getTime() + (config.cooldownSec * 1000))
      const secondsUntilNext = Math.max(0, Math.floor((cooldownEndTime.getTime() - now.getTime()) / 1000))
      timeUntilNext = secondsUntilNext
    }

    const eventPrizePool = event.prizePoolWld ? parseFloat(event.prizePoolWld) : prizePool
    
    const responseData = {
      eventId: event.id,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      secondsLeft,
      frozen: event.frozen,
      cooldown: false,
      triesRemaining,
      status,
      endTime: event.endsAt.toISOString(),
      timeUntilNext,
      credits: userCredits,
      used: creditUsed,
      attemptsUsed,
      totalPurchased,
      maxTries: MAX_TRIES,
      canBuyMore,
      prizePool: eventPrizePool,
      prizePoolWld: event.prizePoolWld || prizePool.toString()
    }
    
    // Cache anonymous responses for 10 seconds (high traffic optimization)
    if (!address) {
      setCache('event-current-anonymous', responseData, 10000)
    }

    const response = NextResponse.json(responseData)
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return addCorsHeaders(response)
  } catch (error) {
    logger.error('Error fetching current event', error)
    return createServerError()
  }
}
