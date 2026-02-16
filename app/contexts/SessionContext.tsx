'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface SessionData {
  address: string
  isVerified: boolean
  username?: string | null
  profilePictureUrl?: string | null
}

interface SessionContextType {
  session: SessionData | null
  setSession: (session: SessionData | null) => void
  disconnect: () => void
}

const SessionContext = createContext<SessionContextType | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null)

  const disconnect = () => {
    setSession(null)
  }

  return (
    <SessionContext.Provider value={{ session, setSession, disconnect }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}
