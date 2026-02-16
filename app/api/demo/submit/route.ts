import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { demoScores, users } from '@/db/schema'
import { sql, eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    
    const rateLimit = await checkRateLimit(ip, 'demo-submit', 10, 60000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      )
    }

    const { playerName, score, walletAddress, isVerified } = await req.json()

    if (!playerName || typeof score !== 'number') {
      return NextResponse.json(
        { error: 'Invalid request. playerName and score required.' },
        { status: 400 }
      )
    }
    
    const sanitizedWallet = walletAddress?.trim()?.toLowerCase() || null
    const verifiedStatus = isVerified === true

    const sanitizedName = playerName.trim()
    
    if (!sanitizedName || sanitizedName.length === 0) {
      return NextResponse.json(
        { error: 'Player name cannot be empty' },
        { status: 400 }
      )
    }

    if (sanitizedName.length > 50) {
      return NextResponse.json(
        { error: 'Player name too long (max 50 characters)' },
        { status: 400 }
      )
    }

    if (score < 0 || score > 100000 || !Number.isInteger(score)) {
      return NextResponse.json(
        { error: 'Invalid score' },
        { status: 400 }
      )
    }

    await db.insert(demoScores).values({
      playerName: sanitizedName,
      walletAddress: sanitizedWallet,
      isVerified: verifiedStatus,
      score,
    })

    if (sanitizedWallet) {
      await db
        .update(users)
        .set({ allTimeBestScore: sql`GREATEST(${users.allTimeBestScore}, ${score})` })
        .where(eq(users.address, sanitizedWallet))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error submitting demo score:', error)
    return NextResponse.json(
      { error: 'Failed to submit score' },
      { status: 500 }
    )
  }
}

async function checkRateLimit(identifier: string, endpoint: string, maxRequests: number, windowMs: number) {
  const now = Date.now()
  const windowStart = new Date(now - windowMs)
  
  const existing = await db.execute(sql`
    SELECT count FROM rate_limits 
    WHERE address = ${identifier} 
    AND endpoint = ${endpoint} 
    AND window_start > ${windowStart.toISOString()}
  `)
  
  if (existing.rows.length > 0 && (existing.rows[0] as any).count >= maxRequests) {
    return { allowed: false }
  }
  
  if (existing.rows.length > 0) {
    await db.execute(sql`
      UPDATE rate_limits 
      SET count = count + 1 
      WHERE address = ${identifier} 
      AND endpoint = ${endpoint}
    `)
  } else {
    await db.execute(sql`
      INSERT INTO rate_limits (address, endpoint, count, window_start)
      VALUES (${identifier}, ${endpoint}, 1, NOW())
    `)
  }
  
  return { allowed: true }
}
