import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../db'
import { users, runs, events, leaderboard, tryCounter } from '../../../../db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'
import { checkRateLimit } from '../../../lib/rateLimit'
import { verifyRunToken, RunData } from '../../../../lib/runToken'
import { validateRunInputs } from '../../../../lib/runValidator'
import { MAX_TRIES } from '@/lib/constants'
import { normalizeAddress } from '@/lib/addressUtils'
import { requireAuth, createAuthErrorResponse } from '@/lib/security/auth'
import { validateRequest, createValidationError, createServerError } from '@/lib/security/validation'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { logger as securityLogger } from '@/lib/security/logger'
import { RunFinishSchema } from '@/lib/security/schemas'

const MAX_RUN_AGE_MS = Infinity  // No limit - games can last as long as player keeps playing

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function POST(request: NextRequest) {
  try {
    const { authenticated, wallet } = requireAuth(request)
    if (!authenticated || !wallet) {
      securityLogger.warn('Unauthenticated run finish request')
      return createAuthErrorResponse('Authentication required')
    }

    const validation = await validateRequest(request, RunFinishSchema)
    if (!validation.success) {
      return validation.response
    }

    const { address: rawAddress, isVerified, score, seed, inputLog, startToken, startedAt, eventId } = validation.data
    const address = normalizeAddress(rawAddress)
    
    if (address !== normalizeAddress(wallet)) {
      securityLogger.warn('Address mismatch in run finish', { wallet, providedAddress: rawAddress })
      return addCorsHeaders(NextResponse.json(
        { error: 'address_mismatch', message: 'Address does not match authenticated wallet' },
        { status: 400 }
      ))
    }

    const rateLimit = await checkRateLimit(address, 'run/finish')
    if (!rateLimit.allowed) {
      securityLogger.warn('Rate limit exceeded for run finish', { address, eventId })
      return addCorsHeaders(NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many run submissions. Please try again later.', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      ))
    }

    const runData: RunData = { eventId, address, seed, startedAt }
    const tokenValid = verifyRunToken(runData, startToken)
    
    if (!tokenValid) {
      securityLogger.warn('Invalid start token', { address, eventId })
      return addCorsHeaders(NextResponse.json(
        { error: 'invalid_token', message: 'Invalid or expired start token' },
        { status: 400 }
      ))
    }

    const [existingRun] = await db
      .select()
      .from(runs)
      .where(eq(runs.startToken, startToken))
      .limit(1)

    if (existingRun) {
      securityLogger.warn('Duplicate run attempt', { address, eventId, startToken: startToken.substring(0, 10) })
      return addCorsHeaders(NextResponse.json(
        { error: 'duplicate_run', message: 'This run has already been submitted' },
        { status: 400 }
      ))
    }

    const runAge = Date.now() - startedAt
    if (runAge > MAX_RUN_AGE_MS) {
      securityLogger.warn('Run too old', { address, eventId, runAgeMs: runAge })
      return addCorsHeaders(NextResponse.json(
        { error: 'run_expired', message: 'Run took too long to complete' },
        { status: 400 }
      ))
    }

    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
    if (!event) {
      return addCorsHeaders(NextResponse.json(
        { error: 'event_not_found', message: 'Event not found' },
        { status: 404 }
      ))
    }

    if (event.frozen) {
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

    // tryCounter is already incremented by markCreditAsUsed in run/start
    // So triesUsed now represents the current attempt number (1, 2, or 3)
    const triesUsed = tries?.count || 0

    if (triesUsed > MAX_TRIES) {
      // This should never happen if run/start is working correctly
      securityLogger.warn('Max tries exceeded', { address, eventId, triesUsed })
      return addCorsHeaders(NextResponse.json(
        { error: 'max_tries_exceeded', message: `Maximum ${MAX_TRIES} attempts per event reached` },
        { status: 400 }
      ))
    }

    const inputValidation = validateRunInputs(inputLog, seed, score, startedAt)
    if (!inputValidation.valid) {
      securityLogger.warn('Invalid input log', { 
        address, 
        eventId, 
        error: inputValidation.error,
        clientScore: score,
        serverScore: inputValidation.serverScore,
        inputLogLength: inputLog.length,
        seed
      })
      return addCorsHeaders(NextResponse.json(
        { 
          error: 'invalid_inputs', 
          message: `Invalid input log: ${inputValidation.error}`,
          serverScore: inputValidation.serverScore,
          clientScore: score
        },
        { status: 400 }
      ))
    }

    const serverScore = inputValidation.serverScore ?? score

    if (Math.abs(serverScore - score) > 0.01) {
      securityLogger.warn('Score mismatch detected', { 
        address, 
        eventId, 
        clientScore: score, 
        serverScore,
        difference: Math.abs(serverScore - score)
      })
      return addCorsHeaders(NextResponse.json(
        { error: 'score_mismatch', message: 'Client score does not match server replay', serverScore, clientScore: score },
        { status: 400 }
      ))
    }

    await db.insert(users).values({ address }).onConflictDoNothing()

    let previousRank: number | null = null
    const [existingBefore] = await db
      .select()
      .from(leaderboard)
      .where(and(eq(leaderboard.address, address), eq(leaderboard.eventId, eventId)))
      .limit(1)

    if (existingBefore) {
      const [rankBefore] = await db
        .select({ count: sql<number>`COUNT(*)`.as('count') })
        .from(leaderboard)
        .where(
          and(
            eq(leaderboard.eventId, eventId),
            sql`${leaderboard.totalScore} > ${existingBefore.totalScore}`
          )
        )
      previousRank = (rankBefore?.count || 0) + 1
    }
    
    await db.transaction(async (tx) => {
      await tx.insert(runs).values({
        address,
        eventId,
        score: serverScore,
        seed,
        inputLen: inputLog.length,
        startedAt,
        finishedAt: new Date(),
        startToken
      })

      if (!existingBefore) {
        await tx.insert(leaderboard).values({
          address,
          eventId,
          totalScore: serverScore
        })
      } else if (serverScore > existingBefore.totalScore) {
        await tx
          .update(leaderboard)
          .set({
            totalScore: serverScore,
            updatedAt: new Date()
          })
          .where(eq(leaderboard.id, existingBefore.id))
        
        securityLogger.info('Best score updated', {
          address,
          eventId,
          previousBest: existingBefore.totalScore,
          newBest: serverScore
        })
      }

      await tx
        .update(users)
        .set({ allTimeBestScore: sql`GREATEST(${users.allTimeBestScore}, ${serverScore})` })
        .where(eq(users.address, address))
    })

    let newRank: number | null = null
    const [updatedEntry] = await db
      .select()
      .from(leaderboard)
      .where(and(eq(leaderboard.address, address), eq(leaderboard.eventId, eventId)))
      .limit(1)

    if (updatedEntry) {
      const [rankAfter] = await db
        .select({ count: sql<number>`COUNT(*)`.as('count') })
        .from(leaderboard)
        .where(
          and(
            eq(leaderboard.eventId, eventId),
            sql`${leaderboard.totalScore} > ${updatedEntry.totalScore}`
          )
        )
      newRank = (rankAfter?.count || 0) + 1
    }

    const [totalResult] = await db
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(leaderboard)
      .where(eq(leaderboard.eventId, eventId))
    const totalPlayers = totalResult?.count || 0

    const top10Entries = await db
      .select({ totalScore: leaderboard.totalScore })
      .from(leaderboard)
      .where(eq(leaderboard.eventId, eventId))
      .orderBy(desc(leaderboard.totalScore))
      .limit(10)
    const top10ThresholdScore = top10Entries.length >= 10
      ? top10Entries[top10Entries.length - 1].totalScore
      : null

    const [firstPlaceEntry] = await db
      .select({ totalScore: leaderboard.totalScore })
      .from(leaderboard)
      .where(eq(leaderboard.eventId, eventId))
      .orderBy(desc(leaderboard.totalScore))
      .limit(1)

    securityLogger.info('Run finished successfully', {
      address,
      eventId,
      score: serverScore,
      triesUsed,
      triesRemaining: MAX_TRIES - triesUsed
    })

    return addCorsHeaders(NextResponse.json({
      success: true,
      score: serverScore,
      triesUsed,
      triesRemaining: MAX_TRIES - triesUsed,
      previousRank,
      newRank,
      totalPlayers,
      top10ThresholdScore,
      firstPlaceScore: firstPlaceEntry?.totalScore || 0,
    }))
  } catch (error) {
    securityLogger.error('Error finishing run', { error: String(error) })
    return createServerError()
  }
}
