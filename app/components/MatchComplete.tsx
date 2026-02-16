'use client'

import { useLanguage } from '../contexts/LanguageContext'
import styles from './MatchComplete.module.css'

interface MatchCompleteProps {
  finalScore: number
  onClose: () => void
}

export default function MatchComplete({ 
  finalScore,
  onClose
}: MatchCompleteProps) {
  const { t } = useLanguage()

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('matchComplete')}</h1>
        
        <div className={styles.finalScore}>
          <span className={styles.finalLabel}>{t('finalScore')}</span>
          <span className={styles.finalValue}>{finalScore}</span>
        </div>

        <div className={styles.actions}>
          <button className="btn btn-primary" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
