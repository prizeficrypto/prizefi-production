"use client";
import { MiniKit, Tokens, VerificationLevel, tokenToDecimals, type MiniAppWalletAuthSuccessPayload, getIsUserVerified } from "@worldcoin/minikit-js";

export type SessionInfo = { 
  address: string; 
  isVerified: boolean;
  username?: string | null;
  profilePictureUrl?: string | null;
};

export async function startSessionReal(): Promise<SessionInfo> {
  console.log('🔐 Starting two-step authentication - wallet address + verification level');
  console.log('🔧 MiniKit status check:', {
    isInstalled: MiniKit.isInstalled(),
    typeof_MiniKit: typeof MiniKit,
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A'
  });
  
  // Give MiniKit a moment to fully initialize if needed
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const isInstalled = MiniKit.isInstalled();
  console.log('🔍 Final isInstalled check after delay:', isInstalled);
  
  if (!isInstalled) {
    console.log('⚠️ MiniKit not detected');
    
    // Development mode fallback - create a test session for testing outside World App
    const isDev = process.env.NEXT_PUBLIC_ENV === 'development' || process.env.NODE_ENV === 'development';
    if (isDev) {
      console.log('🧪 DEV MODE: Creating test session for development testing');
      return {
        address: '0xDEV_TESTUSER_304_000000000000000000000000',
        isVerified: false,
        username: 'TestUser_304',
        profilePictureUrl: null
      };
    }
    
    console.error('❌ Please open this app through the World App.');
    throw new Error('WORLD_APP_REQUIRED');
  }
  
  try {
    // STEP 1: Get wallet address via walletAuth
    console.log('📱 Step 1: Requesting wallet authentication...');
    
    const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
      nonce: `prizefi-${Date.now()}`,
      expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
      statement: 'Sign in to PrizeFi with your Worldcoin wallet',
      requestId: `prizefi-auth-${Date.now()}`
    });

    console.log('✅ Wallet auth response:', JSON.stringify(finalPayload, null, 2));

    // Handle errors
    if (finalPayload.status === 'error') {
      console.error('❌ Wallet authentication error:', finalPayload.error_code);
      throw new Error('Wallet authentication cancelled or failed');
    }

    // Extract wallet address from MiniAppWalletAuthSuccessPayload
    // Correct structure: { status, message, signature, address, version }
    const rawAddress = finalPayload.address;
    
    if (!rawAddress) {
      console.error('❌ No wallet address in response:', JSON.stringify(finalPayload, null, 2));
      throw new Error("No wallet address returned");
    }
    
    // CRITICAL: Checksum the address immediately to ensure consistency across the entire app
    // Use the checksum utility from lib/chain to avoid dynamic imports
    const { checksum } = await import('@/lib/chain');
    const address = checksum(rawAddress);
    
    console.log('✅ Wallet address obtained and checksummed:', {
      raw: rawAddress,
      checksummed: address
    });

    // STEP 2: Check verification level - database first (fast), on-chain as backup
    console.log('📱 Step 2: Checking Orb verification status...');
    
    let isVerified = false;
    
    // Try database first (much faster than on-chain RPC)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`/api/user/verification?address=${encodeURIComponent(address)}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.found) {
          isVerified = data.isVerified;
          console.log('✅ Verification from database (fast):', { address, isVerified });
        }
      }
    } catch (dbError: any) {
      console.log('⚠️ Database lookup failed, will try on-chain:', dbError.name === 'AbortError' ? 'timeout' : dbError);
    }
    
    // Only check on-chain if user not found in database (new users)
    if (!isVerified) {
      try {
        const verifyPromise = getIsUserVerified(address);
        const timeoutPromise = new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Verification timeout')), 3000)
        );
        const onChainResult = await Promise.race([verifyPromise, timeoutPromise]);
        if (onChainResult) {
          isVerified = true;
          console.log('✅ On-chain verification:', { address, isVerified });
          // Save to database for future fast lookups
          fetch('/api/user/verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, isVerified: true })
          }).catch(() => {});
        }
      } catch (verifyError) {
        console.log('⚠️ On-chain check failed/timed out, using unverified:', verifyError);
      }
    }
    
    console.log('📱 Final verification status:', { 
      address, 
      isVerified,
      entryFee: isVerified ? '0.5 WLD (Orb-verified)' : '1.0 WLD (Device-level)'
    });
    
    // STEP 3: Fetch World App username using MiniKit helper
    console.log('📱 Step 3: Fetching World App username...');
    
    let username: string | null = null;
    let profilePictureUrl: string | null = null;
    
    // Try MiniKit.user first (already populated from wallet auth in some versions)
    try {
      if (MiniKit.user?.username) {
        username = MiniKit.user.username;
        profilePictureUrl = MiniKit.user.profilePictureUrl || null;
        console.log('✅ World App username from MiniKit.user:', username);
      }
    } catch (e) {
      console.log('⚠️ MiniKit.user not available:', e);
    }
    
    // Try getUserByAddress if we don't have username yet (with 3-second timeout)
    if (!username) {
      try {
        console.log('🔍 Calling MiniKit.getUserByAddress for:', address);
        const userPromise = MiniKit.getUserByAddress(address);
        const userTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
        const userInfo = await Promise.race([userPromise, userTimeout]);
        console.log('✅ getUserByAddress response:', JSON.stringify(userInfo, null, 2));
        
        if (userInfo?.username) {
          username = userInfo.username;
          console.log('✅ World App username found:', username);
        }
        if (userInfo?.profilePictureUrl) {
          profilePictureUrl = userInfo.profilePictureUrl;
        }
      } catch (userError: any) {
        console.log('⚠️ getUserByAddress failed:', userError?.message || userError);
      }
    }
    
    // Final fallback: Try server-side lookup via our API (with 3-second timeout)
    if (!username) {
      try {
        console.log('🔍 Trying server-side World username lookup...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`/api/world-username?address=${address}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          if (data.username) {
            username = data.username;
            profilePictureUrl = data.profilePictureUrl || null;
            console.log('✅ World App username from server:', username);
          }
        }
      } catch (serverError: any) {
        if (serverError.name === 'AbortError') {
          console.log('⚠️ Server-side lookup timed out');
        } else {
          console.log('⚠️ Server-side lookup failed:', serverError);
        }
      }
    }
    
    console.log('📱 Final username result:', { username, profilePictureUrl });
    
    return { address, isVerified, username, profilePictureUrl };
    
  } catch (error) {
    console.error('❌ Authentication error:', error);
    throw error;
  }
}

export async function getWalletAddressOnly(): Promise<string> {
  console.log('🔐 Getting wallet address (no verification required)...');
  
  if (!MiniKit.isInstalled()) {
    console.error('❌ MiniKit is not installed!');
    throw new Error('MiniKit is not available. Please open this app in World App.');
  }
  
  try {
    // Get wallet address only
    console.log('📱 Requesting wallet authentication...');
    const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
      nonce: `${Date.now()}`,
      expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
      statement: 'Sign in to PrizeFi Demo'
    });

    console.log('✅ Wallet auth response:', finalPayload);

    if (finalPayload.status === 'error') {
      throw new Error('Wallet authentication failed');
    }

    // Extract address from MiniAppWalletAuthSuccessPayload
    const rawAddress = finalPayload.address;
    if (!rawAddress) {
      console.error('❌ No wallet address in response. Full payload:', JSON.stringify(finalPayload, null, 2));
      throw new Error("No wallet address returned");
    }

    // CRITICAL: Checksum the address immediately to ensure consistency
    const { checksum } = await import('@/lib/chain');
    const address = checksum(rawAddress);
    
    console.log('✅ Wallet address retrieved and checksummed:', {
      raw: rawAddress,
      checksummed: address
    });
    
    return address;
    
  } catch (error) {
    console.error('❌ Authentication error:', error);
    throw error;
  }
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  reference?: string;
  error?: string;
}

export async function payEntry(amount: string, treasuryAddress: string, serverReference?: string): Promise<PaymentResult> {
  console.log('💳 payEntry called with amount:', amount, 'WLD, reference:', serverReference);
  
  const humanAmount = parseFloat(amount);
  
  if (!treasuryAddress) {
    console.error('❌ Treasury address not provided!');
    return { success: false, error: 'Treasury contract address not provided' };
  }

  if (isNaN(humanAmount) || humanAmount <= 0) {
    console.error('❌ Invalid amount:', amount);
    return { success: false, error: 'Invalid payment amount' };
  }

  // Validate and checksum the address
  let validatedAddress: string;
  try {
    const { getAddress } = await import('ethers');
    validatedAddress = getAddress(treasuryAddress);
    console.log('✅ Treasury address validated:', validatedAddress);
  } catch (err) {
    console.error('❌ Invalid treasury address:', treasuryAddress);
    return { success: false, error: 'Invalid treasury contract address' };
  }
  
  // Convert to smallest unit (WLD has 18 decimals)
  const tokenAmount = tokenToDecimals(humanAmount, Tokens.WLD).toString();
  
  // Use server-provided reference (intent ID) if available, otherwise generate one
  // MiniKit requires reference to be a UUID without dashes
  const reference = serverReference || crypto.randomUUID().replace(/-/g, '');
  
  console.log('💳 Payment details:', { 
    humanAmount,
    tokenAmount,
    treasuryAddress: validatedAddress,
    reference
  });

  if (!MiniKit.isInstalled()) {
    console.error('❌ MiniKit not installed!');
    return { success: false, error: 'Please open this app in World App to make payments' };
  }

  console.log('📱 Calling MiniKit.commandsAsync.pay...');
  
  try {
    const paymentRequest = {
      reference,
      to: validatedAddress,
      tokens: [{
        symbol: Tokens.WLD,
        token_amount: tokenAmount
      }],
      description: `PrizeFi Entry Fee (${humanAmount} WLD)`
    };
    
    console.log('💳 Payment request:', JSON.stringify(paymentRequest, null, 2));
    
    // 30-second timeout - if World App doesn't respond, user can retry
    const PAYMENT_TIMEOUT_MS = 30000;
    const paymentPromise = MiniKit.commandsAsync.pay(paymentRequest);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('PAYMENT_TIMEOUT')), PAYMENT_TIMEOUT_MS)
    );
    
    const { finalPayload } = await Promise.race([paymentPromise, timeoutPromise]);

    console.log('💳 Full payment response:', JSON.stringify(finalPayload, null, 2));

    const status = (finalPayload as any).status;
    
    if (status === 'success') {
      const transactionId = (finalPayload as any).transaction_id || (finalPayload as any).transaction_hash;
      console.log('✅ Payment successful!', { transaction_id: transactionId });
      return { 
        success: true, 
        transactionId,
        reference: (finalPayload as any).reference || reference
      };
    } 
    
    // Handle add_funds - user clicked "add funds" instead of paying
    if (status === 'add_funds') {
      console.log('⚠️ User clicked add funds - no payment made');
      return { success: false, error: 'Please add WLD to your wallet first, then try again.' };
    }
    
    // Payment failed or was cancelled
    console.log('❌ Payment not completed:', status);
    const errorCode = (finalPayload as any).error_code;
    
    if (errorCode === 'user_cancelled') {
      return { success: false, error: 'Payment was cancelled' };
    } else if (errorCode === 'insufficient_funds') {
      return { success: false, error: 'Insufficient WLD balance' };
    } else {
      return { success: false, error: 'Payment was not completed' };
    }
  } catch (error) {
    console.error('💥 Payment exception:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle timeout specifically
    if (errorMessage === 'PAYMENT_TIMEOUT') {
      return { 
        success: false, 
        error: 'Payment took too long. If WLD was deducted, please tap "Retry" to complete your purchase.' 
      };
    }
    
    return { success: false, error: errorMessage };
  }
}

export function shortenAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function isWorldAppMiniApp(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Multi-signal World App detection (MiniKit attaches after initial render)
  
  // Signal 1: Check if MiniKit is installed (most reliable after bridge loads)
  const miniKitInstalled = MiniKit.isInstalled();
  
  // Signal 2: Check user-agent for World App indicators
  const userAgent = window.navigator.userAgent.toLowerCase();
  const hasWorldAppUA = userAgent.includes('worldapp') || userAgent.includes('minikit');
  
  // Signal 3: Check if MiniKit object exists on window
  const hasMiniKitObject = typeof (window as any).MiniKit !== 'undefined';
  
  const isWorldApp = miniKitInstalled || hasWorldAppUA || hasMiniKitObject;
  
  console.log('🔍 World App Detection:', {
    userAgent: window.navigator.userAgent,
    miniKitInstalled,
    hasWorldAppUA,
    hasMiniKitObject,
    RESULT: isWorldApp
  });
  
  return isWorldApp;
}

export interface WalletVerificationResult {
  success: boolean;
  address?: string;
  nonce?: string;
  payload?: any;
  error?: string;
}

export async function verifyWalletOwnership(statement: string = 'Verify wallet ownership'): Promise<WalletVerificationResult> {
  console.log('🔐 Starting wallet ownership verification...');
  
  if (!MiniKit.isInstalled()) {
    console.error('❌ MiniKit not installed');
    return { 
      success: false, 
      error: 'Please open this app in World App to verify your wallet.' 
    };
  }

  try {
    const nonceRes = await fetch('/api/auth/nonce');
    if (!nonceRes.ok) {
      throw new Error('Failed to get verification nonce');
    }
    const { nonce } = await nonceRes.json();
    console.log('✅ Got nonce for verification');

    console.log('📱 Requesting wallet signature...');
    const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
      nonce: nonce,
      expirationTime: new Date(Date.now() + 5 * 60 * 1000),
      notBefore: new Date(Date.now() - 60 * 1000),
      statement: statement,
      requestId: `verify-${Date.now()}`
    });

    console.log('✅ Wallet auth response:', JSON.stringify(finalPayload, null, 2));

    if (finalPayload.status === 'error') {
      console.error('❌ Wallet auth error:', finalPayload.error_code);
      return { 
        success: false, 
        error: 'Wallet verification was cancelled or failed.' 
      };
    }

    const address = finalPayload.address?.toLowerCase();
    if (!address) {
      return { 
        success: false, 
        error: 'No wallet address returned.' 
      };
    }

    console.log('✅ Wallet ownership verified for:', address);
    return {
      success: true,
      address: address,
      nonce: nonce,
      payload: finalPayload
    };

  } catch (error: any) {
    console.error('❌ Wallet verification error:', error);
    return { 
      success: false, 
      error: error.message || 'Wallet verification failed.' 
    };
  }
}
