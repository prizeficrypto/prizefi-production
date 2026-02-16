'use client';

import { ReactNode, useEffect } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

export default function MiniKitProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_MINIKIT_PROJECT_ID;
    
    console.log('🔧 Initializing MiniKit with App ID:', appId);
    
    if (appId) {
      MiniKit.install(appId);
    } else {
      console.error('❌ NEXT_PUBLIC_MINIKIT_PROJECT_ID is not set!');
      MiniKit.install();
    }
    
    console.log('✅ MiniKit initialized. isInstalled:', MiniKit.isInstalled());
  }, []);

  return <>{children}</>;
}
