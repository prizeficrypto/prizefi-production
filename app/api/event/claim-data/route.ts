import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../db'
import { eventWinners } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { createServerError } from '@/lib/security/validation'
import { checkRateLimit } from '../../../lib/rateLimit'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    const address = searchParams.get('address')

    if (!eventId || !address) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Event ID and address required' },
        { status: 400 }
      ))
    }

    const rateLimit = await checkRateLimit(address, 'event/claim-data')
    if (!rateLimit.allowed) {
      return addCorsHeaders(NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many requests', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      ))
    }

    const [winners] = await db
      .select()
      .from(eventWinners)
      .where(eq(eventWinners.eventId, parseInt(eventId)))
      .limit(1)

    if (!winners) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Event not finalized' },
        { status: 404 }
      ))
    }

    const winnersData = JSON.parse(winners.winnersData)
    const proofsData = JSON.parse(winners.proofsData)

    const winner = winnersData.find(
      (w: any) => w.address.toLowerCase() === address.toLowerCase()
    )

    if (!winner) {
      return addCorsHeaders(NextResponse.json({
        isWinner: false,
      }))
    }

    const proof = proofsData[address.toLowerCase()]

    return addCorsHeaders(NextResponse.json({
      isWinner: true,
      amount: winner.amount,
      proof,
      merkleRoot: winners.merkleRoot,
    }))
  } catch (error) {
    console.error('Error fetching claim data:', error)
    return createServerError()
  }
}
