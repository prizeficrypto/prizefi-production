'use client'

import { useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import styles from './HowToPlay.module.css'

export default function WhatIsPrizeFi() {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useLanguage()

  return (
    <div className={styles.container}>
      <button 
        className={styles.toggle}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{t('whatIsPrizeFi')}</span>
        <span className={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <div className={styles.content}>
          <p className={styles.description}>{t('whatIsPrizeFiDesc')}</p>
        </div>
      )}
    </div>
  )
}
