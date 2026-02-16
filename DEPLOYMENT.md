# BitPlay Deployment Guide

## Prerequisites

1. **World App Developer Account**
   - Sign up at https://developer.worldcoin.org/
   - Create a new Mini App project
   - Get your `MINIKIT_PROJECT_ID`

2. **World Chain Wallet**
   - Install World App on mobile device
   - Create wallet
   - Get testnet ETH for World Chain Sepolia (https://worldchain-sepolia.faucet.alchemy.com/)
   - Get testnet WLD tokens

3. **Multisig Wallet** (Production)
   - Set up Safe multisig on World Chain
   - Add signers (recommended: 3-5 signers, 2-3 threshold)

## Step 1: Deploy Smart Contract

### Test Net Deployment (World Chain Sepolia)

```bash
# 1. Add deployer private key to .env.local
DEPLOYER_PRIVATE_KEY=your_testnet_private_key_here

# 2. Compile contract
npx hardhat compile

# 3. Deploy to Sepolia
npm run contract:deploy

# 4. Copy contract address from output
# Example: 0x1234567890abcdef...
```

### Update Environment Variables

Add to `.env.local`:
```bash
NEXT_PUBLIC_PRIZE_DISTRIBUTOR_ADDRESS=0x_your_deployed_contract_address
NEXT_PUBLIC_WLD_TOKEN_ADDRESS=0x2cFc85d8E48F8EAB294be644d9E25C3030863003
```

### Verify Contract

```bash
npx hardhat verify --network worldchainSepolia \
  YOUR_CONTRACT_ADDRESS \
  0x2cFc85d8E48F8EAB294be644d9E25C3030863003
```

## Step 2: Fund Contract with WLD

```bash
# Option 1: Via World App
# Send 2,500 WLD (or more for multiple events) to contract address

# Option 2: Via Contract Call
# Use World App to call WLD.transfer(contractAddress, amount)
```

## Step 3: Transfer Ownership to Multisig

```bash
# Using Hardhat console
npx hardhat console --network worldchainSepolia

# Then run:
const PrizeDistributor = await ethers.getContractFactory("PrizeDistributor")
const distributor = await PrizeDistributor.attach("YOUR_CONTRACT_ADDRESS")
await distributor.transferOwnership("YOUR_MULTISIG_ADDRESS")
```

## Step 4: Deploy Backend & Frontend

### Vercel Deployment

1. **Connect Repository**
   - Go to https://vercel.com
   - Import your GitHub repository
   - Select the Next.js framework preset

2. **Configure Environment Variables**
   ```bash
   # Public variables
   NEXT_PUBLIC_ENV=production
   NEXT_PUBLIC_MINIKIT_PROJECT_ID=your_minikit_project_id
   NEXT_PUBLIC_TREASURY_CONTRACT=0x_treasury_wallet_address
   NEXT_PUBLIC_PRIZE_DISTRIBUTOR_ADDRESS=0x_deployed_contract
   NEXT_PUBLIC_WLD_TOKEN_ADDRESS=0x2cFc85d8E48F8EAB294be644d9E25C3030863003
   
   # Server-only secrets
   ADMIN_API_KEY=your_secure_random_key_here
   SERVER_HMAC_SECRET=your_secure_random_secret_here
   SESSION_SECRET=your_secure_session_secret_here
   DATABASE_URL=your_postgresql_database_url
   ```

3. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Verify deployment at your-app.vercel.app

## Step 5: Test on World Chain Sepolia

### Run Complete Test Suite

```bash
# 1. Update .env.local with deployed contract address
NEXT_PUBLIC_PRIZE_DISTRIBUTOR_ADDRESS=0x_your_contract

# 2. Run test script (requires funded contract)
npm run contract:test
```

### Manual Testing Checklist

- [ ] **Create Event**
  - Access `/api/event/current`
  - Verify event auto-created with 7-day duration

- [ ] **Submit Scores**
  - Play game via World App
  - Submit 3 scores from different wallets
  - Verify leaderboard updates

- [ ] **Finalize Event**
  ```bash
  curl -X POST https://your-app.vercel.app/api/admin/finalize \
    -H "x-admin-api-key: YOUR_ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -d '{"eventId": 1}'
  ```
  - Verify merkle root stored in database
  - Check response includes merkleRoot and winnersCount

- [ ] **Finalize On-Chain** (via Multisig)
  ```bash
  # Using Safe app or Hardhat console
  await distributor.finalizeEvent(eventId, merkleRoot)
  ```

- [ ] **Claim Prizes**
  - Open World App as winner
  - Navigate to leaderboard
  - Click "Claim Prize" button
  - Sign transaction via MiniKit
  - Verify transaction hash displayed
  - Check WLD balance increased

- [ ] **Double-Claim Test**
  - Attempt to claim again
  - Verify error: "Already claimed"
  - Verify button disabled

- [ ] **Pause Test**
  - Pause contract via multisig
  - Try to finalize new event (should fail)
  - Try to claim (should still work)
  - Unpause contract

## Step 6: Production Deployment

### Mainnet Deployment

```bash
# 1. Update hardhat config network to 'worldchain'
# 2. Get REAL WLD tokens (no faucet, must buy)
# 3. Deploy
npx hardhat run scripts/deploy-contract.ts --network worldchain

# 4. Verify
npx hardhat verify --network worldchain \
  YOUR_CONTRACT_ADDRESS \
  0x2cFc85d8E48F8EAB294be644d9E25C3030863003
```

### Update Production Environment

```bash
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_PRIZE_DISTRIBUTOR_ADDRESS=0x_mainnet_contract
# ... (same as testnet but with production values)
```

### Security Checklist

- [ ] **Multisig configured** with 3+ signers
- [ ] **Contract ownership** transferred to multisig
- [ ] **Admin API key** is cryptographically random (32+ chars)
- [ ] **HMAC secret** is cryptographically random (32+ chars)
- [ ] **Database backups** enabled
- [ ] **Rate limits** configured in Vercel
- [ ] **Monitoring** set up (Datadog, Sentry, etc.)
- [ ] **Audit completed** (see AUDIT_CHECKLIST.md)

## Step 7: Configure World App Mini App

1. **Go to Developer Portal**
   - https://developer.worldcoin.org/

2. **Update Mini App Settings**
   - **Name**: BitPlay
   - **Description**: Flappy Bird contest with WLD prizes
   - **URL**: https://your-app.vercel.app
   - **Icon**: Upload 512x512 icon
   - **Category**: Games

3. **Configure Permissions**
   - ✅ Wallet access
   - ✅ World ID verification
   - ✅ Transaction signing

4. **Test in World App**
   - Open World App
   - Go to Mini Apps
   - Find BitPlay
   - Test complete flow

## Monitoring & Maintenance

### Health Checks

```bash
# Check API health
curl https://your-app.vercel.app/api/health

# Check contract owner
npx hardhat console --network worldchain
> const dist = await ethers.getContractAt("PrizeDistributor", "ADDRESS")
> await dist.owner()

# Check contract balance
> const wld = await ethers.getContractAt("IERC20", WLD_ADDRESS)
> await wld.balanceOf(DISTRIBUTOR_ADDRESS)
```

### Event Monitoring Cron

Set up Vercel Cron or external cron service to call:
```bash
curl https://your-app.vercel.app/api/cron/check-events
```

Frequency: Every hour

### Emergency Procedures

**If contract needs pausing:**
```bash
# Via multisig
await distributor.pause()
```

**If winners need verification:**
```sql
SELECT * FROM event_winners WHERE event_id = X;
SELECT * FROM leaderboard WHERE event_id = X ORDER BY rank LIMIT 100;
```

**If contract needs WLD refill:**
```bash
# Check balance
await wld.balanceOf(distributorAddress)

# Transfer more WLD to contract
await wld.transfer(distributorAddress, amount)
```

## Troubleshooting

### Contract deployment fails
- Ensure wallet has enough ETH for gas
- Verify network RPC is accessible
- Check Hardhat config network settings

### Claim button not showing
- Verify event is finalized in database
- Check merkle root matches on-chain
- Verify wallet address is in top 100

### Transaction fails
- Check contract has WLD balance
- Verify merkle proof is valid
- Ensure user hasn't already claimed
- Check if contract is paused

### Database issues
- Run `npm run db:push` to sync schema
- Check DATABASE_URL is correct
- Verify Neon database is online

## Support

For issues with:
- **Smart Contract**: Check World Chain docs
- **MiniKit**: https://docs.worldcoin.org/minikit
- **Deployment**: Vercel support
- **Database**: Neon support
