'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import styles from './SpinWheel.module.css'

interface SpinWheelProps {
  reward: { type: string; discountPercent?: number; rewardTier?: string }
  onComplete: (reward: { type: string; discountPercent?: number }) => void
  onSpin?: () => void
}

const STANDARD_SEGMENTS = [
  { label: '15% OFF', bg: '#3b82f6', chance: '95%' },
  { label: 'FREE PLAY', bg: '#22c55e', chance: '5%' },
]

const BOOSTED_SEGMENTS = [
  { label: '25% OFF', bg: '#3b82f6', chance: '75%' },
  { label: '15% OFF', bg: '#64748b', chance: '20%' },
  { label: 'FREE PLAY', bg: '#22c55e', chance: '5%' },
]

function getTargetIndex(reward: { type: string; discountPercent?: number }, isBoosted: boolean): number {
  if (!isBoosted) {
    return reward.type === 'free_play' ? 1 : 0
  }
  if (reward.type === 'free_play') return 2
  if (reward.discountPercent === 15) return 1
  return 0
}

const ITEM_WIDTH = 140

export default function SpinWheel({ reward, onComplete, onSpin }: SpinWheelProps) {
  const [spinning, setSpinning] = useState(false)
  const [hasSpun, setHasSpun] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [offset, setOffset] = useState(0)
  const reelRef = useRef<HTMLDivElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)

  const isBoosted = reward.rewardTier === 'boosted'
  const segments = isBoosted ? BOOSTED_SEGMENTS : STANDARD_SEGMENTS

  const reelItems: typeof segments = []
  const totalCopies = 20
  for (let i = 0; i < totalCopies; i++) {
    reelItems.push(...segments)
  }

  const handleSpin = useCallback(() => {
    if (spinning || hasSpun) return
    setSpinning(true)
    setHasSpun(true)
    onSpin?.()

    const targetIndex = getTargetIndex(reward, isBoosted)
    const landCopy = 15
    const landPosition = landCopy * segments.length + targetIndex
    const windowWidth = windowRef.current?.clientWidth || 300
    const targetCenter = landPosition * ITEM_WIDTH + ITEM_WIDTH / 2
    const targetOffset = targetCenter - windowWidth / 2
    const maxJitter = ITEM_WIDTH * 0.25
    const jitter = (Math.random() - 0.5) * maxJitter

    setOffset(targetOffset + jitter)

    setTimeout(() => {
      setSpinning(false)
      setShowResult(true)
    }, 3500)
  }, [spinning, hasSpun, reward, isBoosted, segments.length, onSpin])

  const handleClose = () => {
    onComplete(reward)
  }

  const getResultContent = () => {
    if (reward.type === 'free_play') {
      return { title: 'JACKPOT!', text: 'You won a FREE competition entry!' }
    }
    const pct = reward.discountPercent || 20
    return {
      title: pct >= 50 ? 'AMAZING!' : pct >= 30 ? 'GREAT!' : 'Nice!',
      text: `You got ${pct}% off your next entry!`
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>SPIN TO WIN!</h2>
          {isBoosted && <span className={styles.boostedTag}>BOOSTED</span>}
        </div>

        <div className={styles.reelArea}>
          <div className={styles.reelFrame}>
            <div className={styles.pointer} />
            <div className={styles.pointerBottom} />
            <div className={styles.reelWindow} ref={windowRef}>
              <div
                ref={reelRef}
                className={styles.reelStrip}
                style={{
                  transform: `translateX(-${offset}px)`,
                  transition: spinning
                    ? 'transform 3.5s cubic-bezier(0.15, 0.60, 0.10, 1.00)'
                    : 'none'
                }}
              >
                {reelItems.map((seg, i) => (
                  <div
                    key={i}
                    className={styles.reelItem}
                    style={{ background: seg.bg, minWidth: ITEM_WIDTH }}
                  >
                    <span className={styles.reelLabel}>{seg.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!spinning && !hasSpun && (
            <button className={styles.spinBtn} onClick={handleSpin}>
              SPIN!
            </button>
          )}
        </div>

        {!hasSpun && !spinning && (
          <div className={styles.oddsSection}>
            <div className={styles.oddsTitle}>Drop Rates</div>
            <div className={styles.oddsGrid}>
              {segments.map((seg, i) => (
                <div key={i} className={styles.oddsItem}>
                  <span className={styles.oddsDot} style={{ background: seg.bg }} />
                  <span className={styles.oddsLabel}>{seg.label}</span>
                  <span className={styles.oddsChance}>{seg.chance}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showResult && (() => {
          const result = getResultContent()
          return (
            <div className={styles.result}>
              <div className={styles.resultStars}>* * *</div>
              <h3 className={styles.resultTitle}>{result.title}</h3>
              <p className={styles.resultText}>{result.text}</p>
              <button className={styles.closeBtn} onClick={handleClose}>
                CLAIM
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
