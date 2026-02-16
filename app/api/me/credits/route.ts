import { NextRequest, NextResponse } from 'next/server'
import { getUserCredits, getEventCredits } from '@/lib/creditManager'
import { checksum } from '@/lib/chain'
import { checkRateLimit } from '@/app/lib/rateLimit'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'
import { createServerError } from '@/lib/security/validation'

async function getSessionAddress(req: NextRequest): Promise<string | null> {
  const walletHeader = req.headers.get('x-wallet')
  if (!walletHeader) {
    return null
  }
  
  try {
    return checksum(walletHeader)
  } catch {
    return null
  }
}

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(req: NextRequest) {
  try {
    const address = await getSessionAddress(req)
    
    if (!address) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      ))
    }

    const rateLimit = await checkRateLimit(address, 'me/credits')
    if (!rateLimit.allowed) {
      return addCorsHeaders(NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many requests', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      ))
    }

    // Check if eventId is provided in query params
    const { searchParams } = new URL(req.url)
    const eventIdParam = searchParams.get('eventId')
    
    if (eventIdParam) {
      const eventId = parseInt(eventIdParam, 10)
      if (isNaN(eventId)) {
        return addCorsHeaders(NextResponse.json(
          { error: 'Invalid eventId' },
          { status: 400 }
        ))
      }
      
      // Return event-specific credit info
      const eventCredit = await getEventCredits(address, eventId)
      return addCorsHeaders(NextResponse.json({ 
        credits: eventCredit.balance,
        used: eventCredit.used,
        eventId 
      }))
    }

    // Legacy: Return total credits across all events
    const credits = await getUserCredits(address)
    return addCorsHeaders(NextResponse.json({ credits }))
  } catch (error) {
    console.error('Error getting credits:', error)
    return createServerError()
  }
}
