'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import TopBar from './components/TopBar'
import BottomNav from './components/BottomNav'
import HowToPlay from './components/HowToPlay'
import StatusBadge from './components/StatusBadge'
import EventCountdown from './components/EventCountdown'
import GameTutorial, { useGameTutorial } from './components/GameTutorial'
import WelcomeSetup, { useWelcomeSetup } from './components/WelcomeSetup'
import ConfirmationScreen from './components/ConfirmationScreen'
import RoundTransition from './components/RoundTransition'
import MatchComplete from './components/MatchComplete'
import RulesScreen from './components/RulesScreen'
import Quests from './components/Quests'
import { useSession } from './contexts/SessionContext'
import { useLanguage } from './contexts/LanguageContext'
import { useGame } from './contexts/GameContext'
import { startSessionReal, getWalletAddressOnly, shortenAddress, payEntry, isWorldAppMiniApp } from './lib/minikit'
import { generateCryptoSeed } from '../lib/cryptoSeed'
import styles from './page.module.css'

// ⚠️ TESTING BYPASS MODE - SET TO false FOR PRODUCTION ⚠️
const TEST_MODE = false

const PrecisionTapGame = dynamic(() => import('./components/PrecisionTapGame'), { ssr: false })
const GameResult = dynamic(() => import('./components/GameResult'), { ssr: false })
const DemoResult = dynamic(() => import('./components/DemoResult'), { ssr: false })

export default function Home() {
  const router = useRouter()
  const { session, setSession } = useSession()
  const { t } = useLanguage()
  const { gameState, setGameState, setCurrentScore, setCurrentSeed, match, startMatch, recordRoundScore, nextRound, endMatch, resetMatch, getFinalScore } = useGame()
  const { needsSetup, markComplete: markSetupComplete } = useWelcomeSetup()
  const { needsTutorial, markComplete: markTutorialComplete } = useGameTutorial()
  const [connecting, setConnecting] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [startingGame, setStartingGame] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameScore, setGameScore] = useState(0)
  const [gameSeed, setGameSeed] = useState('')
  const [gameTaps, setGameTaps] = useState<number[]>([])
  const [gameInputLog, setGameInputLog] = useState<any[]>([])
  const [gameStartToken, setGameStartToken] = useState('')
  const [gameStartedAt, setGameStartedAt] = useState(0)
  const [gameEventId, setGameEventId] = useState<number | null>(null)
  const [eventData, setEventData] = useState<any>(null)
  const [eventStatusLoaded, setEventStatusLoaded] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [eventCredits, setEventCredits] = useState(0)
  const [creditUsed, setCreditUsed] = useState(false)
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [totalPurchased, setTotalPurchased] = useState(0)
  const [canBuyMore, setCanBuyMore] = useState(true)
  const [maxTries, setMaxTries] = useState(1) // 1 entry per event
  const [prizePool, setPrizePool] = useState<number>(100)
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [pendingPayment, setPendingPayment] = useState<{intentId: string, transactionId: string, reference?: string, timestamp?: number} | null>(null)
  const [retryingConfirmation, setRetryingConfirmation] = useState(false)
  const [showUpdateBanner, setShowUpdateBanner] = useState(false) // Will check localStorage
  const [activeDiscount, setActiveDiscount] = useState<{ id: number; percent: number } | null>(null)
  const [vouchers, setVouchers] = useState<{ id: number; type: string; percent: number; expiresAt: string | null }[]>([])
  const [showVoucherPicker, setShowVoucherPicker] = useState(false)
  const [questRefreshKey, setQuestRefreshKey] = useState(0)

  // Check localStorage for banner dismissal state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissedVersion = localStorage.getItem('prizefi_banner_dismissed')
    // Version key - change this to show a new banner in the future
    const currentBannerVersion = 'quest_fix_notice_v2'
    if (dismissedVersion !== currentBannerVersion) {
      setShowUpdateBanner(true)
    }
  }, [])

  // Fix: Reset gameState to 'idle' if we're in 'finished' state but missing essential data
  // This happens when user navigates away and comes back - context persists but local state resets
  useEffect(() => {
    if (gameState === 'finished' && !isDemo && (!gameEventId || !gameStartToken || !gameStartedAt)) {
      console.log('🔄 Resetting game state: finished state with missing data detected')
      setGameState('idle')
    }
  }, [gameState, isDemo, gameEventId, gameStartToken, gameStartedAt, setGameState])

  // Check for reset parameter to preview tutorial again
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === 'tutorial') {
      localStorage.removeItem('prizefi_setup_complete_v3')
      localStorage.removeItem('prizefi_game_tutorial_v8')
      window.location.href = '/'
    }
  }, [])

  // Check for pending payment that needs confirmation retry
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem('prizefi_pending_payment')
      if (stored) {
        const pending = JSON.parse(stored)
        // Only restore if it's less than 10 minutes old
        if (pending.timestamp && Date.now() - pending.timestamp < 10 * 60 * 1000) {
          console.log('📋 Found pending payment to confirm:', pending)
          setPendingPayment(pending)
        } else {
          // Clear old pending payments
          localStorage.removeItem('prizefi_pending_payment')
        }
      }
    } catch (e) {
      console.error('Error loading pending payment:', e)
      localStorage.removeItem('prizefi_pending_payment')
    }
  }, [])

  useEffect(() => {
    const fetchPrizePool = async () => {
      try {
        const response = await fetch('/api/config')
        if (response.ok) {
          const data = await response.json()
          if (data.prizePoolWld) {
            setPrizePool(data.prizePoolWld)
          }
        }
      } catch (error) {
        console.error('Error fetching config:', error)
      }
    }
    fetchPrizePool()
  }, [])

  // Warmup database on mount and fetch event data
  useEffect(() => {
    // Pre-warm database connection in parallel with event fetch
    fetch('/api/warmup').catch(() => {})
    fetchEventData()
    
    // Keep database warm with periodic pings (every 30 seconds)
    const warmupInterval = setInterval(() => {
      fetch('/api/warmup').catch(() => {})
    }, 30000)
    
    return () => clearInterval(warmupInterval)
  }, [])

  // Refetch with user data when session changes
  useEffect(() => {
    console.log('📍 Session changed:', {
      hasSession: !!session,
      address: session?.address,
      isVerified: session?.isVerified
    })
    if (session?.address) {
      console.log('📍 Refetching event data with address:', session.address)
      setEventStatusLoaded(false)
      // Pass the address directly to avoid closure issues
      fetchEventDataWithAddress(session.address)
      fetchUsername()
    }
  }, [session?.address])

  // Debug: Log button visibility conditions when they change
  useEffect(() => {
    if (session?.address) {
      console.log('🔍 Button conditions:', {
        hasSession: !!session,
        eventStatusLoaded,
        eventStatus: eventData?.status,
        attemptsUsed,
        totalPurchased,
        maxTries,
        canBuyMore,
        showJoin: eventStatusLoaded && eventData?.status !== 'ended' && totalPurchased === 0 && canBuyMore,
        showPlay: eventStatusLoaded && eventData?.status !== 'ended' && totalPurchased > 0 && attemptsUsed < totalPurchased
      })
    }
  }, [session, eventStatusLoaded, eventData, attemptsUsed, totalPurchased, maxTries, canBuyMore])

  // Auto-clear payment errors when user actually has entry
  // This handles the case where payment verification failed but credit was granted
  useEffect(() => {
    if (totalPurchased > 0) {
      if (error && (error.includes('verify') || error.includes('payment') || error.includes('transaction'))) {
        console.log('✅ Clearing payment error - user has entry:', { totalPurchased })
        setError(null)
        setPurchasing(false)
      }
    }
  }, [totalPurchased, error])

  const fetchUsername = async () => {
    if (!session?.address) return
    
    // Use World App username from MiniKit
    if (session.username) {
      console.log('✅ Using World App username:', session.username)
      setUsername(session.username)
      
      // Store the World App username in our database
      try {
        await fetch('/api/profile/username', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-wallet': session.address
          },
          body: JSON.stringify({
            walletAddress: session.address,
            username: session.username
          })
        })
        console.log('✅ World App username stored in database')
      } catch (err) {
        console.log('⚠️ Could not store username:', err)
      }
      return
    }
    
    // Fallback: fetch World username from API
    try {
      const response = await fetch(`/api/world-username?address=${session.address}`)
      if (response.ok) {
        const data = await response.json()
        if (data.username) {
          setUsername(data.username)
          // Also store it in database
          await fetch('/api/profile/username', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-wallet': session.address
            },
            body: JSON.stringify({
              walletAddress: session.address,
              username: data.username
            })
          })
        }
      }
    } catch (error) {
      console.error('Error fetching World username:', error)
    }
  }

  const fetchEventDataWithAddress = async (address?: string) => {
    try {
      const url = address 
        ? `/api/event/current?address=${address}`
        : '/api/event/current'
      console.log('📡 Fetching event data:', { url, address: address || 'anonymous' })
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      let response: Response
      try {
        response = await fetch(url, { signal: controller.signal })
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          console.error('❌ Event fetch timed out')
          setEventStatusLoaded(true)
          return
        }
        throw fetchError
      }
      clearTimeout(timeoutId)
      if (response.ok) {
        const data = await response.json()
        console.log('📊 Event data received:', {
          eventId: data.eventId,
          status: data.status,
          cooldown: data.cooldown,
          credits: data.credits,
          used: data.used,
          triesRemaining: data.triesRemaining,
          attemptsUsed: data.attemptsUsed,
          totalPurchased: data.totalPurchased,
          canBuyMore: data.canBuyMore,
          maxTries: data.maxTries,
          queriedAddress: address || 'anonymous'
        })
        
        setEventData(data)
        
        // Update prize pool from event data
        if (data.prizePool) {
          setPrizePool(data.prizePool)
        }
        
        // Update credit and attempt states
        setEventCredits(data.credits || 0)
        setCreditUsed(data.used || false)
        setAttemptsUsed(data.attemptsUsed || 0)
        setTotalPurchased(data.totalPurchased || 0)
        setCanBuyMore(data.canBuyMore ?? true)
        if (data.maxTries) setMaxTries(data.maxTries)
        setEventStatusLoaded(true)
        
        console.log('✅ Credit state updated:', {
          eventCredits: data.credits || 0,
          attemptsUsed: data.attemptsUsed || 0,
          totalPurchased: data.totalPurchased || 0,
          canBuyMore: data.canBuyMore,
          maxTries: data.maxTries,
          sessionAddress: address || 'anonymous'
        })
      }
    } catch (error) {
      console.error('Error fetching event data:', error)
      setEventStatusLoaded(true)
    }
  }

  const fetchEventData = async () => {
    await fetchEventDataWithAddress(session?.address)
  }

  const fetchActiveDiscount = async () => {
    if (!session?.address) {
      setActiveDiscount(null)
      setVouchers([])
      return
    }
    try {
      const response = await fetch(`/api/rewards?address=${encodeURIComponent(session.address)}`)
      if (response.ok) {
        const data = await response.json()
        const allVouchers = (data.rewards || []).map((r: any) => ({
          id: r.id,
          type: r.type,
          percent: r.type === 'free_play' ? 100 : (r.discountPercent || 0),
          expiresAt: r.expiresAt
        }))
        setVouchers(allVouchers)
      }
    } catch (err) {
      console.error('Error fetching discount:', err)
    }
  }

  useEffect(() => {
    fetchActiveDiscount()
  }, [session?.address])

  const handleConnect = async () => {
    console.log('🔐 handleConnect: Button clicked');
    console.log('🔐 Current state before connect:', {
      hasSession: !!session,
      sessionAddress: session?.address
    });
    
    if (!process.env.NEXT_PUBLIC_MINIKIT_PROJECT_ID) {
      console.error('❌ Missing MINIKIT_PROJECT_ID');
      setError(t('missingProjectId'))
      return
    }

    console.log('🔐 Starting full authentication (wallet + verification)...');
    setConnecting(true)
    setError(null)
    
    try {
      const sessionData = await startSessionReal()
      console.log('✅ Session data received:', sessionData);
      console.log('✅ Setting session with address:', sessionData.address);
      console.log('✅ Verification status:', sessionData.isVerified);
      setSession(sessionData)
      console.log('✅ Session state updated successfully - useEffect should trigger now');
      
      // Force an immediate re-fetch to ensure button appears
      console.log('🔄 Forcing immediate event data fetch...');
      setEventStatusLoaded(false)
      await fetchEventDataWithAddress(sessionData.address)
      console.log('✅ Immediate event data fetch complete');
    } catch (err) {
      console.error('❌ Connection error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      // Don't show error for user cancellation
      if (errorMsg.toLowerCase().includes('cancel')) {
        console.log('User cancelled authentication');
      } else {
        // Show the actual error message to help debugging
        setError(errorMsg);
      }
    } finally {
      setConnecting(false)
    }
  }

  const handleShowPaymentConfirm = () => {
    if (!session?.address) {
      setError(t('connectionError'))
      return
    }
    if (!eventData?.eventId) {
      if (eventData?.cooldown) {
        setError('No active competition right now. The next round will start soon!')
      } else if (eventData?.frozen) {
        setError('This round has ended. Please wait for the next round.')
      } else {
        setError('Loading event data... Please try again in a moment.')
        fetchEventData()
      }
      return
    }
    if (attemptsUsed >= maxTries) {
      setError(t('alreadyCompeted'))
      return
    }
    if (!canBuyMore) {
      setError(t('alreadyCompeted'))
      return
    }
    if (eventCredits > 0) {
      setError(t('alreadyHavePaidPlay'))
      return
    }
    setShowPaymentConfirm(true)
  }

  const handleSelectVoucher = (voucher: { id: number; type: string; percent: number }) => {
    if (voucher.type === 'free_play') {
      setActiveDiscount({ id: voucher.id, percent: 100 })
    } else {
      setActiveDiscount({ id: voucher.id, percent: voucher.percent })
    }
    setShowVoucherPicker(false)
  }

  const handleRemoveVoucher = () => {
    setActiveDiscount(null)
  }

  const handleBuyEntry = async () => {
    console.log('💰 Buy Entry clicked');
    setShowPaymentConfirm(false)
    
    if (!session?.address) {
      setError(t('connectionError'))
      return
    }

    if (!eventData?.eventId) {
      setError('No active event')
      return
    }
    
    if (attemptsUsed >= maxTries) {
      setError(t('alreadyCompeted'))
      return
    }
    if (!canBuyMore) {
      setError(t('alreadyCompeted'))
      return
    }
    if (eventCredits > 0) {
      setError(t('alreadyHavePaidPlay'))
      return
    }

    const currentDiscount = activeDiscount ? { ...activeDiscount } : null

    if (currentDiscount && currentDiscount.percent === 100) {
      setPurchasing(true)
      setError(null)
      try {
        const response = await fetch('/api/rewards/use-free-play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-wallet': session.address },
          body: JSON.stringify({ rewardId: currentDiscount.id })
        })
        if (response.ok) {
          const data = await response.json()
          setActiveDiscount(null)
          const targetEventId = data.eventId || eventData.eventId
          startMatch(targetEventId, `freeplay-${Date.now()}`)
          setGameEventId(targetEventId)
          setGameState('confirmation')
          fetchActiveDiscount()
          fetchEventData()
        } else {
          const errData = await response.json()
          setError(errData.error || 'Failed to use free play voucher')
          fetchActiveDiscount()
        }
      } catch (err) {
        console.error('Free play voucher error:', err)
        setError('Failed to use free play voucher. Please try again.')
      } finally {
        setPurchasing(false)
      }
      return
    }

    const treasury = process.env.NEXT_PUBLIC_TREASURY_CONTRACT
    
    console.log('💰 Starting payment flow (trusting MiniKit)');
    setPurchasing(true)
    setError(null)
    
    let baseAmount = session.isVerified ? 0.5 : 1
    if (currentDiscount) {
      baseAmount = baseAmount * (1 - currentDiscount.percent / 100)
    }
    const amount = baseAmount.toFixed(2)
    
    const pendingTx = {
      intentId: '',
      transactionId: '',
      eventId: eventData.eventId,
      timestamp: Date.now(),
      amount
    }
    localStorage.setItem('prizefi_pending_payment', JSON.stringify(pendingTx))
    setPendingPayment(pendingTx)

    try {
      console.log('💳 Starting MiniKit payment:', { amount, eventId: eventData.eventId });
      const paymentResult = await payEntry(amount, treasury!, `prizefi-${Date.now()}`)
      console.log('💳 Payment result:', paymentResult);
      
      if (!paymentResult.success) {
        console.log('❌ Payment cancelled or failed:', paymentResult.error);
        localStorage.removeItem('prizefi_pending_payment')
        setPendingPayment(null)
        setError(paymentResult.error || t('purchaseFailed'))
        return
      }

      if (!paymentResult.transactionId) {
        console.log('❌ No transaction ID received');
        localStorage.removeItem('prizefi_pending_payment')
        setPendingPayment(null)
        setError('Payment failed - no transaction ID. Please try again.')
        return
      }

      console.log('✅ MiniKit payment successful, txId:', paymentResult.transactionId);
      
      if (currentDiscount) {
        try {
          const markRes = await fetch('/api/rewards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-wallet': session.address },
            body: JSON.stringify({ address: session.address, rewardId: currentDiscount.id })
          })
          if (markRes.ok) {
            setActiveDiscount(null)
            fetchActiveDiscount()
          } else {
            console.error('Failed to mark discount as used, response:', await markRes.text())
          }
        } catch (err) {
          console.error('Failed to mark discount as used:', err)
        }
      }
      
      startMatch(eventData.eventId, paymentResult.transactionId)
      setGameEventId(eventData.eventId)
      setGameState('confirmation')
      setError(null)
      
      pendingTx.transactionId = paymentResult.transactionId
      localStorage.setItem('prizefi_pending_payment', JSON.stringify(pendingTx))
      
      // Background: Register with server (auto-retry up to 5 times)
      // User already sees success - this is just syncing our database
      const registerWithServer = async (attempt: number = 1): Promise<void> => {
        const maxAttempts = 5
        console.log(`📡 Background sync attempt ${attempt}/${maxAttempts}...`);
        
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)
          
          const response = await fetch('/api/payment/simple', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-wallet': session.address
            },
            body: JSON.stringify({
              eventId: eventData.eventId,
              transactionId: paymentResult.transactionId
            }),
            signal: controller.signal
          })
          clearTimeout(timeoutId)

          if (response.ok || (await response.json().catch(() => ({}))).error === 'tx_used') {
            // Success or already registered
            console.log('✅ Background sync complete!')
            localStorage.removeItem('prizefi_pending_payment')
            setPendingPayment(null)
            await fetchEventData()
            return
          }
          
          // Server error - retry
          if (attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000) // 1s, 2s, 4s, 8s, 8s
            console.log(`⏳ Retry in ${delay}ms...`)
            setTimeout(() => registerWithServer(attempt + 1), delay)
          } else {
            console.error('❌ Background sync failed after 5 attempts - will retry on next page load')
          }
          
        } catch (fetchError: any) {
          console.error('❌ Background sync error:', fetchError.name);
          if (attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
            console.log(`⏳ Retry in ${delay}ms...`)
            setTimeout(() => registerWithServer(attempt + 1), delay)
          } else {
            console.error('❌ Background sync failed after 5 attempts - will retry on next page load')
          }
        }
      }
      
      // Start background sync (don't await - user already sees success)
      registerWithServer()
      
    } catch (err) {
      console.error('💥 Payment error:', err);
      // This only triggers if MiniKit itself threw an error (rare)
      // If MiniKit returned success, user already sees confirmation screen
      setError('Something went wrong. Please try again.')
      localStorage.removeItem('prizefi_pending_payment')
      setPendingPayment(null)
    } finally {
      // ALWAYS stop the loading state
      setPurchasing(false)
    }
  }

  // Retry confirmation for pending payments (user already paid but confirmation failed)
  const handleRetryConfirmation = async () => {
    if (!pendingPayment || !session?.address) {
      console.error('No pending payment or session')
      return
    }

    console.log('🔄 Retrying confirmation for pending payment:', pendingPayment)
    setRetryingConfirmation(true)
    setError(null)

    try {
      // First, refetch event data to check if credits were already granted
      const eventResponse = await fetch(`/api/event/current?address=${session.address}`)
      if (eventResponse.ok) {
        const eventCheck = await eventResponse.json()
        if (eventCheck.credits > 0 || eventCheck.totalPurchased > 0) {
          console.log('✅ Credits already exist - clearing pending payment')
          localStorage.removeItem('prizefi_pending_payment')
          setPendingPayment(null)
          setEventCredits(eventCheck.credits || 0)
          setTotalPurchased(eventCheck.totalPurchased || 0)
          setError(null)
          setRetryingConfirmation(false)
          return
        }
      }

      // Always use simple route - trust MiniKit, no blockchain verification needed
      const confirmResponse = await fetch('/api/payment/simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet': session.address
        },
        body: JSON.stringify({
          eventId: (pendingPayment as any).eventId || eventData?.eventId,
          transactionId: pendingPayment.transactionId
        })
      })

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json()
        console.error('❌ Retry confirmation failed:', errorData)
        
        // Check if this is a terminal error (intent already confirmed, failed, or expired)
        const terminalErrors = ['intent_not_found', 'intent_failed', 'intent_expired', 'tx_already_used']
        if (terminalErrors.includes(errorData.error)) {
          // Clear the pending payment - it's no longer valid
          localStorage.removeItem('prizefi_pending_payment')
          setPendingPayment(null)
          setError('This payment has expired or was already processed. Please try purchasing again.')
        } else if (errorData.message?.includes('already granted') || errorData.success) {
          // Credit was already granted - clear pending and refresh
          localStorage.removeItem('prizefi_pending_payment')
          setPendingPayment(null)
          setError(null)
          await fetchEventData()
        } else {
          setError(errorData.message || 'Confirmation failed. Please try again.')
        }
        setRetryingConfirmation(false)
        await fetchEventData()
        return
      }

      const confirmData = await confirmResponse.json()
      console.log('✅ Retry confirmation succeeded:', confirmData)

      // Clear pending payment
      localStorage.removeItem('prizefi_pending_payment')
      setPendingPayment(null)

      // Start match
      if (eventData?.eventId) {
        startMatch(eventData.eventId, confirmData.matchToken || pendingPayment.intentId)
        setGameEventId(eventData.eventId)
      }
      await fetchEventData()
      setError(null)
      setRetryingConfirmation(false)
      setGameState('confirmation')
    } catch (err) {
      console.error('💥 Retry confirmation error:', err)
      setError('Network error. Please try again.')
      setRetryingConfirmation(false)
      await fetchEventData()
    }
  }

  // Clear pending payment if user already has entry (payment was confirmed elsewhere)
  useEffect(() => {
    if (pendingPayment && totalPurchased > 0) {
      console.log('✅ Clearing pending payment - user already has entry')
      localStorage.removeItem('prizefi_pending_payment')
      setPendingPayment(null)
    }
  }, [pendingPayment, totalPurchased])

  // AUTO-RETRY: Automatically confirm pending payments on page load
  // Fully automatic - user never needs to tap anything
  const [autoRetryAttempted, setAutoRetryAttempted] = useState(false)
  useEffect(() => {
    if (autoRetryAttempted) return
    if (!pendingPayment?.transactionId) return
    if (!session?.address) return
    if (totalPurchased > 0) return // Already has credits
    
    console.log('🔄 AUTO-RECOVERY: Starting automatic payment recovery...')
    setAutoRetryAttempted(true)
    setRetryingConfirmation(true)
    
    // Silent background recovery with multiple retries
    const recoverPayment = async (attempt: number = 1): Promise<void> => {
      const maxAttempts = 5
      console.log(`📡 Auto-recovery attempt ${attempt}/${maxAttempts}...`);
      
      try {
        // First check if credits already exist
        const eventResponse = await fetch(`/api/event/current?address=${session.address}`)
        if (eventResponse.ok) {
          const eventCheck = await eventResponse.json()
          if (eventCheck.credits > 0 || eventCheck.totalPurchased > 0) {
            console.log('✅ Credits already exist - payment was already recovered')
            localStorage.removeItem('prizefi_pending_payment')
            setPendingPayment(null)
            setEventCredits(eventCheck.credits || 0)
            setTotalPurchased(eventCheck.totalPurchased || 0)
            setRetryingConfirmation(false)
            return
          }
        }
        
        // Try to confirm with server
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)
        
        const response = await fetch('/api/payment/simple', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet': session.address
          },
          body: JSON.stringify({
            eventId: (pendingPayment as any).eventId || eventData?.eventId,
            transactionId: pendingPayment.transactionId
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        
        if (response.ok) {
          console.log('✅ Auto-recovery successful!')
          localStorage.removeItem('prizefi_pending_payment')
          setPendingPayment(null)
          await fetchEventData()
          setRetryingConfirmation(false)
          return
        }
        
        const errorData = await response.json().catch(() => ({}))
        
        // Check if already confirmed or terminal error
        if (errorData.error === 'tx_used' || errorData.message?.includes('already')) {
          console.log('✅ Payment was already confirmed')
          localStorage.removeItem('prizefi_pending_payment')
          setPendingPayment(null)
          await fetchEventData()
          setRetryingConfirmation(false)
          return
        }
        
        // Terminal errors - payment can't be recovered
        if (['intent_not_found', 'intent_failed', 'intent_expired'].includes(errorData.error)) {
          console.log('❌ Terminal error - clearing invalid pending payment')
          localStorage.removeItem('prizefi_pending_payment')
          setPendingPayment(null)
          setRetryingConfirmation(false)
          return
        }
        
        // Retry if we haven't exhausted attempts
        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
          console.log(`⏳ Retry in ${delay}ms...`)
          setTimeout(() => recoverPayment(attempt + 1), delay)
        } else {
          console.error('❌ Auto-recovery failed after 5 attempts')
          setRetryingConfirmation(false)
        }
        
      } catch (err: any) {
        console.error('❌ Auto-recovery error:', err.name || err);
        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
          setTimeout(() => recoverPayment(attempt + 1), delay)
        } else {
          setRetryingConfirmation(false)
        }
      }
    }
    
    // Start recovery after small delay
    const timer = setTimeout(() => recoverPayment(), 500)
    return () => clearTimeout(timer)
  }, [pendingPayment, session?.address, totalPurchased, autoRetryAttempted])

  const handlePlayGame = async () => {
    console.log('🎮 [STEP 1] Play button clicked')
    
    // Prevent double-clicking
    if (startingGame) {
      console.log('⏳ Already starting game, ignoring click')
      return
    }

    // ⚠️ TESTING BYPASS - Start COMPETITION game without authentication
    if (TEST_MODE) {
      console.log('✅ TEST MODE - Starting COMPETITION game')
      alert('TEST MODE: Starting COMPETITION game!')
      
      // Create test session with VALID Ethereum address format (40 hex chars)
      const testSession = session || {
        address: '0x' + Date.now().toString(16).padStart(40, '0'),
        isVerified: true
      }
      
      if (!session) {
        setSession(testSession)
      }
      
      // Fetch current event
      try {
        const eventResponse = await fetch('/api/event/current?address=' + testSession.address)
        let testEventData
        
        if (eventResponse.ok) {
          testEventData = await eventResponse.json()
        } else {
          alert('No active event found. Please create an event first.')
          return
        }
        
        const seed = generateCryptoSeed()
        const startedAt = Date.now()
        const currentEventId = testEventData.eventId
        
        console.log('📞 Calling /api/run/start to get valid token...')
        
        // ACTUALLY call /api/run/start to get a valid token
        const startResponse = await fetch('/api/run/start', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-world-app': 'false',
            'x-wallet': testSession.address
          },
          body: JSON.stringify({
            eventId: currentEventId,
            address: testSession.address,
            seed,
            startedAt,
          }),
        })

        if (!startResponse.ok) {
          const errorData = await startResponse.json()
          console.error('❌ Failed to start test game:', errorData)
          alert('Error starting test game: ' + (errorData.error || 'Unknown error'))
          return
        }

        const { startToken } = await startResponse.json()
        console.log('✅ Got valid start token for TEST mode')
        
        // Start the game with REAL token
        setGameSeed(seed)
        setCurrentSeed(seed)
        setGameStartToken(startToken)
        setGameStartedAt(startedAt)
        setGameEventId(currentEventId)
        setIsDemo(false) // COMPETITION MODE
        console.log('🎮 [FINAL] Setting gameState to "playing"')
        setGameState('playing')
        
        console.log('✅ TEST: Competition game started with real token')
      } catch (err) {
        console.error('TEST MODE ERROR:', err)
        alert('Error in test mode: ' + err)
      }
      return
    }
    
    console.log('🎮 [STEP 2] Validating prerequisites')
    
    // Validate BEFORE setting loading state
    setError(null)

    // Mobile-only check - If user has session, they MUST be in World App (session = proof of MiniKit auth)
    const isInWorldApp = isWorldAppMiniApp() || (session && session.address);
    if (!TEST_MODE && !isInWorldApp) {
      console.error('❌ Validation failed: Not running in World App')
      setError('Please open this app in World App on your mobile device to play.')
      return
    }

    if (eventData && eventData.triesRemaining <= 0) {
      console.error('❌ Validation failed: No matches remaining')
      setError(t('alreadyCompeted'))
      return
    }

    if (!session?.address) {
      console.error('❌ Validation failed: Missing session')
      setError(t('connectionError'))
      return
    }

    if (!eventData?.eventId) {
      console.error('❌ Validation failed: Missing event data')
      if (eventData?.cooldown) {
        setError('No active competition right now. The next round will start soon!')
      } else if (eventData?.frozen) {
        setError('This round has ended. Please wait for the next round.')
      } else {
        setError('Loading event data... Please try again in a moment.')
        fetchEventData()
      }
      return
    }

    if (totalPurchased === 0 || attemptsUsed >= totalPurchased) {
      console.error('❌ Validation failed: No entry available')
      if (attemptsUsed >= maxTries) {
        setError(t('alreadyCompeted'))
      } else {
        setError(t('joinCompetitionToPlay'))
      }
      return
    }

    console.log('🎮 [STEP 3] All validations passed - setting loading state')
    
    // All checks passed - NOW set loading state
    setStartingGame(true)

    const seed = generateCryptoSeed()
    const startedAt = Date.now()
    const currentEventId = eventData.eventId
    
    console.log('🎮 [STEP 4] Calling server to start run', {
      eventId: currentEventId,
      address: session.address,
      seed: seed.substring(0, 10) + '...',
      isInWorldApp  // Log the detection result
    })
    
    try {
      const response = await fetch('/api/run/start', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-world-app': isInWorldApp ? 'true' : 'false',
          'x-minikit': isInWorldApp ? 'true' : 'false',
          'x-wallet': session.address
        },
        body: JSON.stringify({
          eventId: currentEventId,
          address: session.address,
          seed,
          startedAt,
        }),
      })

      console.log('🎮 [STEP 5] Server responded:', response.status)

      if (!response.ok) {
        const data = await response.json()
        console.error('❌ [STEP 5 ERROR] Server rejected run:', data)
        const errorMsg = data.message || data.error || 'Failed to start run'
        setError(errorMsg)
        return
      }

      const { startToken, triesRemaining } = await response.json()
      console.log('✅ [STEP 6] Server accepted run, got start token')
      
      console.log('🎮 [STEP 7] Setting game state and data')
      setGameSeed(seed)
      setCurrentSeed(seed)
      setGameStartToken(startToken)
      setGameStartedAt(startedAt)
      setGameEventId(currentEventId)
      setIsDemo(false)
      
      console.log('🎮 [STEP 8] Navigating to game screen - setting gameState to "playing"')
      setGameState('playing')
      
      console.log('✅ [COMPLETE] Game started successfully - should see game screen now')
      
      // Mark credit as used after successful start
      setCreditUsed(true)
    } catch (err) {
      console.error('💥 [ERROR] Network or server error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Network error. Please try again.'
      setError(errorMsg)
    } finally {
      console.log('🎮 [CLEANUP] Resetting loading state')
      setStartingGame(false)
    }
  }

  const handlePlayDemo = async () => {
    // ALWAYS require wallet connection + verification for demo mode
    let currentSession = session
    if (!currentSession) {
      setConnecting(true)
      setError(null)
      try {
        const sessionData = await startSessionReal()
        setSession(sessionData)
        currentSession = sessionData // Use the new session immediately
        console.log('✅ Demo authenticated:', sessionData)
      } catch (err) {
        console.error('❌ Demo auth failed:', err)
        setError(t('connectionError'))
        setConnecting(false)
        return
      } finally {
        setConnecting(false)
      }
    }
    
    // Verify we have a wallet address before starting demo
    if (!currentSession?.address) {
      console.error('❌ No wallet address available for demo')
      setError('Please connect your wallet first')
      return
    }
    
    console.log('🎮 Starting demo with wallet:', currentSession.address)
    const seed = `demo-${Date.now()}-${Math.random().toString(36).substring(7)}`
    setGameSeed(seed)
    setIsDemo(true)
    setGameState('playing')
  }

  const handleGameOver = (score: number, seed: string, taps: number[], inputLog: any[]) => {
    setGameScore(score)
    setGameSeed(seed)
    setGameTaps(taps)
    setGameInputLog(inputLog)
    setCurrentScore(score)
    setGameState('finished')
  }

  const handleScoreSubmitted = async () => {
    await fetchEventData()
  }

  const handleStartMatch = async () => {
    if (!match.active) {
      console.error('handleStartMatch: match not active, refetching event data')
      setError('Session expired. Please try again.')
      await fetchEventData()
      setGameState('idle')
      return
    }
    if (!eventData?.eventId) {
      console.error('handleStartMatch: no event data')
      setError('No active competition. Please go back and try again.')
      setGameState('idle')
      return
    }
    if (!session?.address) {
      setError('Connection lost. Please reconnect.')
      setGameState('idle')
      return
    }
    
    const seed = generateCryptoSeed()
    const startedAt = Date.now()
    
    setStartingGame(true)
    setError(null)
    try {
      const response = await fetch('/api/run/start', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-world-app': 'true',
          'x-wallet': session.address
        },
        body: JSON.stringify({
          eventId: eventData.eventId,
          address: session.address,
          seed,
          startedAt,
          round: match.currentRound,
          matchToken: match.matchToken
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        const errorMsg = data.message || data.error || 'Failed to start round'
        console.error('handleStartMatch: server error', data)
        setError(errorMsg)
        setGameState('idle')
        fetchEventData()
        return
      }

      const { startToken } = await response.json()
      setGameSeed(seed)
      setCurrentSeed(seed)
      setGameStartToken(startToken)
      setGameStartedAt(startedAt)
      setIsDemo(false)
      setGameState('playing')
    } catch (err) {
      console.error('handleStartMatch: network error', err)
      setError('Network error starting game. Please try again.')
      setGameState('idle')
    } finally {
      setStartingGame(false)
    }
  }

  const handleRoundComplete = async (score: number, seed: string, taps: number[], inputLog: any[]) => {
    console.log(`🎮 Game complete with score: ${score}`)
    recordRoundScore(score, seed)
    setGameScore(score)
    setGameTaps(taps)
    setGameInputLog(inputLog)
    
    // Validate required data before submitting
    if (!session?.address || !gameEventId || !gameStartToken || !gameStartedAt) {
      console.error('❌ Missing required data for score submission:', {
        hasAddress: !!session?.address,
        hasEventId: !!gameEventId,
        hasStartToken: !!gameStartToken,
        hasStartedAt: !!gameStartedAt
      })
      setError('Session data missing. Your score could not be saved.')
      setGameState('matchComplete')
      return
    }
    
    // Submit score to server with retry logic
    const MAX_RETRIES = 3
    const RETRY_DELAY = 1000
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`📤 Submitting score to server (attempt ${attempt}/${MAX_RETRIES}):`, { 
          address: session.address, 
          eventId: gameEventId, 
          score,
          inputLogLength: inputLog?.length || 0
        })
        
        const finishResponse = await fetch('/api/run/finish', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-world-app': 'true',
            'x-wallet': session.address
          },
          body: JSON.stringify({
            address: session.address,
            isVerified: session.isVerified,
            eventId: gameEventId,
            score,
            seed,
            inputLog,
            startToken: gameStartToken,
            startedAt: gameStartedAt,
          }),
        })

        const data = await finishResponse.json()

        if (finishResponse.ok) {
          console.log('✅ Score submitted successfully!', data)
          setGameState('matchComplete')
          return
        } else {
          console.error(`❌ Failed to submit score (attempt ${attempt}):`, data)
          // Don't retry for permanent errors
          if (['duplicate_run', 'invalid_token', 'max_tries_exceeded', 'score_mismatch'].includes(data.error)) {
            setError(data.message || 'Failed to submit score')
            setGameState('matchComplete')
            return
          }
          // For other errors, retry if attempts remain
          if (attempt === MAX_RETRIES) {
            setError(data.message || 'Failed to submit score after multiple attempts')
          }
        }
      } catch (err) {
        console.error(`💥 Network error submitting score (attempt ${attempt}):`, err)
        if (attempt === MAX_RETRIES) {
          setError('Network error. Your score could not be saved.')
        }
      }
      
      // Wait before retrying
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      }
    }
    
    setGameState('matchComplete')
  }

  const handleContinueToNextRound = async () => {
    nextRound()
    
    const seed = generateCryptoSeed()
    const startedAt = Date.now()
    
    try {
      const response = await fetch('/api/run/start', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-world-app': 'true',
          'x-wallet': session?.address || ''
        },
        body: JSON.stringify({
          eventId: match.eventId,
          address: session?.address,
          seed,
          startedAt,
          round: match.currentRound + 1,
          matchToken: match.matchToken
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.message || 'Failed to start next round')
        return
      }

      const { startToken } = await response.json()
      setGameSeed(seed)
      setCurrentSeed(seed)
      setGameStartToken(startToken)
      setGameStartedAt(startedAt)
      setGameState('playing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    }
  }

  const handleMatchComplete = () => {
    endMatch()
    setQuestRefreshKey(k => k + 1)
    router.push('/leaderboard')
  }

  const handleBackToHome = () => {
    setGameState('idle')
    setGameScore(0)
    setGameSeed('')
    setGameTaps([])
    setGameInputLog([])
    setGameStartToken('')
    setGameStartedAt(0)
    setGameEventId(null)
    setIsDemo(false)
    fetchEventData()
    setQuestRefreshKey(k => k + 1)
  }

  const baseEntryFee = session?.isVerified ? 0.5 : 1.0
  const entryFee = activeDiscount 
    ? (baseEntryFee * (1 - activeDiscount.percent / 100)).toFixed(2)
    : baseEntryFee.toFixed(1)

  // Wait for hydration before showing setup/tutorial
  if (needsSetup === null || needsTutorial === null) {
    return null
  }

  // Tutorial now includes language selection, so we skip WelcomeSetup when showing tutorial
  // Show tutorial for first-time players (includes welcome, language, demo, connect wallet)
  if (needsTutorial && gameState === 'idle') {
    const handleTutorialComplete = () => {
      markTutorialComplete()
      markSetupComplete()
    }
    return (
      <GameTutorial 
        onComplete={handleTutorialComplete}
      />
    )
  }

  // Fallback: Show welcome setup only if tutorial is done but setup is not
  // This handles edge cases from older versions
  if (needsSetup && gameState === 'idle') {
    return <WelcomeSetup onComplete={markSetupComplete} />
  }

  // Show rules screen
  if (showRules) {
    return <RulesScreen onBack={() => setShowRules(false)} />
  }

  // Show confirmation screen after payment
  if (gameState === 'confirmation') {
    return (
      <ConfirmationScreen 
        onStartMatch={handleStartMatch}
        onViewRules={() => setShowRules(true)}
        onBack={() => setGameState('idle')}
      />
    )
  }

  // Show round transition screen
  if (gameState === 'roundComplete') {
    const matchTotal = match.roundScores.reduce((sum, rs) => sum + rs.score, 0)
    return (
      <RoundTransition 
        roundScore={gameScore}
        matchTotal={matchTotal}
        currentRound={match.currentRound}
        totalRounds={match.totalRounds}
        onContinue={handleContinueToNextRound}
      />
    )
  }

  // Show game complete screen
  if (gameState === 'matchComplete') {
    return (
      <MatchComplete 
        finalScore={getFinalScore()}
        onClose={handleBackToHome}
      />
    )
  }

  if (gameState === 'playing') {
    console.log('🎮 [RENDER] Game screen is rendering!', {
      gameSeed: gameSeed.substring(0, 10) + '...',
      isDemo,
      gameEventId,
      hasStartToken: !!gameStartToken,
      matchActive: match.active,
      currentRound: match.currentRound
    })
    return (
      <div className="container" style={{ pointerEvents: 'auto' }}>
        <PrecisionTapGame 
          seed={gameSeed}
          onGameOver={(score, seed, taps, inputLog) => {
            console.log('🎮 [GAME OVER] Player finished with score:', score)
            
            if (isDemo) {
              setGameScore(score)
              setGameSeed(seed)
              setGameTaps(taps)
              setGameInputLog(inputLog)
              setCurrentScore(score)
              setGameState('finished')
            } else if (match.active) {
              handleRoundComplete(score, seed, taps, inputLog)
            } else {
              setGameScore(score)
              setGameSeed(seed)
              setGameTaps(taps)
              setGameInputLog(inputLog)
              setCurrentScore(score)
              setGameState('finished')
            }
          }}
        />
      </div>
    )
  }

  if (gameState === 'finished') {
    if (isDemo) {
      return (
        <DemoResult 
          score={gameScore}
          onBackToHome={handleBackToHome}
          onBuyEntry={handleBuyEntry}
          walletAddress={session?.address}
          isVerified={session?.isVerified}
        />
      )
    }

    if (!gameEventId || !gameStartToken || !gameStartedAt) {
      return (
        <div className="container">
          <TopBar title={t('appName')} showBack={false} />
          <main className={styles.main}>
            <div className="card">
              <p className={styles.error}>{t('invalidRunData')}</p>
              <button onClick={handleBackToHome} className="btn btn-primary">
                {t('backToHome')}
              </button>
            </div>
          </main>
        </div>
      )
    }

    return (
      <GameResult 
        score={gameScore}
        seed={gameSeed}
        taps={gameTaps}
        inputLog={gameInputLog}
        eventId={gameEventId}
        startToken={gameStartToken}
        startedAt={gameStartedAt}
        onBackToHome={handleBackToHome}
        onScoreSubmitted={handleScoreSubmitted}
      />
    )
  }

  return (
    <div className="container">
      <TopBar title={t('appName')} showSettings={false} />
      
      {/* Update Banner */}
      {showUpdateBanner && (
        <div className={styles.updateOverlay}>
          <div className={styles.updateOverlayModal}>
            <div className={styles.updateOverlayHeader}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}>&#128225;</span>
              <h2 className={styles.updateOverlayTitle}>UPDATE!</h2>
            </div>
            <div className={styles.updateOverlayBody}>
              <p className={styles.updateOverlayText}>
                There were reported bugs related to the newly added quests system, and they have been fixed!
              </p>
              <p className={styles.updateOverlayText}>
                Please message <strong>@dkim.0000</strong> if you are still experiencing bugs.
              </p>
              <p className={styles.updateOverlayText} style={{ marginTop: '12px' }}>
                Happy playing!
              </p>
            </div>
            <button 
              className={styles.updateOverlayButton}
              onClick={() => {
                localStorage.setItem('prizefi_banner_dismissed', 'quest_fix_notice_v2')
                setShowUpdateBanner(false)
              }}
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
      
      <main className={styles.main}>
        <div className={styles.hero}>
          <div className={styles.trophyContainer}>
            <img 
              src="/images/trophy.png?v=6" 
              alt="Trophy" 
              className={styles.trophyIcon}
            />
          </div>
          <h1 className={styles.appTitle}>{t('appName')}</h1>
          <p className={styles.tagline}>{t('tagline')}</p>
          <div className={styles.prizeHighlight}>
            <span>PLAY. WIN. EARN WLD. REPEAT.</span>
          </div>
        </div>

        <div className={styles.actions}>
          {!session ? (
            <>
              <button 
                className="btn btn-primary" 
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? t('connecting') : t('connectButton')}
              </button>

              <button
                className="btn btn-secondary"
                onClick={handlePlayDemo}
              >
                {t('playDemo')}
              </button>

              <HowToPlay />
              
              {error && (
                <p className={styles.error}>{error}</p>
              )}
              
              {pendingPayment && totalPurchased === 0 && retryingConfirmation && (
                <div className={styles.pendingPaymentNotice}>
                  <p className={styles.pendingPaymentText}>
                    Recovering your payment...
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {eventData && (
                <EventCountdown 
                  endTime={eventData.endTime}
                  status={eventData.status}
                  timeUntilNext={eventData.timeUntilNext}
                />
              )}

              <div className="card">
                <div className={styles.sessionInfo}>
                  <div className={styles.infoRow}>
                    <span className="text-muted">{username ? t('player') : t('wallet')}</span>
                    <span className={styles.value}>{username || t('connected')}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className="text-muted">{t('verificationStatus')}</span>
                    <StatusBadge isVerified={session.isVerified} />
                  </div>
                  {eventData && (
                    <div className={styles.infoRow}>
                      <span className="text-muted">{t('matchStatus')}</span>
                      <span className={`${styles.value} ${styles.tries}`}>
                        {attemptsUsed > 0 ? `${t('played')} ${attemptsUsed}x` : t('notEntered')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.gameActions}>
                {eventData?.status === 'ended' && (
                  <p className={styles.eventEnded}>{t('eventEndedMessage')}</p>
                )}

                {/* Show Join Competition button if user hasn't purchased an entry yet */}
                {eventStatusLoaded &&
                 eventData?.status !== 'ended' && 
                 totalPurchased === 0 &&
                 canBuyMore && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleShowPaymentConfirm}
                      disabled={purchasing || eventData?.status === 'cooldown'}
                      style={eventData?.status === 'cooldown' ? { opacity: 0.5 } : undefined}
                    >
                      {purchasing ? t('purchasing') : eventData?.status === 'cooldown'
                        ? 'WAITING FOR NEXT ROUND...'
                        : activeDiscount
                          ? (activeDiscount.percent === 100 ? 'USE FREE PLAY' : `JOIN - ${entryFee} WLD (${activeDiscount.percent}% OFF)`)
                          : (session?.isVerified ? t('joinCompetitionVerified') : t('joinCompetitionUnverified'))
                      }
                    </button>
                    {activeDiscount && (
                      <div className={styles.appliedVoucher}>
                        <span className={styles.appliedVoucherText}>
                          {activeDiscount.percent === 100 ? 'FREE PLAY' : `${activeDiscount.percent}% OFF`} voucher applied
                        </span>
                        <button className={styles.removeVoucherBtn} onClick={handleRemoveVoucher}>
                          Remove
                        </button>
                      </div>
                    )}
                    {vouchers.length > 0 && !activeDiscount && (
                      <button
                        type="button"
                        className={styles.voucherBtn}
                        onClick={() => setShowVoucherPicker(true)}
                      >
                        USE VOUCHERS ({vouchers.length})
                      </button>
                    )}
                    {!activeDiscount && (
                      <p className={styles.entryNote}>
                        {session?.isVerified ? t('verifiedEntryNote') : t('unverifiedEntryNote')}
                      </p>
                    )}
                  </>
                )}

                {/* Show Start Match button if user has purchased but hasn't used all attempts */}
                {eventStatusLoaded &&
                 eventData?.status !== 'ended' && 
                 totalPurchased > 0 &&
                 attemptsUsed < totalPurchased && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handlePlayGame}
                    disabled={startingGame}
                  >
                    {startingGame ? t('connecting') : t('startMatch')}
                  </button>
                )}

                {/* Show Play Again button if user has played but can buy more entries */}
                {eventStatusLoaded &&
                 eventData?.status !== 'ended' && 
                 totalPurchased > 0 &&
                 attemptsUsed >= totalPurchased &&
                 canBuyMore && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleShowPaymentConfirm}
                      disabled={purchasing || eventData?.status === 'cooldown'}
                      style={eventData?.status === 'cooldown' ? { opacity: 0.5 } : undefined}
                    >
                      {purchasing ? t('purchasing') : eventData?.status === 'cooldown'
                        ? 'WAITING FOR NEXT ROUND...'
                        : activeDiscount
                          ? (activeDiscount.percent === 100 ? 'USE FREE PLAY' : `${t('playAgain')} - ${entryFee} WLD`)
                          : t('playAgain')
                      }
                    </button>
                    {activeDiscount && (
                      <div className={styles.appliedVoucher}>
                        <span className={styles.appliedVoucherText}>
                          {activeDiscount.percent === 100 ? 'FREE PLAY' : `${activeDiscount.percent}% OFF`} voucher applied
                        </span>
                        <button className={styles.removeVoucherBtn} onClick={handleRemoveVoucher}>
                          Remove
                        </button>
                      </div>
                    )}
                    {vouchers.length > 0 && !activeDiscount && (
                      <button
                        type="button"
                        className={styles.voucherBtn}
                        onClick={() => setShowVoucherPicker(true)}
                      >
                        USE VOUCHERS ({vouchers.length})
                      </button>
                    )}
                    {!activeDiscount && (
                      <p className={styles.entryNote}>
                        {session?.isVerified ? t('verifiedEntryNote') : t('unverifiedEntryNote')}
                      </p>
                    )}
                  </>
                )}

                {/* Show message when max tries reached (should be rare with unlimited tries) */}
                {eventStatusLoaded &&
                 eventData?.status !== 'ended' && 
                 attemptsUsed >= maxTries && (
                  <p className={styles.noCredits}>{t('alreadyCompeted')}</p>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handlePlayDemo}
                disabled={connecting}
              >
                {t('playDemo')}
              </button>

              <HowToPlay />

              <Quests 
                refreshKey={questRefreshKey}
                onRewardEarned={(reward) => {
                  console.log('Quest reward earned:', reward)
                  fetchEventData()
                  fetchActiveDiscount()
                }}
              />

              {error && (
                <p className={styles.error}>{error}</p>
              )}
              
              {pendingPayment && totalPurchased === 0 && retryingConfirmation && (
                <div className={styles.pendingPaymentNotice}>
                  <p className={styles.pendingPaymentText}>
                    Recovering your payment...
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      
      <BottomNav />

      {/* Voucher Picker Modal */}
      {showVoucherPicker && (
        <div className={styles.modalOverlay} onClick={() => setShowVoucherPicker(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>YOUR VOUCHERS</h2>
            <div className={styles.voucherList}>
              {(() => {
                const grouped: { key: string; type: string; percent: number; count: number; ids: number[] }[] = []
                vouchers.forEach((v) => {
                  const key = v.type === 'free_play' ? 'free_play' : `discount_${v.percent}`
                  const existing = grouped.find(g => g.key === key)
                  if (existing) {
                    existing.count++
                    existing.ids.push(v.id)
                  } else {
                    grouped.push({ key, type: v.type, percent: v.percent, count: 1, ids: [v.id] })
                  }
                })
                grouped.sort((a, b) => b.percent - a.percent)
                return grouped.map((g) => (
                  <button
                    key={g.key}
                    className={styles.voucherItem}
                    onClick={() => handleSelectVoucher({ id: g.ids[0], type: g.type, percent: g.percent })}
                  >
                    <div className={styles.voucherIcon}>
                      {g.type === 'free_play' ? (
                        <svg viewBox="0 0 24 24" width="28" height="28">
                          <rect x="2" y="10" width="20" height="4" fill="#22c55e" />
                          <rect x="10" y="2" width="4" height="20" fill="#22c55e" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="28" height="28">
                          <rect x="4" y="6" width="16" height="12" rx="2" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="1" />
                          <rect x="8" y="10" width="8" height="4" fill="#dbeafe" />
                        </svg>
                      )}
                    </div>
                    <div className={styles.voucherInfo}>
                      <span className={styles.voucherName}>
                        {g.type === 'free_play' ? 'FREE PLAY' : `${g.percent}% OFF`}
                        {g.count > 1 && ` (${g.count}x)`}
                      </span>
                      <span className={styles.voucherDesc}>
                        {g.type === 'free_play'
                          ? 'Play one competition for free'
                          : `Save ${g.percent}% on your next entry`
                        }
                      </span>
                    </div>
                    <span className={styles.voucherUse}>USE</span>
                  </button>
                ))
              })()}
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setShowVoucherPicker(false)}
              style={{ width: '100%', marginTop: '12px' }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {showPaymentConfirm && (
        <div className={styles.modalOverlay} onClick={() => setShowPaymentConfirm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {activeDiscount?.percent === 100 ? 'CONFIRM FREE PLAY' : t('confirmPayment')}
            </h2>
            <div className={styles.modalContent}>
              {activeDiscount?.percent === 100 ? (
                <div className={styles.freePlayConfirm}>
                  <div className={styles.discountBadge}>FREE PLAY voucher</div>
                  <p className={styles.freePlayText}>No payment required!</p>
                </div>
              ) : (
                <>
                  <div className={styles.paymentDetail}>
                    <span>{t('youWillPay')}</span>
                    <span className={styles.paymentAmount}>{entryFee} WLD</span>
                  </div>
                  {activeDiscount && (
                    <div className={styles.discountBadge}>
                      <span className={styles.originalPrice}>{baseEntryFee.toFixed(1)} WLD</span>
                      {activeDiscount.percent}% OFF applied!
                    </div>
                  )}
                </>
              )}
              <div className={styles.paymentDetail}>
                <span>{t('toPlayOneTime')}</span>
              </div>
              <p className={styles.paymentWarning}>
                {t('oneChanceWarning')}
              </p>
              {!session?.isVerified && !activeDiscount && (
                <p className={styles.paymentNote}>
                  {t('verifyToPayHalf')}
                </p>
              )}
            </div>
            <div className={styles.modalActions}>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowPaymentConfirm(false)}
              >
                {t('cancel')}
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleBuyEntry}
                disabled={purchasing}
              >
                {purchasing ? t('purchasing') : (
                  activeDiscount?.percent === 100
                    ? 'PLAY FREE'
                    : `${t('confirmPay')} ${entryFee} WLD`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
