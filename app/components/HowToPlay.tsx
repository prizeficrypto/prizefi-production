'use client'

import { useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import styles from './HowToPlay.module.css'

export default function HowToPlay() {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useLanguage()

  return (
    <div className={styles.container}>
      <button 
        className={styles.toggle}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{t('howToPlay')}</span>
        <span className={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <div className={styles.content}>
          <div className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <p>{t('howStep1')}</p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <p>{t('howStep2')}</p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <p>{t('howStep3')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
