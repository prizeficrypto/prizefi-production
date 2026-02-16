import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { provider, toWeiFloat } from '@/lib/chain'
import { db } from '@/db'
import { paymentIntents, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getEventCredits } from '@/lib/creditManager'
import { normalizeAddress } from '@/lib/addressUtils'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/security/rateLimit'
import { requireAuth, createAuthErrorResponse } from '@/lib/security/auth'
import { validateRequest, createValidationError, createServerError } from '@/lib/security/validation'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { logger } from '@/lib/security/logger'
import { MAX_TRIES } from '@/lib/constants'

const PaymentIntentSchema = z.object({
  eventId: z.number().int().positive(),
  isVerified: z.boolean().optional()
})

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function POST(req: NextRequest) {
  try {
    const { authenticated, wallet } = requireAuth(req)
    if (!authenticated || !wallet) {
      logger.warn('Unauthenticated payment intent request')
      return createAuthErrorResponse('Authentication required')
    }
    
    const address = normalizeAddress(wallet)
    
    logger.info('🔍 Payment intent request', { 
      rawWallet: wallet, 
      normalizedAddress: address,
      walletLength: wallet.length,
      addressLength: address.length
    })
    
    const rateLimitId = getRateLimitIdentifier(req, 'payment-intent')
    const rateLimit = checkRateLimit(rateLimitId, RATE_LIMITS.PAYMENT_INTENT)
    
    if (!rateLimit.allowed) {
      logger.warn('Rate limit exceeded for payment intent', { address, rateLimitId })
      return NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many payment requests. Please try again later.' },
        { status: 429 }
      )
    }
    
    const validation = await validateRequest(req, PaymentIntentSchema)
    if (!validation.success) {
      return validation.response
    }
    
    const { eventId, isVerified: clientVerified } = validation.data

    await db.insert(users).values({ address }).onConflictDoNothing()

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1)

    // Use client-provided verification status if available, otherwise use database value
    // Client verification comes from MiniKit's on-chain getIsUserVerified() check
    let isVerified = user?.isVerified ?? false
    
    if (clientVerified !== undefined && clientVerified !== user?.isVerified) {
      // Update database with client-provided verification status
      await db
        .update(users)
        .set({ isVerified: clientVerified })
        .where(eq(users.address, address))
      isVerified = clientVerified
      logger.info('Updated user verification status', { address, isVerified: clientVerified })
    }

    // Check if user can purchase more attempts for this event
    const eventCredit = await getEventCredits(address, eventId)
    
    logger.info('💳 Credit check result', { 
      address, 
      eventId, 
      creditBalance: eventCredit.balance, 
      creditUsed: eventCredit.used,
      attemptsUsed: eventCredit.attemptsUsed,
      totalPurchased: eventCredit.totalPurchased,
      maxTries: MAX_TRIES
    })
    
    // Check if user has already reached max attempts (Infinity = unlimited)
    if (eventCredit.totalPurchased >= MAX_TRIES) {
      logger.warn('[SECURITY] Payment blocked - already entered this event', { address, eventId, totalPurchased: eventCredit.totalPurchased })
      return addCorsHeaders(NextResponse.json(
        { error: 'max_attempts_reached', message: 'You have already entered this competition. Wait for the next event to play again.' },
        { status: 400 }
      ))
    }

    const existing = await db
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.address, address),
          eq(paymentIntents.eventId, eventId),
          eq(paymentIntents.status, 'pending')
        )
      )
      .limit(1)

    if (existing.length > 0) {
      const intent = existing[0]
      if (new Date(intent.expiresAt) > new Date()) {
        logger.info('Returning existing payment intent', { intentId: intent.id, address, eventId })
        return addCorsHeaders(NextResponse.json({
          intentId: intent.id,
          reference: intent.id, // Use intentId as the MiniKit reference
          amount: intent.expectedWei === toWeiFloat('0.5').toString() ? '0.5' : '1',
          treasury: process.env.NEXT_PUBLIC_TREASURY_CONTRACT,
          expiresAt: intent.expiresAt.toISOString(),
        }))
      }
    }

    const price = isVerified ? '0.5' : '1'
    const expectedWei = toWeiFloat(price).toString()

    const id = crypto.randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000)

    let block: number | null = null
    try {
      block = await provider.getBlockNumber()
    } catch (error) {
      logger.warn('Failed to get block number from RPC', { error: String(error) })
    }

    await db.insert(paymentIntents).values({
      id,
      address,
      eventId,
      expectedWei,
      createdAt: now,
      expiresAt,
      createdBlock: block ?? undefined,
      status: 'pending',
    })

    logger.info('Payment intent created', { 
      intentId: id, 
      address, 
      eventId, 
      amount: price,
      isVerified,
      expiresAt: expiresAt.toISOString()
    })

    // The intentId serves as the unique reference for MiniKit payments
    // This ties the transaction to this specific intent, preventing cross-user replay
    return addCorsHeaders(NextResponse.json({
      intentId: id,
      reference: id, // Use intentId as the MiniKit reference
      amount: price,
      treasury: process.env.NEXT_PUBLIC_TREASURY_CONTRACT,
      expiresAt: expiresAt.toISOString(),
    }))
  } catch (error) {
    logger.error('Error creating payment intent', { error: String(error) })
    return createServerError()
  }
}
