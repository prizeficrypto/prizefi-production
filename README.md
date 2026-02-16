# BitPlay - Mobile Gaming Contest Platform

A mobile-first Mini App for World App featuring Flappy Bird-style competitive events with WLD prizes.

## Features

- 🎮 7-day competitive gaming events
- 💰 2,500 WLD prize pool per event (distributed to top 100)
- 🔒 Entry fees: 0.5 WLD (World ID verified) / 1.0 WLD (others)
- 🎯 3 tries per event
- 🏆 Real-time leaderboard with top 150 + your rank
- 🔐 Server-side deterministic physics replay validation
- 🌍 6-language support (EN, ES, FR, DE, JA, ZH)
- 📱 Mobile-only (World App)

## Environment Setup

Copy `.env.example` to `.env.local` and configure:

```bash
# Environment
NEXT_PUBLIC_ENV=development  # development | staging | production

# Database
DATABASE_URL=postgresql://user:password@host:port/database

# MiniKit
NEXT_PUBLIC_MINIKIT_PROJECT_ID=your_minikit_project_id

# Smart Contract
NEXT_PUBLIC_TREASURY_CONTRACT=0x_your_treasury_contract_address

# Server Secrets (NEVER expose to client)
ADMIN_API_KEY=your_admin_api_key
SERVER_HMAC_SECRET=your_hmac_secret
SESSION_SECRET=your_session_secret
```

## Development

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Run development server
npm run dev

# Open http://localhost:5000
```

## Testing

```bash
# Run smoke tests
npm run test:smoke

# Tests include:
# - Health check
# - Event fetching
# - Leaderboard
# - Rate limiting
```

## API Endpoints

### Public Endpoints

- `GET /api/health` - Health check
- `GET /api/event/current` - Get current active event
- `GET /api/leaderboard?eventId=X&address=0x...` - Top 150 + my rank
- `POST /api/run/start` - Start a game run
- `POST /api/run/finish` - Submit score with validation

### Admin Endpoints

- `POST /api/admin/finalize` - Finalize event and generate merkle tree
  - Requires `x-admin-api-key` header
  - Freezes event, computes ranks, generates merkle proofs

### Monitoring

- `GET /api/cron/check-events` - Event rollover status check

## Deployment

### Vercel

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy!

### Environment Variables

Set in Vercel:
- `NEXT_PUBLIC_ENV=production`
- `NEXT_PUBLIC_MINIKIT_PROJECT_ID`
- `NEXT_PUBLIC_TREASURY_CONTRACT`
- `ADMIN_API_KEY`
- `SERVER_HMAC_SECRET`
- `SESSION_SECRET`
- `DATABASE_URL`

## Architecture

### Database Schema

- **events** - 7-day competitive periods
- **users** - Wallet addresses
- **runs** - Individual game attempts
- **leaderboard** - Materialized best scores per user
- **tryCounter** - Tracks attempts (max 3 per event)
- **eventWinners** - Merkle roots and proofs for prize distribution

### Security

- HMAC token validation for run submissions
- Server-side deterministic physics replay
- Rate limiting on all endpoints
- Admin endpoints require API key authentication

### Event Lifecycle

1. Event auto-created (7-day duration)
2. Players compete (max 3 tries each)
3. Event ends → 1-hour frozen cooldown
4. Admin finalizes → Merkle tree generated
5. Winners claim prizes via smart contract
6. New event auto-created after cooldown

## Prize Distribution (Top 10 Only)

| Rank | Prize | % of Pool |
|------|-------|-----------|
| 1st | 625 WLD | 25% |
| 2nd | 500 WLD | 20% |
| 3rd | 375 WLD | 15% |
| 4th | 250 WLD | 10% |
| 5th | 200 WLD | 8% |
| 6th | 175 WLD | 7% |
| 7th | 150 WLD | 6% |
| 8th | 100 WLD | 4% |
| 9th | 75 WLD | 3% |
| 10th | 50 WLD | 2% |

**Total: 2,500 WLD per event**

## License

MIT
