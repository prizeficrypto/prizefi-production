import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { paymentIntents, credits } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { normalizeAddress } from '@/lib/addressUtils'
import { requireAuth, createAuthErrorResponse } from '@/lib/security/auth'
import { validateRequest, createServerError } from '@/lib/security/validation'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { logger } from '@/lib/security/logger'
import { sql } from 'drizzle-orm'
import { provider, WLD, TREASURY, IFACE, checksum } from '@/lib/chain'

const MIN_CONFIRMATIONS = parseInt(process.env.MIN_CONFIRMATIONS || '1', 10)

const ConfirmPaymentSchema = z.object({
  intentId: z.string().min(1, 'Intent ID is required'),
  transactionId: z.string().min(1, 'Transaction ID is required'),
  reference: z.string().optional()
})

async function verifyTransactionOnChain(
  txHash: string,
  expectedSender: string,
  expectedAmountWei: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const receipt = await provider.getTransactionReceipt(txHash)
    
    if (!receipt) {
      return { valid: false, error: 'Transaction not found on chain' }
    }
    
    if (receipt.status !== 1) {
      return { valid: false, error: 'Transaction failed on chain' }
    }
    
    const latestBlock = await provider.getBlockNumber()
    const confirmations = latestBlock - receipt.blockNumber
    
    if (confirmations < MIN_CONFIRMATIONS) {
      return { valid: false, error: `Insufficient confirmations: ${confirmations}/${MIN_CONFIRMATIONS}` }
    }
    
    const logs = receipt.logs.filter(log => 
      log.address.toLowerCase() === WLD.toLowerCase()
    )
    
    let foundValidTransfer = false
    for (const log of logs) {
      try {
        const decoded = IFACE.decodeEventLog('Transfer', log.data, log.topics)
        const from = checksum(decoded.from)
        const to = checksum(decoded.to)
        const value = decoded.value as bigint
        
        if (
          from.toLowerCase() === expectedSender.toLowerCase() &&
          to.toLowerCase() === TREASURY.toLowerCase() &&
          value >= BigInt(expectedAmountWei)
        ) {
          foundValidTransfer = true
          break
        }
      } catch {
        continue
      }
    }
    
    if (!foundValidTransfer) {
      return { valid: false, error: 'No matching WLD transfer found in transaction' }
    }
    
    return { valid: true }
  } catch (error) {
    logger.error('On-chain verification failed', { txHash, error: String(error) })
    return { valid: false, error: 'Failed to verify transaction on chain' }
  }
}

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function POST(req: NextRequest) {
  try {
    const { authenticated, wallet } = requireAuth(req)
    if (!authenticated || !wallet) {
      logger.warn('Unauthenticated payment confirm request')
      return createAuthErrorResponse('Authentication required')
    }
    
    const address = normalizeAddress(wallet)
    
    const validation = await validateRequest(req, ConfirmPaymentSchema)
    if (!validation.success) {
      return validation.response
    }
    
    const { intentId, transactionId: rawTransactionId } = validation.data
    
    logger.info('Payment confirmation request', { intentId, transactionId: rawTransactionId, address })
    
    const transactionId = rawTransactionId.toLowerCase()

    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT * FROM payment_intents WHERE id = ${intentId} FOR UPDATE`
      )
      
      const rows = lockResult.rows as any[]
      if (!rows || rows.length === 0) {
        logger.error('Intent not found in database', { intentId, address })
        return { error: 'intent_not_found', message: 'Payment intent not found', status: 404 }
      }
      
      const intent = {
        id: rows[0].id,
        address: rows[0].address,
        eventId: rows[0].event_id,
        expectedWei: rows[0].expected_wei,
        expiresAt: rows[0].expires_at,
        status: rows[0].status,
        txHash: rows[0].tx_hash
      }
      
      logger.info('Intent found', { intentId, intentAddress: intent.address, requestAddress: address, status: intent.status })
      
      if (intent.address !== address) {
        logger.warn('Address mismatch', { intentAddress: intent.address, requestAddress: address })
        return { error: 'unauthorized', message: 'This payment does not belong to you', status: 403 }
      }

      if (new Date() > new Date(intent.expiresAt)) {
        return { error: 'intent_expired', message: 'Payment expired. Please try again.', status: 400 }
      }

      if (intent.status === 'confirmed') {
        logger.info('Intent already confirmed', { intentId })
        return { success: true, message: 'Credit already granted', eventId: intent.eventId }
      }

      if (intent.status === 'failed') {
        return { error: 'intent_failed', message: 'Payment failed. Please try again.', status: 400 }
      }

      const replayCheck = await tx
        .select()
        .from(paymentIntents)
        .where(and(
          eq(paymentIntents.txHash, transactionId),
          ne(paymentIntents.id, intentId)
        ))
        .limit(1)

      if (replayCheck.length > 0) {
        logger.warn('Transaction replay detected', { transactionId, intentId })
        return { error: 'tx_already_used', message: 'Transaction already used.', status: 400 }
      }

      if (intent.txHash && intent.txHash !== transactionId) {
        return { error: 'tx_mismatch', message: 'Transaction mismatch.', status: 400 }
      }

      // CRITICAL: Verify transaction on-chain before granting credit
      const onChainVerification = await verifyTransactionOnChain(
        transactionId,
        intent.address,
        intent.expectedWei
      )
      
      if (!onChainVerification.valid) {
        logger.warn('On-chain verification failed', { 
          intentId, 
          transactionId, 
          error: onChainVerification.error 
        })
        return { 
          error: 'verification_failed', 
          message: onChainVerification.error || 'Transaction verification failed', 
          status: 400 
        }
      }
      
      logger.info('On-chain verification passed', { intentId, transactionId })

      try {
        await tx
          .update(paymentIntents)
          .set({ status: 'confirmed', txHash: transactionId })
          .where(eq(paymentIntents.id, intentId))
      } catch (dbError: any) {
        if (dbError?.code === '23505' || dbError?.message?.includes('unique')) {
          return { error: 'tx_already_used', message: 'Transaction already used.', status: 400 }
        }
        throw dbError
      }

      const existingCredits = await tx
        .select()
        .from(credits)
        .where(and(
          eq(credits.address, address),
          eq(credits.eventId, intent.eventId)
        ))
        .for('update')
        .limit(1)

      if (existingCredits.length > 0) {
        const currentBalance = existingCredits[0].balance
        await tx
          .update(credits)
          .set({ 
            balance: currentBalance + 1,
            updatedAt: new Date()
          })
          .where(and(
            eq(credits.address, address),
            eq(credits.eventId, intent.eventId)
          ))
        logger.info('Payment confirmed - credit incremented', { 
          intentId, address, eventId: intent.eventId, 
          transactionId, previousBalance: currentBalance, newBalance: currentBalance + 1 
        })
      } else {
        await tx.insert(credits).values({
          address: address,
          eventId: intent.eventId,
          balance: 1,
          used: false
        })
        logger.info('Payment confirmed - new credit granted', { intentId, address, eventId: intent.eventId, transactionId })
      }

      return {
        success: true,
        message: 'Credit granted',
        eventId: intent.eventId,
        balance: 1
      }
    })

    if ('error' in result) {
      logger.warn('Payment rejected', { intentId, error: result.error, message: result.message })
      return addCorsHeaders(NextResponse.json(
        { error: result.error, message: result.message },
        { status: result.status || 400 }
      ))
    }

    return addCorsHeaders(NextResponse.json(result))

  } catch (error) {
    logger.error('Payment error', { error: String(error) })
    return createServerError()
  }
}
