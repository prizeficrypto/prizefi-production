import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { events, tryCounter } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { generateRunToken, RunData } from '@/lib/runToken'
import { MAX_TRIES } from '@/lib/constants'
import { getEventCredits, markCreditAsUsed } from '@/lib/creditManager'
import { normalizeAddress } from '@/lib/addressUtils'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/security/rateLimit'
import { requireAuth, createAuthErrorResponse } from '@/lib/security/auth'
import { validateRequest, createValidationError, createServerError } from '@/lib/security/validation'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { logger } from '@/lib/security/logger'
import { RunStartSchema } from '@/lib/security/schemas'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function POST(request: NextRequest) {
  try {
    const { authenticated, wallet } = requireAuth(request)
    if (!authenticated || !wallet) {
      logger.warn('Unauthenticated run start request')
      return createAuthErrorResponse('Authentication required')
    }

    const validation = await validateRequest(request, RunStartSchema)
    if (!validation.success) {
      return validation.response
    }

    const { eventId, address: rawAddress, seed, startedAt } = validation.data
    const address = normalizeAddress(rawAddress)
    
    if (address !== normalizeAddress(wallet)) {
      logger.warn('Address mismatch in run start', { wallet, providedAddress: rawAddress })
      return addCorsHeaders(NextResponse.json(
        { error: 'address_mismatch', message: 'Address does not match authenticated wallet' },
        { status: 400 }
      ))
    }

    const rateLimitId = getRateLimitIdentifier(request, 'run-start')
    const rateLimit = checkRateLimit(rateLimitId, RATE_LIMITS.RUN_START)
    
    if (!rateLimit.allowed) {
      logger.warn('Rate limit exceeded for run start', { address, eventId })
      return addCorsHeaders(NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many run attempts. Please try again later.' },
        { status: 429 }
      ))
    }

    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
    if (!event) {
      logger.warn('Event not found', { eventId })
      return addCorsHeaders(NextResponse.json(
        { error: 'event_not_found', message: 'Event not found' },
        { status: 404 }
      ))
    }

    if (event.frozen) {
      logger.warn('Event is frozen', { eventId })
      return addCorsHeaders(NextResponse.json(
        { error: 'event_frozen', message: 'Event has ended and is frozen' },
        { status: 400 }
      ))
    }

    const [tries] = await db
      .select()
      .from(tryCounter)
      .where(and(eq(tryCounter.eventId, eventId), eq(tryCounter.address, address)))
      .limit(1)

    const triesUsed = tries?.count || 0

    if (triesUsed >= MAX_TRIES) {
      logger.warn('Already played this event', { address, eventId, triesUsed })
      return addCorsHeaders(NextResponse.json(
        { error: 'max_tries_exceeded', message: 'You have already played in this competition. Wait for the next event.' },
        { status: 400 }
      ))
    }

    const eventCredit = await getEventCredits(address, eventId)
    
    logger.info('Credit check for run start', { 
      address, 
      eventId, 
      balance: eventCredit.balance,
      attemptsUsed: eventCredit.attemptsUsed,
      totalPurchased: eventCredit.totalPurchased
    })
    
    if (eventCredit.balance === 0) {
      // No credit available - check if they've used all attempts or need to buy
      if (eventCredit.totalPurchased >= MAX_TRIES) {
        logger.warn('Already entered this event', { address, eventId, totalPurchased: eventCredit.totalPurchased })
        return addCorsHeaders(NextResponse.json(
          { error: 'max_attempts_reached', message: 'You have already played in this competition. Wait for the next event.' },
          { status: 400 }
        ))
      }
      
      logger.warn('No credit available', { address, eventId })
      return addCorsHeaders(NextResponse.json(
        { error: 'no_credit', message: 'You need to purchase a credit to play this event.' },
        { status: 400 }
      ))
    }

    const result = await markCreditAsUsed(address, eventId)
    
    if (!result.success) {
      logger.error('Failed to mark credit as used', { error: result.error, address, eventId })
      return addCorsHeaders(NextResponse.json(
        { 
          error: result.error === 'creditAlreadyUsed' ? 'credit_used' : 'credit_error',
          message: result.error === 'creditAlreadyUsed' 
            ? 'Credit already used for this event. Wait for the next event.'
            : 'Failed to use credit. Please try again.' 
        },
        { status: 400 }
      ))
    }

    const runData: RunData = {
      eventId,
      address,
      seed,
      startedAt,
    }
    const startToken = generateRunToken(runData)

    // triesUsed was the count BEFORE this attempt, so add 1 to get correct remaining
    const triesRemaining = MAX_TRIES - (triesUsed + 1)
    
    logger.info('Run started successfully', { 
      address, 
      eventId, 
      seed: seed.substring(0, 10),
      triesRemaining
    })
    
    return addCorsHeaders(NextResponse.json({
      success: true,
      startToken,
      triesRemaining,
    }))
  } catch (error) {
    logger.error('Error starting run', { error: String(error) })
    return createServerError()
  }
}
