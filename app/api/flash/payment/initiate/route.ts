import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { flashPaymentIntents, flashEvents, flashCredits, users } from '@/db/schema'
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { ethers } from 'ethers'
import crypto from 'crypto'

const VERIFIED_ENTRY_FEE_WLD = 0.5
const UNVERIFIED_ENTRY_FEE_WLD = 0.75
const INTENT_EXPIRY_MINUTES = 10

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address } = body

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 })
    }

    const now = new Date()
    const currentFlash = await db
      .select()
      .from(flashEvents)
      .where(
        and(
          lte(flashEvents.startsAt, now),
          gte(flashEvents.endsAt, now),
          eq(flashEvents.frozen, false)
        )
      )
      .orderBy(desc(flashEvents.id))
      .limit(1)

    if (currentFlash.length === 0) {
      return NextResponse.json({ error: 'No active flash event' }, { status: 400 })
    }

    const flashEvent = currentFlash[0]

    const existingCredit = await db
      .select()
      .from(flashCredits)
      .where(
        and(
          eq(flashCredits.address, address),
          eq(flashCredits.flashEventId, flashEvent.id)
        )
      )
      .limit(1)

    if (existingCredit.length > 0 && existingCredit[0].balance > 0) {
      return NextResponse.json({ 
        error: 'Already have credit for this flash event',
        hasCredit: true 
      }, { status: 400 })
    }

    const userResult = await db
      .select({ isVerified: users.isVerified })
      .from(users)
      .where(eq(users.address, address))
      .limit(1)

    const isVerified = userResult.length > 0 ? userResult[0].isVerified : false
    const entryFee = isVerified ? VERIFIED_ENTRY_FEE_WLD : UNVERIFIED_ENTRY_FEE_WLD

    const expectedWei = ethers.parseEther(entryFee.toString()).toString()
    // MiniKit requires reference to be a UUID without dashes
    const intentId = crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + INTENT_EXPIRY_MINUTES * 60 * 1000)

    await db.insert(flashPaymentIntents).values({
      id: intentId,
      address,
      flashEventId: flashEvent.id,
      expectedWei,
      isVerified,
      expiresAt,
      status: 'pending',
    })

    return NextResponse.json({
      intentId,
      expectedWei,
      entryFeeWld: entryFee,
      flashEventId: flashEvent.id,
      expiresAt: expiresAt.toISOString(),
      treasuryAddress: process.env.NEXT_PUBLIC_TREASURY_CONTRACT,
    })
  } catch (error) {
    console.error('Error initiating flash payment:', error)
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
  }
}
