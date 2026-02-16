import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { credits, users, paymentIntents } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { normalizeAddress } from '@/lib/addressUtils'
import { requireAuth, createAuthErrorResponse } from '@/lib/security/auth'
import { validateRequest, createServerError } from '@/lib/security/validation'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { logger } from '@/lib/security/logger'
import { scheduleBackgroundVerification } from '@/lib/backgroundVerify'

const SimplePaymentSchema = z.object({
  eventId: z.number().int().positive(),
  // Validate transaction ID is a proper Ethereum tx hash (0x + 64 hex chars)
  transactionId: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash format')
})

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function POST(req: NextRequest) {
  try {
    const { authenticated, wallet } = requireAuth(req)
    if (!authenticated || !wallet) {
      return createAuthErrorResponse('Authentication required')
    }
    
    const address = normalizeAddress(wallet)
    
    const validation = await validateRequest(req, SimplePaymentSchema)
    if (!validation.success) {
      return validation.response
    }
    
    const { eventId, transactionId } = validation.data
    const txHash = transactionId.toLowerCase()
    
    logger.info('Simple payment received', { address, eventId, txHash })

    // Ensure user exists
    await db.insert(users).values({ address }).onConflictDoNothing()

    // Check if this txHash was already used (prevent replay)
    const existingTx = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.txHash, txHash))
      .limit(1)
    
    if (existingTx.length > 0) {
      return addCorsHeaders(NextResponse.json(
        { error: 'tx_used', message: 'Transaction already used' },
        { status: 400 }
      ))
    }

    // Use a transaction to prevent race conditions when adding credits
    const result = await db.transaction(async (tx) => {
      // Record the transaction first to prevent replay (with row lock)
      const existingTx = await tx
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.txHash, txHash))
        .for('update')
        .limit(1)
      
      if (existingTx.length > 0) {
        return { error: 'tx_used', message: 'Transaction already used' }
      }

      await tx.insert(paymentIntents).values({
        id: txHash,
        address,
        eventId,
        expectedWei: '0',
        status: 'confirmed',
        txHash,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      })

      // Check user's current credit for this event (with row lock)
      const existing = await tx
        .select()
        .from(credits)
        .where(and(
          eq(credits.address, address),
          eq(credits.eventId, eventId)
        ))
        .for('update')
        .limit(1)

      // SECURITY: Maximum 100 credits per wallet per event (prevents abuse)
      const MAX_CREDITS_PER_EVENT = 100
      const currentBalance = existing.length > 0 ? existing[0].balance : 0
      
      if (currentBalance >= MAX_CREDITS_PER_EVENT) {
        return { error: 'max_credits', message: 'Maximum credits reached for this event' }
      }

      let newBalance: number
      if (existing.length > 0) {
        newBalance = currentBalance + 1
        await tx
          .update(credits)
          .set({ balance: newBalance, updatedAt: new Date() })
          .where(and(
            eq(credits.address, address),
            eq(credits.eventId, eventId)
          ))
      } else {
        newBalance = 1
        await tx.insert(credits).values({
          address,
          eventId,
          balance: 1,
          used: false
        })
      }

      return { success: true, balance: newBalance }
    })

    if ('error' in result) {
      return addCorsHeaders(NextResponse.json(
        { error: result.error, message: result.message },
        { status: 400 }
      ))
    }

    logger.info('Credit granted via simple payment', { address, eventId, txHash, balance: result.balance })

    // Optional: Schedule background blockchain verification (5 seconds delay to allow tx confirmation)
    // This doesn't block the user - just flags suspicious transactions for review
    scheduleBackgroundVerification(txHash, 5000)

    return addCorsHeaders(NextResponse.json({
      success: true,
      message: 'Credit granted',
      balance: 1
    }))

  } catch (error: any) {
    if (error?.code === '23505') {
      return addCorsHeaders(NextResponse.json(
        { error: 'tx_used', message: 'Transaction already used' },
        { status: 400 }
      ))
    }
    logger.error('Simple payment error', { error: String(error) })
    return createServerError()
  }
}
