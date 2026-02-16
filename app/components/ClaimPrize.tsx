'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLanguage } from '../contexts/LanguageContext'
import { useSession } from '../contexts/SessionContext'
import { ethers } from 'ethers'
import styles from './ClaimPrize.module.css'

interface ClaimPrizeProps {
  eventId: number
}

export default function ClaimPrize({ eventId }: ClaimPrizeProps) {
  const { t } = useLanguage()
  const { session } = useSession()
  const searchParams = useSearchParams()
  const isPreviewMode = searchParams.get('preview_winner') === 'true'
  
  const [claimData, setClaimData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isPreviewMode) {
      setClaimData({
        isWinner: true,
        amount: ethers.parseEther('250').toString(),
        proof: []
      })
      setLoading(false)
      return
    }
    
    if (session?.address) {
      fetchClaimData()
    }
  }, [session?.address, eventId, isPreviewMode])

  const fetchClaimData = async () => {
    if (!session?.address) return

    try {
      const response = await fetch(
        `/api/event/claim-data?eventId=${eventId}&address=${session.address}`
      )
      
      if (response.ok) {
        const data = await response.json()
        setClaimData(data)
      }
    } catch (err) {
      console.error('Error fetching claim data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return null
  }

  if (!claimData?.isWinner) {
    return null
  }

  const prizeAmount = ethers.formatEther(claimData.amount)
  
  const DISCORD_INVITE_URL = 'https://discord.gg/nekBauET'

  return (
    <div className={styles.container}>
      <div className={styles.prizeInfo}>
        <div className={styles.label}>{t('prize')}</div>
        <div className={styles.amount}>{prizeAmount} WLD</div>
      </div>

      <div className={styles.payoutInfo}>
        <div className={styles.payoutNote}>
          Please be patient, as prizes are manually distributed. The distribution can take up to 24 hours.
        </div>
        <div className={styles.payoutNote} style={{ marginTop: '8px' }}>
          If it isn't delivered by then, please contact our mods on the Discord server.
        </div>
        <a 
          href={DISCORD_INVITE_URL} 
          target="_blank" 
          rel="noopener noreferrer"
          className={styles.discordButton}
        >
          <svg className={styles.discordIcon} viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
          </svg>
          Join Discord for Support
        </a>
      </div>
    </div>
  )
}
