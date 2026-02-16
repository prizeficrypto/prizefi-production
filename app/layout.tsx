import type { Metadata, Viewport } from 'next'
import { Press_Start_2P } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import MiniKitProvider from './components/MiniKitProvider'
import { SessionProvider } from './contexts/SessionContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { GameProvider } from './contexts/GameContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ErrorBoundary } from '../components/ErrorBoundary'
import ClientWrapper from './components/ClientWrapper'

const pressStart = Press_Start_2P({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-retro',
})

export const metadata: Metadata = {
  title: 'PrizeFi',
  description: 'Play. Climb the ranks. Win WLD.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={pressStart.variable}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          .bottom-nav-fixed {
            position: fixed !important;
            bottom: 16px !important;
            left: 16px !important;
            right: 16px !important;
            display: flex !important;
            justify-content: space-around !important;
            align-items: center !important;
            background: rgba(255, 255, 255, 0.15) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
            padding: 10px 16px !important;
            padding-bottom: max(10px, env(safe-area-inset-bottom)) !important;
            z-index: 9999 !important;
            min-height: 56px !important;
            border-radius: 24px !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
          }
        `}} />
      </head>
      <body>
        <ErrorBoundary>
          <MiniKitProvider>
            <ThemeProvider>
              <LanguageProvider>
                <SessionProvider>
                  <GameProvider>
                    <ClientWrapper>
                      {children}
                    </ClientWrapper>
                  </GameProvider>
                </SessionProvider>
              </LanguageProvider>
            </ThemeProvider>
          </MiniKitProvider>
        </ErrorBoundary>
        <Script
          src="https://oculus-sdk.humanlabs.world"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Script id="oculus-init" strategy="afterInteractive">
          {`
            window.oculusLayer = window.oculusLayer || [];
            function oculus() { oculusLayer.push(arguments); }
            oculus("app_id", "app_2e161af7bebc9df78073207e9d0381ba");
          `}
        </Script>
      </body>
    </html>
  )
}
