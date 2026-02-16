'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface RoundScore {
  round: number
  score: number
  seed: string
}

interface MatchState {
  active: boolean
  currentRound: number
  totalRounds: number
  roundScores: RoundScore[]
  matchToken: string
  eventId: number | null
  startedAt: number
}

interface GameContextType {
  gameState: 'idle' | 'confirmation' | 'playing' | 'roundComplete' | 'matchComplete' | 'finished'
  setGameState: (state: 'idle' | 'confirmation' | 'playing' | 'roundComplete' | 'matchComplete' | 'finished') => void
  currentScore: number
  setCurrentScore: (score: number) => void
  currentSeed: string
  setCurrentSeed: (seed: string) => void
  match: MatchState
  startMatch: (eventId: number, matchToken: string) => void
  recordRoundScore: (score: number, seed: string) => void
  nextRound: () => void
  endMatch: () => void
  resetMatch: () => void
  getFinalScore: () => number
}

const initialMatchState: MatchState = {
  active: false,
  currentRound: 0,
  totalRounds: 1,
  roundScores: [],
  matchToken: '',
  eventId: null,
  startedAt: 0
}

const GameContext = createContext<GameContextType | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<'idle' | 'confirmation' | 'playing' | 'roundComplete' | 'matchComplete' | 'finished'>('idle')
  const [currentScore, setCurrentScore] = useState(0)
  const [currentSeed, setCurrentSeed] = useState('')
  const [match, setMatch] = useState<MatchState>(initialMatchState)

  const startMatch = (eventId: number, matchToken: string) => {
    setMatch({
      active: true,
      currentRound: 1,
      totalRounds: 1,
      roundScores: [],
      matchToken,
      eventId,
      startedAt: Date.now()
    })
  }

  const recordRoundScore = (score: number, seed: string) => {
    setMatch(prev => ({
      ...prev,
      roundScores: [...prev.roundScores, { round: prev.currentRound, score, seed }]
    }))
  }

  const nextRound = () => {
    setMatch(prev => ({
      ...prev,
      currentRound: prev.currentRound + 1
    }))
  }

  const endMatch = () => {
    setMatch(prev => ({
      ...prev,
      active: false
    }))
  }

  const resetMatch = () => {
    setMatch(initialMatchState)
  }

  const getFinalScore = () => {
    return match.roundScores.reduce((total, rs) => total + rs.score, 0)
  }

  return (
    <GameContext.Provider
      value={{
        gameState,
        setGameState,
        currentScore,
        setCurrentScore,
        currentSeed,
        setCurrentSeed,
        match,
        startMatch,
        recordRoundScore,
        nextRound,
        endMatch,
        resetMatch,
        getFinalScore,
      }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within GameProvider')
  }
  return context
}
