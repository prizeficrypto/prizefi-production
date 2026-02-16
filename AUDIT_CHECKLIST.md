# BitPlay Security Audit Checklist

## Smart Contract Security

### Re-entrancy Protection
- [x] **Claim function uses Checks-Effects-Interactions pattern**
  - State changes (`claimed[eventId][msg.sender] = true`) happen before external call
  - Event emission before token transfer
  - Token transfer happens last
- [x] **No recursive calls possible in claim flow**

### Event Logging
- [x] **EventFinalized** - Emits when admin finalizes event with merkle root
- [x] **PrizeClaimed** - Emits on successful claim (eventId, claimant, amount)
- [x] **Paused/Unpaused** - Emits on pause state changes
- [x] **OwnershipTransferred** - Emits on ownership transfer

### Pause Functionality
- [x] **Pause blocks finalization** - `finalizeEvent` has `whenNotPaused` modifier
- [x] **Pause allows claims** - `claim` function has no pause check
- [x] **Only owner can pause/unpause**

### Access Control
- [x] **Owner-only functions protected** - `onlyOwner` modifier on critical functions
- [x] **Multisig recommended** - Owner should be set to multisig wallet address
- [x] **No backdoors** - No emergency withdrawals during active claims

### Merkle Proof Security
- [x] **Standard keccak256 hashing** - `abi.encodePacked(address, amount)`
- [x] **Sorted pairs** - MerkleTree uses `sortPairs: true`
- [x] **Proof verification before transfer**

### Token Handling
- [x] **No ether accepted** - `receive()` reverts
- [x] **WLD token immutable** - Set in constructor, cannot be changed
- [x] **Transfer validation** - Requires successful `transfer()` return

## Backend Security

### Input Validation & Replay Protection
- [x] **HMAC token validation** - `/api/run/start` creates HMAC token
- [x] **Token used once** - `/api/run/finish` checks `startToken` unique constraint
- [x] **Physics replay validation** - Server validates score using deterministic physics
- [x] **Seed validation** - Cryptographically secure seeds prevent manipulation

### Rate Limiting
- [x] **Run start**: 10 requests/minute per address
- [x] **Run finish**: 5 requests/minute per address
- [x] **Leaderboard**: 30 requests/minute per address
- [x] **Admin finalize**: Protected by API key

### Logging
- [x] **Structured JSON logs** - All API routes use `createLogger()`
- [x] **Request tracing** - Every request has unique `requestId`
- [x] **Security events logged** - Invalid tokens, failed validations, rate limits
- [x] **No secret exposure** - Logs never contain HMAC secrets or API keys

### Admin Endpoints
- [x] **API key protection** - `/api/admin/finalize` requires `x-admin-api-key` header
- [x] **Server-side only** - Admin endpoints return 401 without valid key
- [x] **Merkle tree generation** - Server computes merkle root from frozen leaderboard
- [x] **Winners validation** - Only top 100 from frozen leaderboard included

## Frontend/App Security

### Mobile-Only Enforcement
- [x] **MiniKit SDK integration** - App designed for World App Mini Apps
- [x] **Desktop blocking** - App detects and blocks non-mobile access
- [x] **World ID verification** - Uses MiniKit for user authentication

### Pricing Rules
- [x] **0.5 WLD for World ID verified users**
- [x] **1.0 WLD for unverified users**
- [x] **Entry fee validation** - Server checks World ID status before allowing entries
- [x] **Try counter enforcement** - Max 3 tries per event per user

### Internationalization (i18n)
- [x] **6 languages supported** - English, Spanish, Filipino, Indonesian, Japanese, Korean
- [x] **Translation files present** - All in `/locales/{lang}/common.json`
- [x] **No hardcoded strings** - UI uses translation keys

### No Private Keys in App
- [x] **MiniKit wallet integration** - Users sign transactions via World App
- [x] **No key storage** - App never stores or handles private keys
- [x] **Transaction signing** - All done through MiniKit SDK

## Data Integrity

### Merkle Tree Generation
- [x] **Deterministic sorting** - Winners sorted by rank before tree generation
- [x] **Double-hash leaves** - Uses keccak256(abi.encodePacked(...))
- [x] **Proof storage** - Proofs stored in `eventWinners.proofsData` as JSON
- [x] **Root verification** - Server validates merkle root matches frozen leaderboard

### Database Constraints
- [x] **Unique constraints** - Event-address pairs unique in leaderboard
- [x] **Foreign keys** - All references properly constrained
- [x] **Indexes** - Performance indexes on frequently queried fields
- [x] **Frozen events** - Leaderboard changes blocked after event frozen

## Test Net Dry-Run Checklist

### Deployment Tests
- [ ] Deploy PrizeDistributor to World Chain Sepolia
- [ ] Fund contract with test WLD tokens
- [ ] Verify contract on block explorer
- [ ] Transfer ownership to multisig wallet

### Claim Flow Tests (3 Winners)
- [ ] Create test event with 3 users
- [ ] Submit scores for all 3 users
- [ ] Finalize event via `/api/admin/finalize`
- [ ] Verify merkle root stored in database
- [ ] Call `finalizeEvent` on contract (via multisig)
- [ ] Winner 1: Successfully claim prize via MiniKit
- [ ] Winner 2: Successfully claim prize via MiniKit
- [ ] Winner 3: Successfully claim prize via MiniKit
- [ ] Verify all transaction hashes displayed in UI

### Double-Claim Protection
- [ ] Winner 1: Attempt to claim again (should fail with "Already claimed")
- [ ] Verify `hasClaimed(eventId, winner1)` returns `true`
- [ ] Verify claim button disabled after successful claim

### Pause Functionality Tests
- [ ] Pause contract
- [ ] Attempt to finalize new event (should fail)
- [ ] Verify existing claims still work while paused
- [ ] Unpause contract
- [ ] Verify finalization works again

## Production Readiness

### Environment Configuration
- [x] **Separate dev/staging/prod configs** - `NEXT_PUBLIC_ENV` variable
- [x] **Staging watermark** - Visible indicator in non-prod environments
- [x] **Health check endpoint** - `/api/health` for monitoring
- [x] **Vercel deployment config** - Ready for one-click deploy

### Monitoring
- [x] **Structured logs** - JSON logs for aggregation
- [x] **Error boundaries** - Graceful error handling in UI
- [x] **Event monitoring cron** - `/api/cron/check-events` for event lifecycle
- [x] **Smoke tests** - `npm run test:smoke` validates endpoints

### Documentation
- [x] **README** - Deployment instructions
- [x] **Contract README** - Deployment and setup guide
- [x] **Environment template** - `.env.example` with all variables
- [x] **Audit checklist** - This document

## Sign-off

**Contract Audit**: ⬜ Pending  
**Backend Audit**: ⬜ Pending  
**Frontend Audit**: ⬜ Pending  
**Test Net Validation**: ⬜ Pending  
**Production Ready**: ⬜ Pending  

---

**Notes**:
- All checkboxes marked [x] indicate feature is implemented
- Checkboxes marked [ ] are test validations to be completed
- Contract uses custom MerkleProof implementation (consider OpenZeppelin for production)
- Multisig wallet setup is critical before mainnet deployment
- Test net dry-run must pass all tests before production deployment
