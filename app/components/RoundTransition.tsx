'use client'

import { useLanguage } from '../contexts/LanguageContext'
import styles from './RoundTransition.module.css'

interface RoundTransitionProps {
  roundScore: number
  matchTotal: number
  currentRound: number
  totalRounds: number
  onContinue: () => void
}

export default function RoundTransition({ 
  roundScore, 
  matchTotal, 
  currentRound, 
  totalRounds,
  onContinue 
}: RoundTransitionProps) {
  const { t } = useLanguage()
  const nextRound = currentRound + 1

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('roundComplete')}</h1>
        
        <div className={styles.scores}>
          <div className={styles.scoreRow}>
            <span className={styles.label}>{t('roundScore')}</span>
            <span className={styles.value}>{roundScore}</span>
          </div>
          <div className={styles.scoreRow}>
            <span className={styles.label}>{t('matchTotal')}</span>
            <span className={styles.totalValue}>{matchTotal}</span>
          </div>
        </div>

        <div className={styles.progress}>
          {[1, 2, 3].map(r => (
            <div 
              key={r} 
              className={`${styles.dot} ${r <= currentRound ? styles.completed : ''} ${r === nextRound ? styles.next : ''}`}
            >
              {r}
            </div>
          ))}
        </div>

        <p className={styles.nextLabel}>
          {t('nextRound')} {nextRound} {t('of')} {totalRounds}
        </p>

        <button className="btn btn-primary" onClick={onContinue}>
          {t('continue')}
        </button>
      </div>
    </div>
  )
}
