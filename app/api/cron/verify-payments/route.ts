import { NextRequest, NextResponse } from 'next/server'
import { getProvider, WLD, TREASURY, IFACE, TRANSFER_TOPIC } from '@/lib/chain'
import { ethers } from 'ethers'
import { db } from '@/db'
import { paymentIntents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { addEventCredit } from '@/lib/creditManager'
import { validateAdminKey, createAdminErrorResponse } from '@/lib/security/auth'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { logger } from '@/lib/security/logger'
import { createServerError } from '@/lib/security/validation'

const MIN_CONFIRMATIONS = parseInt(process.env.MIN_CONFIRMATIONS || '1', 10)
const REORG_SAFETY_BLOCKS = parseInt(process.env.REORG_SAFETY_BLOCKS || '12', 10)

export async function OPTIONS() {
  return createOptionsResponse('admin')
}

export async function POST(req: NextRequest) {
  try {
    if (!validateAdminKey(req)) {
      logger.error('Unauthorized payment verification attempt', { 
        ip: req.headers.get('x-forwarded-for') || 'unknown' 
      })
      return createAdminErrorResponse()
    }

    const startTime = Date.now()
    const intents = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.status, 'pending'))

    const provider = getProvider()
    const latest = await provider.getBlockNumber()
    let checked = 0
    let confirmed = 0
    let expired = 0

    for (const intent of intents) {
      checked++

      if (new Date() > new Date(intent.expiresAt)) {
        await db
          .update(paymentIntents)
          .set({ status: 'expired' })
          .where(eq(paymentIntents.id, intent.id))
        
        logger.info('Payment intent expired', { 
          intentId: intent.id,
          address: intent.address,
          eventId: intent.eventId,
          expiresAt: intent.expiresAt 
        })
        expired++
        continue
      }

      const fromBlock = Math.max(
        intent.createdBlock ?? latest - 2500,
        latest - REORG_SAFETY_BLOCKS
      )
      const toBlock = latest

      try {
        const filter = {
          address: WLD,
          fromBlock,
          toBlock,
          topics: [
            TRANSFER_TOPIC,
            ethers.zeroPadValue(intent.address, 32),
            ethers.zeroPadValue(TREASURY, 32),
          ],
        }

        const logs = await provider.getLogs(filter)
        let matched = null

        for (const log of logs) {
          const { args } = IFACE.decodeEventLog('Transfer', log.data, log.topics)
          const value = args.value as bigint

          if (value >= BigInt(intent.expectedWei)) {
            const receipt = await provider.getTransactionReceipt(log.transactionHash)
            
            if (receipt?.status === 1) {
              const confirmations = latest - receipt.blockNumber
              if (confirmations >= MIN_CONFIRMATIONS) {
                matched = log
                break
              }
            }
          }
        }

        if (matched) {
          const txHash = matched.transactionHash

          await db
            .update(paymentIntents)
            .set({ 
              status: 'confirmed',
              txHash,
            })
            .where(eq(paymentIntents.id, intent.id))

          const result = await addEventCredit(intent.address, intent.eventId, txHash)

          logger.info('Payment intent confirmed', {
            intentId: intent.id,
            address: intent.address,
            eventId: intent.eventId,
            txHash,
            blockNumber: matched.blockNumber,
            confirmations: latest - matched.blockNumber,
            creditAdded: result.success
          })
          
          confirmed++
        }
      } catch (error) {
        logger.error('Error processing payment intent', { 
          intentId: intent.id,
          error: String(error) 
        })
      }
    }

    const latencyMs = Date.now() - startTime

    logger.info('Payment verification completed', {
      intentsChecked: checked,
      intentsConfirmed: confirmed,
      intentsExpired: expired,
      latestBlock: latest,
      latencyMs
    })

    return addCorsHeaders(NextResponse.json({
      ok: true,
      checked,
      confirmed,
      expired,
      latestBlock: latest,
      latencyMs
    }), 'admin')
  } catch (error) {
    logger.error('Payment verification failed', { error: String(error) })
    return createServerError()
  }
}
