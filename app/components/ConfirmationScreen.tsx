'use client'

import { useLanguage } from '../contexts/LanguageContext'
import styles from './ConfirmationScreen.module.css'

interface ConfirmationScreenProps {
  onStartMatch: () => void
  onViewRules: () => void
  onBack: () => void
}

export default function ConfirmationScreen({ onStartMatch, onViewRules, onBack }: ConfirmationScreenProps) {
  const { t } = useLanguage()

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1 className={styles.title}>{t('youAreIn')}</h1>
        <p className={styles.description}>{t('matchStructureDesc')}</p>
        
        <div className={styles.oneChance}>
          <span className={styles.warning}>⚠️</span>
          <p>{t('oneChanceWarning')}</p>
        </div>

        <div className={styles.actions}>
          <button className="btn btn-primary" onClick={onStartMatch}>
            {t('startMatch')}
          </button>
          <button className="btn btn-secondary" onClick={onViewRules}>
            {t('rules')}
          </button>
          <button className={styles.backLink} onClick={onBack}>
            ← {t('back')}
          </button>
        </div>
      </div>
    </div>
  )
}
