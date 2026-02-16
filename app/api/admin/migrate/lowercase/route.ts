import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

function verifyApiKey(apiKey: string | null): boolean {
  if (!apiKey) return false
  return apiKey === process.env.ADMIN_API_KEY
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-admin-key')
    
    if (!verifyApiKey(apiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: Record<string, any> = {}

    // Step 1: Find all mixed-case users
    const mixedCaseUsers = await sql`
      SELECT address, username, is_verified, first_seen_at FROM users 
      WHERE address != LOWER(address)
    `
    results.mixedCaseUsersFound = mixedCaseUsers.length

    if (mixedCaseUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No mixed-case addresses found',
        updates: results
      })
    }

    // Step 2: For each mixed-case user, insert lowercase version if it doesn't exist
    for (const user of mixedCaseUsers) {
      const lowercaseAddr = user.address.toLowerCase()
      
      // Check if lowercase version exists
      const existing = await sql`SELECT address FROM users WHERE address = ${lowercaseAddr}`
      
      if (existing.length === 0) {
        // Insert lowercase user
        await sql`
          INSERT INTO users (address, username, is_verified, first_seen_at)
          VALUES (${lowercaseAddr}, ${user.username}, ${user.is_verified}, ${user.first_seen_at})
        `
        results[`inserted_${lowercaseAddr}`] = true
      }
    }

    // Step 3: Update all FK tables to use lowercase addresses
    // Handle unique constraint conflicts by deleting duplicates first
    
    // Credits - delete duplicates keeping non-used ones, then update
    for (const user of mixedCaseUsers) {
      const oldAddr = user.address
      const newAddr = oldAddr.toLowerCase()
      
      // Check for duplicate credits (same event, different case address)
      const duplicateCredits = await sql`
        SELECT c1.id as old_id, c2.id as new_id, c1.event_id
        FROM credits c1
        JOIN credits c2 ON c1.event_id = c2.event_id AND c2.address = ${newAddr}
        WHERE c1.address = ${oldAddr}
      `
      
      for (const dup of duplicateCredits) {
        // Delete the old one (mixed-case)
        await sql`DELETE FROM credits WHERE id = ${dup.old_id}`
        results[`deleted_dup_credit_${dup.old_id}`] = true
      }
      
      // Now update remaining credits
      await sql`UPDATE credits SET address = ${newAddr} WHERE address = ${oldAddr}`
      
      // Handle other tables similarly - delete duplicates then update
      // Leaderboard
      await sql`
        DELETE FROM leaderboard WHERE address = ${oldAddr} 
        AND event_id IN (SELECT event_id FROM leaderboard WHERE address = ${newAddr})
      `
      await sql`UPDATE leaderboard SET address = ${newAddr} WHERE address = ${oldAddr}`
      
      // Try counter
      await sql`
        DELETE FROM try_counter WHERE address = ${oldAddr}
        AND event_id IN (SELECT event_id FROM try_counter WHERE address = ${newAddr})
      `
      await sql`UPDATE try_counter SET address = ${newAddr} WHERE address = ${oldAddr}`
      
      // These don't have unique constraints, just update
      await sql`UPDATE runs SET address = ${newAddr} WHERE address = ${oldAddr}`
      await sql`UPDATE payment_intents SET address = ${newAddr} WHERE address = ${oldAddr}`
      await sql`UPDATE credit_transactions SET address = ${newAddr} WHERE address = ${oldAddr}`
      await sql`UPDATE game_sessions SET address = ${newAddr} WHERE address = ${oldAddr}`
      
      results[`migrated_${oldAddr}`] = newAddr
    }

    // Step 4: Delete old mixed-case users (all FK references are now gone)
    for (const user of mixedCaseUsers) {
      await sql`DELETE FROM users WHERE address = ${user.address}`
      results[`deleted_user_${user.address}`] = true
    }

    // Step 5: Find and fix any orphaned credits with mixed-case addresses
    // (credits where user exists in lowercase but credit has mixed-case)
    const mixedCaseCredits = await sql`
      SELECT c.id, c.address, c.event_id FROM credits c
      WHERE c.address != LOWER(c.address)
    `
    results.orphanedCreditsFound = mixedCaseCredits.length

    for (const credit of mixedCaseCredits) {
      const oldAddr = credit.address
      const newAddr = oldAddr.toLowerCase()
      
      // Check if lowercase user exists
      const userExists = await sql`SELECT address FROM users WHERE address = ${newAddr}`
      
      if (userExists.length === 0) {
        // Create lowercase user
        await sql`INSERT INTO users (address) VALUES (${newAddr}) ON CONFLICT DO NOTHING`
        results[`created_user_for_orphan_${newAddr}`] = true
      }
      
      // Check for duplicate credit at lowercase address
      const dupCredit = await sql`
        SELECT id FROM credits WHERE address = ${newAddr} AND event_id = ${credit.event_id}
      `
      
      if (dupCredit.length > 0) {
        // Delete the mixed-case one
        await sql`DELETE FROM credits WHERE id = ${credit.id}`
        results[`deleted_orphan_credit_${credit.id}`] = true
      } else {
        // Update to lowercase
        await sql`UPDATE credits SET address = ${newAddr} WHERE id = ${credit.id}`
        results[`fixed_orphan_credit_${credit.id}`] = newAddr
      }
    }

    // Step 6: Backfill usernameLower for all existing users
    const usersWithoutLower = await sql`
      SELECT address, username FROM users 
      WHERE username IS NOT NULL AND username_lower IS NULL
    `
    results.usersNeedingLowerBackfill = usersWithoutLower.length

    for (const user of usersWithoutLower) {
      const lowerUsername = user.username.toLowerCase()
      await sql`
        UPDATE users SET username_lower = ${lowerUsername} 
        WHERE address = ${user.address}
      `
      results[`backfilled_username_${user.address}`] = lowerUsername
    }

    return NextResponse.json({
      success: true,
      message: 'All addresses converted to lowercase',
      updates: results
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    )
  }
}
