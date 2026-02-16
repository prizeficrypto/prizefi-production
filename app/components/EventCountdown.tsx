'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import styles from './EventCountdown.module.css'

interface EventCountdownProps {
  endTime: string | null
  status?: 'active' | 'ended' | 'cooldown'
  timeUntilNext?: number | null
  prizePool?: number
}

export default function EventCountdown({ endTime, status = 'active', timeUntilNext, prizePool }: EventCountdownProps) {
  const { t } = useLanguage()
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [targetTime, setTargetTime] = useState<number | null>(null)

  useEffect(() => {
    // Calculate target timestamp once when props change
    if ((status === 'ended' || status === 'cooldown') && timeUntilNext !== null && timeUntilNext !== undefined) {
      setTargetTime(Date.now() + (timeUntilNext * 1000))
    } else if (endTime) {
      const end = new Date(endTime).getTime()
      if (!isNaN(end)) {
        setTargetTime(end)
      } else {
        console.error('Invalid endTime:', endTime)
        setTargetTime(null)
      }
    } else {
      setTargetTime(null)
    }
  }, [endTime, status, timeUntilNext])

  useEffect(() => {
    const updateCountdown = () => {
      if (targetTime !== null) {
        const now = Date.now()
        setTimeRemaining(Math.max(0, targetTime - now))
      } else {
        setTimeRemaining(0)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [targetTime])

  const formatTime = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))

    return { days, hours, minutes, seconds }
  }

  const time = formatTime(timeRemaining)

  if (status === 'cooldown') {
    return (
      <div className={styles.countdown}>
        {prizePool !== null && prizePool !== undefined && (
          <div className={styles.prizePool}>
            <div className={styles.prizeLabel}>Prize Pool</div>
            <div className={styles.prizeAmount}>{prizePool.toLocaleString()} WLD</div>
          </div>
        )}
        <div className={styles.label}>{t('eventEnded')}</div>
        <div className={styles.label}>{t('newEventStarts')}</div>
        <div className={styles.time}>
          {time.hours}{t('hours')} {time.minutes}{t('minutes')} {time.seconds}{t('seconds')}
        </div>
      </div>
    )
  }

  if (status === 'ended') {
    return (
      <div className={styles.countdown}>
        {prizePool !== null && prizePool !== undefined && (
          <div className={styles.prizePool}>
            <div className={styles.prizeLabel}>Prize Pool</div>
            <div className={styles.prizeAmount}>{prizePool.toLocaleString()} WLD</div>
          </div>
        )}
        <div className={styles.label}>{t('eventEnded')}</div>
        <div className={styles.label}>{t('newEventStarts')}</div>
        <div className={styles.time}>
          {time.hours}{t('hours')} {time.minutes}{t('minutes')} {time.seconds}{t('seconds')}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.countdown}>
      {prizePool !== null && prizePool !== undefined && (
        <div className={styles.prizePool}>
          <div className={styles.prizeLabel}>Prize Pool</div>
          <div className={styles.prizeAmount}>{prizePool.toLocaleString()} WLD</div>
        </div>
      )}
      <div className={styles.label}>{t('eventEnds')}</div>
      <div className={styles.time}>
        {time.days > 0 && <span>{time.days}{t('days')} </span>}
        {time.hours}{t('hours')} {time.minutes}{t('minutes')} {time.seconds}{t('seconds')}
      </div>
    </div>
  )
}
