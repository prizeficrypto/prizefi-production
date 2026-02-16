import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { normalizeAddress } from '@/lib/addressUtils'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawAddress = searchParams.get('address')
    
    if (!rawAddress) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 })
    }
    
    const address = normalizeAddress(rawAddress)
    
    const result = await db
      .select({ isVerified: users.isVerified })
      .from(users)
      .where(eq(sql`LOWER(${users.address})`, address.toLowerCase()))
      .limit(1)
    
    if (result.length === 0) {
      return NextResponse.json({ 
        found: false, 
        isVerified: false 
      })
    }
    
    return NextResponse.json({ 
      found: true, 
      isVerified: result[0].isVerified ?? false 
    })
    
  } catch (error) {
    console.error('Error fetching verification status:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { address: rawAddress, isVerified } = await req.json()
    
    if (!rawAddress) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 })
    }
    
    if (typeof isVerified !== 'boolean') {
      return NextResponse.json({ error: 'isVerified must be boolean' }, { status: 400 })
    }
    
    const address = normalizeAddress(rawAddress)
    
    const existing = await db
      .select({ address: users.address })
      .from(users)
      .where(eq(sql`LOWER(${users.address})`, address.toLowerCase()))
      .limit(1)
    
    if (existing.length > 0) {
      await db
        .update(users)
        .set({ isVerified })
        .where(eq(sql`LOWER(${users.address})`, address.toLowerCase()))
      
      console.log('Updated verification status:', { address, isVerified })
    } else {
      await db.insert(users).values({
        address,
        isVerified,
        firstSeenAt: new Date()
      })
      
      console.log('Created user with verification status:', { address, isVerified })
    }
    
    return NextResponse.json({ success: true, isVerified })
    
  } catch (error) {
    console.error('Error updating verification status:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
