import { NextRequest, NextResponse } from 'next/server'
import { addCorsHeaders, createOptionsResponse } from '@/lib/security/cors'

export async function OPTIONS() {
  return createOptionsResponse('public')
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address) {
    return addCorsHeaders(NextResponse.json(
      { error: 'Address parameter required' },
      { status: 400 }
    ))
  }

  try {
    const response = await fetch(
      `https://usernames.worldcoin.org/api/v1/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addresses: [address.toLowerCase()]
        })
      }
    )

    if (!response.ok) {
      console.log('World username API returned:', response.status)
      return addCorsHeaders(NextResponse.json({ username: null }))
    }

    const data = await response.json()
    console.log('World username API response for', address, ':', JSON.stringify(data, null, 2))

    if (data && Array.isArray(data) && data.length > 0) {
      const user = data[0]
      return addCorsHeaders(NextResponse.json({
        username: user.username || null,
        profilePictureUrl: user.profile_picture_url || null,
        walletAddress: user.address || address
      }))
    }

    return addCorsHeaders(NextResponse.json({ username: null }))
  } catch (error) {
    console.error('Error fetching World username:', error)
    return addCorsHeaders(NextResponse.json({ username: null }))
  }
}
