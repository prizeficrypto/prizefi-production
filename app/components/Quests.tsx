'use client'

import { useState, useEffect } from 'react'
import { useSession } from '../contexts/SessionContext'
import { useLanguage } from '../contexts/LanguageContext'
import SpinWheel from './SpinWheel'
import styles from './Quests.module.css'

interface Quest {
  id: number
  questKey: string
  title: string
  description: string
  targetValue: number
  questType: string
  currentValue: number
  completed: boolean
  rewardClaimed: boolean
  rewardTier: 'standard' | 'boosted'
}

interface QuestsProps {
  refreshKey?: number
  onRewardEarned?: (reward: { type: string; discountPercent?: number }) => void
}

export default function Quests({ refreshKey, onRewardEarned }: QuestsProps) {
  const { session } = useSession()
  const { t } = useLanguage()
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingQuestId, setClaimingQuestId] = useState<number | null>(null)
  const [showWheel, setShowWheel] = useState(false)
  const [showPreSpin, setShowPreSpin] = useState(false)
  const [pendingReward, setPendingReward] = useState<{ type: string; discountPercent?: number; rewardTier?: string } | null>(null)
  const [pendingQuestId, setPendingQuestId] = useState<number | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    fetchQuests()
  }, [session?.address, refreshKey])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && session?.address) {
        fetchQuests()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [session?.address])

  const fetchQuests = async () => {
    try {
      const address = session?.address || ''
      const res = await fetch(`/api/quests?address=${address}`)
      if (res.ok) {
        const data = await res.json()
        setQuests(data.quests || [])
      }
    } catch (err) {
      console.error('Error fetching quests:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClaimClick = (questId: number) => {
    setPendingQuestId(questId)
    setShowPreSpin(true)
  }

  const handleConfirmSpin = async () => {
    if (!session?.address || !pendingQuestId) return

    setShowPreSpin(false)
    setClaimingQuestId(pendingQuestId)
    try {
      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet': session.address
        },
        body: JSON.stringify({ address: session.address, questId: pendingQuestId })
      })

      const data = await res.json()

      if (res.ok && data.reward) {
        setPendingReward(data.reward)
        setShowWheel(true)
      } else {
        setClaimError(data.error || 'Failed to claim reward. Please try again.')
        setTimeout(() => setClaimError(null), 4000)
        fetchQuests()
      }
    } catch (err) {
      console.error('Error claiming reward:', err)
      setClaimError('Network error. Please try again.')
      setTimeout(() => setClaimError(null), 4000)
    } finally {
      setClaimingQuestId(null)
      setPendingQuestId(null)
    }
  }

  const handleWheelComplete = (reward: { type: string; discountPercent?: number }) => {
    setShowWheel(false)
    setPendingReward(null)
    fetchQuests()
    if (onRewardEarned) {
      onRewardEarned(reward)
    }
  }

  const claimableCount = quests.filter(q => q.completed && !q.rewardClaimed).length

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <span className={styles.icon}>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <rect x="4" y="4" width="16" height="4" fill="#fbbf24" />
                <rect x="4" y="8" width="4" height="12" fill="#f59e0b" />
                <rect x="16" y="8" width="4" height="12" fill="#f59e0b" />
                <rect x="8" y="8" width="8" height="4" fill="#fde047" />
                <rect x="10" y="12" width="4" height="8" fill="#d97706" />
              </svg>
            </span>
            <span className={styles.title}>Quests</span>
          </div>
        </div>
        <div className={styles.questList}>
          <div className={styles.loadingText}>Loading quests...</div>
        </div>
      </div>
    )
  }

  const displayQuests = expanded ? quests : quests.slice(0, 3)

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header} onClick={() => setExpanded(!expanded)}>
          <div className={styles.titleRow}>
            <span className={styles.icon}>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <rect x="4" y="4" width="16" height="4" fill="#fbbf24" />
                <rect x="4" y="8" width="4" height="12" fill="#f59e0b" />
                <rect x="16" y="8" width="4" height="12" fill="#f59e0b" />
                <rect x="8" y="8" width="8" height="4" fill="#fde047" />
                <rect x="10" y="12" width="4" height="8" fill="#d97706" />
              </svg>
            </span>
            <span className={styles.title}>Quests</span>
            {claimableCount > 0 && (
              <span className={styles.badge}>{claimableCount}</span>
            )}
          </div>
          <span className={styles.expandIcon}>{expanded ? '−' : '+'}</span>
        </div>

        <div className={styles.questList}>
          {claimError && (
            <div className={styles.claimError}>{claimError}</div>
          )}
          {displayQuests.length === 0 && (
            <div className={styles.emptyText}>No quests available right now. Check back soon!</div>
          )}
          {displayQuests.map(quest => (
            <div
              key={quest.id}
              className={`${styles.questItem} ${quest.completed ? styles.completed : ''} ${quest.rewardClaimed ? styles.claimed : ''}`}
            >
              <div className={styles.questInfo}>
                <div className={styles.questTitleRow}>
                  <div className={styles.questTitle}>{quest.title}</div>
                  {quest.rewardTier === 'boosted' && !quest.rewardClaimed && (
                    <span className={styles.boostedBadge}>BOOSTED</span>
                  )}
                </div>
                <div className={styles.questDesc}>
                  {quest.description}
                  {quest.rewardTier === 'boosted' && !quest.rewardClaimed && !quest.completed && (
                    <div className={styles.boostedHint}>Complete for even BETTER rewards!</div>
                  )}
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${Math.min(100, (quest.currentValue / quest.targetValue) * 100)}%` }}
                  />
                </div>
                <div className={styles.progressText}>
                  {quest.currentValue.toLocaleString()} / {quest.targetValue.toLocaleString()}
                </div>
              </div>
              <div className={styles.questAction}>
                {quest.rewardClaimed ? (
                  <span className={styles.claimedBadge}>Claimed</span>
                ) : quest.completed ? (
                  <button
                    className={styles.claimBtn}
                    onClick={() => handleClaimClick(quest.id)}
                    disabled={claimingQuestId === quest.id}
                  >
                    {claimingQuestId === quest.id ? '...' : 'Claim'}
                  </button>
                ) : (
                  <span className={styles.inProgress}>In Progress</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {quests.length > 3 && (
          <button className={styles.showMore} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show Less' : `Show All (${quests.length})`}
          </button>
        )}
      </div>

      {showPreSpin && (
        <div className={styles.preSpinOverlay}>
          <div className={styles.preSpinModal}>
            <div className={styles.preSpinIcon}>
              <svg viewBox="0 0 24 24" width="48" height="48">
                <rect x="4" y="4" width="16" height="4" fill="#fbbf24" />
                <rect x="4" y="8" width="4" height="12" fill="#f59e0b" />
                <rect x="16" y="8" width="4" height="12" fill="#f59e0b" />
                <rect x="8" y="8" width="8" height="4" fill="#fde047" />
                <rect x="10" y="12" width="4" height="8" fill="#d97706" />
              </svg>
            </div>
            <h3 className={styles.preSpinTitle}>Spin the wheel to earn a prize!</h3>
            <p className={styles.preSpinText}>You've completed this quest. Spin the wheel to claim your reward!</p>
            <div className={styles.preSpinButtons}>
              <button className={styles.preSpinBtn} onClick={handleConfirmSpin}>
                SPIN!
              </button>
              <button className={styles.preSpinCancel} onClick={() => { setShowPreSpin(false); setPendingQuestId(null) }}>
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {showWheel && pendingReward && (
        <SpinWheel
          reward={pendingReward}
          onComplete={handleWheelComplete}
        />
      )}
    </>
  )
}
