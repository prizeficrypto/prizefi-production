import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../db'
import { eventWinners } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { createLogger } from '../../../../lib/logger'
import { checkRateLimit } from '../../../lib/rateLimit'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { createServerError } from '@/lib/security/validation'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(request: NextRequest) {
  const logger = createLogger('/api/claim/proof', 'GET')
  const { searchParams } = new URL(request.url)
  const eventId = parseInt(searchParams.get('eventId') || '0')
  const address = searchParams.get('address')?.toLowerCase()

  if (!eventId || !address) {
    logger.warn('Missing parameters', { eventId, address })
    return addCorsHeaders(NextResponse.json({ error: 'Missing eventId or address' }, { status: 400 }))
  }

  try {
    const rateLimit = await checkRateLimit(address, 'claim/proof')
    if (!rateLimit.allowed) {
      return addCorsHeaders(NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many requests', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      ))
    }

    logger.info('Fetching claim proof', { eventId, address })

    const [winnerData] = await db
      .select()
      .from(eventWinners)
      .where(eq(eventWinners.eventId, eventId))
      .limit(1)

    if (!winnerData) {
      logger.warn('Event not finalized', { eventId })
      return addCorsHeaders(NextResponse.json({ error: 'Event not finalized' }, { status: 404 }))
    }

    const winners = JSON.parse(winnerData.winnersData)
    const proofs = JSON.parse(winnerData.proofsData)

    const winnerEntry = winners.find((w: any) => w.address.toLowerCase() === address)

    if (!winnerEntry) {
      logger.info('Address not in winners', { eventId, address })
      return addCorsHeaders(NextResponse.json({ 
        error: 'Not a winner',
        isWinner: false 
      }, { status: 404 }))
    }

    // Proofs are keyed by lowercase address (from lib/merkle/index.ts line 34)
    const proof = proofs[address]

    if (!proof) {
      logger.error('Proof missing for winner', { eventId, address })
      return createServerError()
    }

    logger.success('Claim proof retrieved', { eventId, address, amount: winnerEntry.amount })

    return addCorsHeaders(NextResponse.json({
      isWinner: true,
      merkleRoot: winnerData.merkleRoot,
      amount: winnerEntry.amount,
      proof,
      rank: winnerEntry.rank,
    }))
  } catch (error) {
    logger.error('Failed to get claim proof', error)
    return createServerError()
  }
}
