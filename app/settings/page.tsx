'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import StatusBadge from '../components/StatusBadge'
import WhatIsPrizeFi from '../components/WhatIsPrizeFi'
import PrizeDistribution from '../components/PrizeDistribution'
import FAQ from '../components/FAQ'
import { useSession } from '../contexts/SessionContext'
import { useLanguage } from '../contexts/LanguageContext'
import { Language } from '../lib/i18n'
import { sounds } from '@/lib/sounds'
import styles from './settings.module.css'

export default function Settings() {
  const { session, disconnect } = useSession()
  const { language, setLanguage, t } = useLanguage()
  const router = useRouter()
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const [loadingUsername, setLoadingUsername] = useState(false)

  useEffect(() => {
    setSoundEnabled(sounds.isEnabled())
  }, [])

  useEffect(() => {
    if (session?.address) {
      fetchUsername()
    }
  }, [session?.address])

  const fetchUsername = async () => {
    if (!session?.address) return
    setLoadingUsername(true)
    
    // Use World App username from session
    if (session.username) {
      setUsername(session.username)
      setLoadingUsername(false)
      return
    }
    
    // Fallback: fetch World username from API
    try {
      const response = await fetch(`/api/world-username?address=${session.address}`)
      if (response.ok) {
        const data = await response.json()
        setUsername(data.username || null)
      }
    } catch (error) {
      console.error('Error fetching username:', error)
    } finally {
      setLoadingUsername(false)
    }
  }

  const handleSoundToggle = () => {
    const newValue = !soundEnabled
    setSoundEnabled(newValue)
    sounds.setEnabled(newValue)
    if (newValue) {
      sounds.buttonPress()
    }
  }

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
  }

  const handleDisconnect = () => {
    disconnect()
    router.push('/')
  }

  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: t('english') },
    { code: 'es', label: t('spanish') },
    { code: 'fr', label: t('french') },
    { code: 'de', label: t('german') },
    { code: 'pt', label: t('portuguese') },
    { code: 'pl', label: t('polish') },
    { code: 'ms', label: t('malay') },
    { code: 'id', label: t('indonesian') },
    { code: 'fil', label: t('filipino') },
    { code: 'ja', label: t('japanese') },
    { code: 'ko', label: t('korean') },
    { code: 'th', label: t('thai') },
    { code: 'hi', label: t('hindi') },
  ]

  return (
    <div className="container">
      <TopBar title={t('settings')} showBack={true} />
      
      <main className={styles.main}>
        <div className="card">
          <h3 className={styles.sectionTitle}>{t('walletStatus')}</h3>
          <div className={styles.infoRow}>
            <span className="text-muted">{session ? (username ? t('player') : t('wallet')) : ''}</span>
            <span className={styles.value}>
              {session ? (username || t('connected')) : t('notConnected')}
            </span>
          </div>
        </div>

        {session && (
          <div className="card">
            <h3 className={styles.sectionTitle}>{t('player')}</h3>
            <div className={styles.usernameDisplay}>
              <span className={styles.usernameText}>
                {loadingUsername ? 'Loading...' : (username || 'Not set')}
              </span>
              <span className={styles.usernameHint}>
                World App Username
              </span>
            </div>
          </div>
        )}

        <div className="card">
          <h3 className={styles.sectionTitle}>{t('verificationStatus')}</h3>
          <div className={styles.infoRow}>
            <span className="text-muted">{session ? t('verificationStatus') : ''}</span>
            {session ? (
              <StatusBadge isVerified={session.isVerified} />
            ) : (
              <span className="text-muted">{t('unknown')}</span>
            )}
          </div>
        </div>

        {session && (
          <button 
            className="btn btn-secondary"
            onClick={handleDisconnect}
          >
            {t('disconnect')}
          </button>
        )}

        <div className="card">
          <h3 className={styles.sectionTitle}>{t('soundEffects') || 'Sound Effects'}</h3>
          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>{t('gameSounds') || 'Game Sounds'}</span>
            <button 
              className={`${styles.toggleBtn} ${soundEnabled ? styles.toggleOn : styles.toggleOff}`}
              onClick={handleSoundToggle}
            >
              <span className={styles.toggleKnob}></span>
              <span className={styles.toggleText}>{soundEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className={styles.sectionTitle}>{t('language')}</h3>
          <div className={styles.languageOptions}>
            {languages.map(({ code, label }) => (
              <button
                key={code}
                className={`${styles.languageBtn} ${
                  language === code ? styles.selected : ''
                }`}
                onClick={() => handleLanguageChange(code)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <WhatIsPrizeFi />
        <PrizeDistribution />
        <FAQ />

        <div style={{ marginTop: '3rem', textAlign: 'center', paddingBottom: '2rem', display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
          <button
            onClick={() => router.push('/stats')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              opacity: 0.5,
              padding: '0.5rem',
            }}
          >
            Statistics
          </button>
          <button
            onClick={() => router.push('/admin')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              opacity: 0.5,
              padding: '0.5rem',
            }}
          >
            Admin
          </button>
        </div>
      </main>
      
      <BottomNav />
    </div>
  )
}
