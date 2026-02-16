import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { adBids } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      appName, 
      appUrl, 
      appLogo, 
      contactEmail, 
      contactWallet,
      adTitle, 
      adDescription, 
      bidAmountWld, 
      durationDays,
      targetImpressions 
    } = body

    if (!appName || !appUrl || !contactEmail || !adTitle || !bidAmountWld) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const bidAmount = parseFloat(bidAmountWld)
    if (isNaN(bidAmount) || bidAmount < 1) {
      return NextResponse.json({ error: 'Minimum bid is 1 WLD' }, { status: 400 })
    }

    const [bid] = await db.insert(adBids).values({
      appName,
      appUrl,
      appLogo: appLogo || null,
      contactEmail,
      contactWallet: contactWallet || null,
      adTitle,
      adDescription: adDescription || null,
      bidAmountWld: bidAmountWld.toString(),
      durationDays: durationDays || 7,
      targetImpressions: targetImpressions || null,
      status: 'pending',
    }).returning()

    return NextResponse.json({
      success: true,
      bidId: bid.id,
      message: 'Your bid has been submitted for review'
    })
  } catch (error) {
    console.error('Error submitting ad bid:', error)
    return NextResponse.json({ error: 'Failed to submit bid' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = db.select().from(adBids)
    
    if (status) {
      query = query.where(eq(adBids.status, status)) as any
    }

    const bids = await query.orderBy(desc(adBids.bidAmountWld), desc(adBids.createdAt))

    return NextResponse.json({
      bids: bids.map(b => ({
        id: b.id,
        appName: b.appName,
        appUrl: b.appUrl,
        appLogo: b.appLogo,
        adTitle: b.adTitle,
        adDescription: b.adDescription,
        bidAmountWld: b.bidAmountWld,
        durationDays: b.durationDays,
        targetImpressions: b.targetImpressions,
        status: b.status,
        createdAt: b.createdAt.toISOString(),
      }))
    })
  } catch (error) {
    console.error('Error fetching ad bids:', error)
    return NextResponse.json({ error: 'Failed to fetch bids' }, { status: 500 })
  }
}
