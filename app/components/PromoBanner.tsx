'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from '../contexts/SessionContext'
import styles from './PromoBanner.module.css'

interface PromoApp {
  id: number
  name: string
  url: string
  message: string
}

const MOCK_PROMO: PromoApp = {
  id: 1,
  name: 'CryptoSwap',
  url: 'https://worldcoin.org',
  message: 'Swap tokens instantly'
}

type RewardType = 'discount' | 'free_play'

interface PromoBannerProps {
  onRewardEarned?: (reward: RewardType) => void
}

export default function PromoBanner({ onRewardEarned }: PromoBannerProps) {
  const { session } = useSession()
  const [promo, setPromo] = useState<PromoApp | null>(null)
  const [phase, setPhase] = useState<'banner' | 'visiting' | 'verify' | 'spin' | 'result'>('banner')
  const [visitStartTime, setVisitStartTime] = useState<number>(0)
  const [spinning, setSpinning] = useState(false)
  const [reward, setReward] = useState<RewardType | null>(null)
  const [wheelPosition, setWheelPosition] = useState(0)
  const [completed, setCompleted] = useState(false)
  const wheelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPromo()
  }, [])

  const fetchPromo = async () => {
    try {
      const response = await fetch('/api/ads/active')
      if (response.ok) {
        const data = await response.json()
        if (data.ads && data.ads.length > 0) {
          const ad = data.ads[0]
          setPromo({
            id: ad.id,
            name: ad.title || 'Partner App',
            url: ad.targetUrl || '#',
            message: ad.description || 'Check it out!'
          })
        } else {
          setPromo(MOCK_PROMO)
        }
      } else {
        setPromo(MOCK_PROMO)
      }
    } catch {
      setPromo(MOCK_PROMO)
    }
  }

  const handleVisit = () => {
    if (!promo) return
    setVisitStartTime(Date.now())
    setPhase('visiting')
    window.open(promo.url, '_blank')
    
    setTimeout(() => {
      setPhase('verify')
    }, 3000)
  }

  const handleVerify = () => {
    const visitDuration = Date.now() - visitStartTime
    if (visitDuration >= 3000) {
      setPhase('spin')
    }
  }

  const handleSpin = () => {
    if (spinning) return
    setSpinning(true)

    const random = Math.random()
    const selectedReward: RewardType = random < 0.9 ? 'discount' : 'free_play'
    
    const targetPosition = selectedReward === 'discount' ? 0 : 1
    const spins = 3 + Math.floor(Math.random() * 2)
    const totalSlots = spins * 2 + targetPosition
    
    let currentPos = 0
    const slotWidth = 140
    const duration = 3000
    const startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      
      currentPos = eased * totalSlots * slotWidth
      setWheelPosition(currentPos)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        const finalPos = targetPosition * slotWidth
        setWheelPosition(finalPos)
        setSpinning(false)
        setReward(selectedReward)
        
        setTimeout(() => {
          setPhase('result')
          onRewardEarned?.(selectedReward)
          saveReward(selectedReward)
        }, 500)
      }
    }
    
    requestAnimationFrame(animate)
  }

  const saveReward = async (rewardType: RewardType) => {
    if (!session?.address || !promo) return
    
    try {
      await fetch('/api/promo/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: session.address,
          promoId: promo.id,
          rewardType
        })
      })
    } catch (err) {
      console.error('Failed to save reward:', err)
    }
  }

  const handleClose = () => {
    setCompleted(true)
  }

  if (completed || !promo) return null

  if (phase === 'result' && reward) {
    return (
      <div className={styles.container}>
        <div className={styles.resultCard}>
          <div className={styles.resultIcon}>
            {reward === 'free_play' ? '🎉' : '🎫'}
          </div>
          <h3 className={styles.resultTitle}>
            {reward === 'free_play' ? 'FREE PLAY!' : '20% OFF!'}
          </h3>
          <p className={styles.resultText}>
            {reward === 'free_play' 
              ? 'You won a free competition entry!' 
              : 'You got 20% off your next competition!'}
          </p>
          <button onClick={handleClose} className={styles.claimButton}>
            Got it!
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'spin') {
    return (
      <div className={styles.container}>
        <div className={styles.spinCard}>
          <h3 className={styles.spinTitle}>SPIN TO WIN!</h3>
          
          <div className={styles.wheelContainer}>
            <div className={styles.wheelPointer}>▼</div>
            <div className={styles.wheelWindow}>
              <div 
                ref={wheelRef}
                className={styles.wheelTrack}
                style={{ transform: `translateX(-${wheelPosition}px)` }}
              >
                {[...Array(10)].map((_, i) => (
                  <div key={i} className={styles.wheelSlots}>
                    <div className={`${styles.wheelSlot} ${styles.discountSlot}`}>
                      <span className={styles.slotIcon}>🎫</span>
                      <span className={styles.slotText}>20% OFF</span>
                    </div>
                    <div className={`${styles.wheelSlot} ${styles.freeSlot}`}>
                      <span className={styles.slotIcon}>🎮</span>
                      <span className={styles.slotText}>FREE PLAY</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={handleSpin} 
            className={styles.spinButton}
            disabled={spinning}
          >
            {spinning ? 'SPINNING...' : 'SPIN!'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'verify') {
    return (
      <div className={styles.container}>
        <div className={styles.verifyCard}>
          <div className={styles.verifyIcon}>✓</div>
          <p className={styles.verifyText}>Did you check out {promo.name}?</p>
          <button onClick={handleVerify} className={styles.verifyButton}>
            Yes, claim my reward!
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'visiting') {
    return (
      <div className={styles.container}>
        <div className={styles.visitingCard}>
          <div className={styles.loader}></div>
          <p className={styles.visitingText}>Visiting {promo.name}...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.banner}>
        <div className={styles.bannerGlow}></div>
        <div className={styles.bannerContent}>
          <div className={styles.bannerHeader}>
            <span className={styles.starIcon}>★</span>
            <span className={styles.promoLabel}>SPECIAL OFFER</span>
            <span className={styles.starIcon}>★</span>
          </div>
          <p className={styles.bannerCta}>
            Visit <span className={styles.appName}>{promo.name}</span> for a PrizeFi surprise!
          </p>
          <button onClick={handleVisit} className={styles.visitButton}>
            Visit & Win
          </button>
        </div>
      </div>
    </div>
  )
}
