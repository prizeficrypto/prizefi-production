'use client'

import { useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import styles from './PrizeDistribution.module.css'

const PRIZE_PERCENTAGES: Record<number, number> = {
  1: 25.00,
  2: 17.00,
  3: 13.00,
  4: 11.00,
  5: 9.00,
  6: 8.00,
  7: 7.00,
  8: 5.00,
  9: 3.00,
  10: 2.00,
}

export default function PrizeDistribution() {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useLanguage()

  return (
    <div className={styles.container}>
      <button 
        className={styles.toggle}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{t('prizeDistributionTitle')}</span>
        <span className={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <div className={styles.content}>
          <p className={styles.description}>{t('prizeDistributionDesc')}</p>
          <div className={styles.table}>
            <div className={styles.headerRow}>
              <span className={styles.headerCell}>{t('rank')}</span>
              <span className={styles.headerCell}>{t('prizeShare')}</span>
            </div>
            {Object.entries(PRIZE_PERCENTAGES).map(([rank, percentage]) => (
              <div key={rank} className={`${styles.row} ${parseInt(rank) <= 3 ? styles.topThree : ''}`}>
                <span className={styles.rankCell}>
                  {parseInt(rank) === 1 && '🥇 '}
                  {parseInt(rank) === 2 && '🥈 '}
                  {parseInt(rank) === 3 && '🥉 '}
                  #{rank}
                </span>
                <span className={styles.percentCell}>{percentage}%</span>
              </div>
            ))}
          </div>
          <p className={styles.note}>{t('prizeDistributionNote')}</p>
        </div>
      )}
    </div>
  )
}
