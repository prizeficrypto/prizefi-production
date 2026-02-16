'use client'

import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { Language } from '../lib/i18n'
import styles from './WelcomeSetup.module.css'

interface WelcomeSetupProps {
  onComplete: () => void
}

const SETUP_KEY = 'prizefi_setup_complete_v3'

export function useWelcomeSetup() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  
  useEffect(() => {
    if (typeof window === 'undefined') return
    const done = localStorage.getItem(SETUP_KEY)
    setNeedsSetup(!done)
  }, [])
  
  const markComplete = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETUP_KEY, 'true')
    }
    setNeedsSetup(false)
  }
  
  return { needsSetup, markComplete }
}

const NON_LATIN_LANGS = ['ja', 'ko', 'th', 'hi']

const languages: { code: Language; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'id', name: 'Indonesian', native: 'Indonesia' },
  { code: 'ms', name: 'Malay', native: 'Melayu' },
  { code: 'fil', name: 'Filipino', native: 'Filipino' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'hi', name: 'Hindi', native: 'हिंदी' },
]

export default function WelcomeSetup({ onComplete }: WelcomeSetupProps) {
  const { language, setLanguage, t } = useLanguage()
  const [selectedLang, setSelectedLang] = useState<Language>(language)

  const handleLanguageSelect = (lang: Language) => {
    setSelectedLang(lang)
    setLanguage(lang)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('welcomeSetup')}</h1>
          <p className={styles.subtitle}>{t('selectLanguage')}</p>
        </div>

        <div className={styles.section}>
          <div className={styles.languageGrid}>
            {languages.map((lang) => (
              <button
                key={lang.code}
                className={`${styles.langButton} ${selectedLang === lang.code ? styles.selected : ''}`}
                onClick={() => handleLanguageSelect(lang.code)}
              >
                <span className={`${styles.langNative} ${NON_LATIN_LANGS.includes(lang.code) ? styles.nonLatin : ''}`}>{lang.native}</span>
              </button>
            ))}
          </div>
        </div>

        <button className={styles.continueBtn} onClick={onComplete}>
          {t('letsGo')}
        </button>
      </div>
    </div>
  )
}
