'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Language, getTranslation, TranslationKey, detectDeviceLanguage } from '../lib/i18n'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const SUPPORTED_LANGUAGES: Language[] = ['en', 'fil', 'id', 'es', 'fr', 'de', 'ms', 'pl', 'pt']

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    const saved = localStorage.getItem('language') as Language
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      setLanguageState(saved)
    } else {
      const deviceLang = detectDeviceLanguage()
      if (SUPPORTED_LANGUAGES.includes(deviceLang)) {
        setLanguageState(deviceLang)
        localStorage.setItem('language', deviceLang)
      } else {
        setLanguageState('en')
        localStorage.setItem('language', 'en')
      }
    }
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('language', lang)
  }

  const t = (key: TranslationKey) => getTranslation(language, key)

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
