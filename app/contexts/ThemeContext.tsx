'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  mounted: boolean
  colors: {
    background: string
    backgroundSecondary: string
    text: string
    textSecondary: string
    primary: string
    accent: string
    success: string
    cardBg: string
    cardBorder: string
    trackColor: string
    glowColor: string
  }
}

const lightColors = {
  background: '#f0f4f8',
  backgroundSecondary: '#e2e8f0',
  text: '#1a202c',
  textSecondary: '#4a5568',
  primary: '#3b82f6',
  accent: '#f59e0b',
  success: '#22c55e',
  cardBg: '#ffffff',
  cardBorder: '#cbd5e1',
  trackColor: '#94a3b8',
  glowColor: '#3b82f6'
}

const darkColors = {
  background: '#1a1a2e',
  backgroundSecondary: '#16213e',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  primary: '#3b82f6',
  accent: '#fbbf24',
  success: '#22c55e',
  cardBg: '#0f3460',
  cardBorder: '#4a5568',
  trackColor: '#4a5568',
  glowColor: '#22c55e'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_KEY = 'prizefi_theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme: Theme = 'light'
  const mounted = true

  useEffect(() => {
    if (typeof window === 'undefined') return
    document.documentElement.setAttribute('data-theme', 'light')
  }, [])

  const setTheme = () => {}

  const colors = lightColors

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mounted, colors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
