// Generate unique player ID for demo mode
// Each browser/device gets a unique ID stored in localStorage
// When wallet is connected, we store the wallet address for consistent identification

function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export function getDemoPlayerId(walletAddress?: string): string {
  if (typeof window === 'undefined') {
    return 'demo-player'
  }

  // If wallet address is provided, use it as the player ID for consistency
  // Normalize to lowercase for case-insensitive matching
  if (walletAddress && walletAddress.startsWith('0x')) {
    return walletAddress.toLowerCase()
  }

  const STORAGE_KEY = 'prizefi_demo_player_id'
  
  // Check if we already have an ID
  let playerId = localStorage.getItem(STORAGE_KEY)
  
  if (!playerId) {
    // Generate a new unique ID
    playerId = `demo-${generateRandomId()}`
    localStorage.setItem(STORAGE_KEY, playerId)
  }
  
  return playerId
}

export function formatDemoPlayerName(playerId: string, walletAddress?: string): string {
  // If user has a wallet address, always use that for consistency
  // Normalize to lowercase for case-insensitive matching
  if (walletAddress && walletAddress.startsWith('0x')) {
    return walletAddress.toLowerCase()
  }
  
  // Otherwise, use the demo player ID
  return playerId
}
