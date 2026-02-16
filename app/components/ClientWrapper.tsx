'use client'

import { Suspense } from 'react'
import WinnerPopup from './WinnerPopup'

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <WinnerPopup />
      </Suspense>
    </>
  )
}
