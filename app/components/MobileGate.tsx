"use client";
import React from "react";
import { useLanguage } from "../contexts/LanguageContext";

export default function MobileGate({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  
  return (
    <div style={{ position:"fixed", inset:0, display:"grid", placeItems:"center", background:"rgba(0,0,0,0.5)", zIndex:1000 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:20, width:320, textAlign:"center" }}>
        <h3 style={{ marginBottom:12 }}>PrizeFi</h3>
        <p style={{ marginBottom:16 }}>
          {t('worldAppRequired')}
        </p>
        <button onClick={() => location.reload()} style={{ padding:"10px 16px", borderRadius:12 }}>OK</button>
      </div>
    </div>
  );
}
