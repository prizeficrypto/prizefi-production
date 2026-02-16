import enTranslations from '@/locales/en/common.json'
import filTranslations from '@/locales/fil/common.json'
import idTranslations from '@/locales/id/common.json'
import esTranslations from '@/locales/es/common.json'
import frTranslations from '@/locales/fr/common.json'
import deTranslations from '@/locales/de/common.json'
import msTranslations from '@/locales/ms/common.json'
import plTranslations from '@/locales/pl/common.json'
import ptTranslations from '@/locales/pt/common.json'
import jaTranslations from '@/locales/ja/common.json'
import koTranslations from '@/locales/ko/common.json'
import thTranslations from '@/locales/th/common.json'
import hiTranslations from '@/locales/hi/common.json'

export type Language = 'en' | 'fil' | 'id' | 'es' | 'fr' | 'de' | 'ms' | 'pl' | 'pt' | 'ja' | 'ko' | 'th' | 'hi'

export const translations = {
  en: enTranslations,
  fil: filTranslations,
  id: idTranslations,
  es: esTranslations,
  fr: frTranslations,
  de: deTranslations,
  ms: msTranslations,
  pl: plTranslations,
  pt: ptTranslations,
  ja: jaTranslations,
  ko: koTranslations,
  th: thTranslations,
  hi: hiTranslations
}

const SUPPORTED_LANGUAGES: Language[] = ['en', 'es', 'fr', 'de', 'pt', 'id', 'ms', 'fil', 'pl', 'ja', 'ko', 'th', 'hi']

export type TranslationKey = keyof typeof enTranslations

export function getTranslation(lang: Language, key: TranslationKey): string {
  return translations[lang]?.[key] || translations.en[key]
}

export function isValidLanguage(lang: string): lang is Language {
  return SUPPORTED_LANGUAGES.includes(lang as Language)
}

export function detectDeviceLanguage(): Language {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const browserLang = navigator.language.toLowerCase()
  
  if (browserLang.startsWith('fil') || browserLang.startsWith('tl')) return 'fil'
  if (browserLang.startsWith('id')) return 'id'
  if (browserLang.startsWith('es')) return 'es'
  if (browserLang.startsWith('fr')) return 'fr'
  if (browserLang.startsWith('de')) return 'de'
  if (browserLang.startsWith('ms')) return 'ms'
  if (browserLang.startsWith('pl')) return 'pl'
  if (browserLang.startsWith('pt')) return 'pt'
  if (browserLang.startsWith('ja')) return 'ja'
  if (browserLang.startsWith('ko')) return 'ko'
  if (browserLang.startsWith('th')) return 'th'
  if (browserLang.startsWith('hi')) return 'hi'
  
  return 'en'
}
