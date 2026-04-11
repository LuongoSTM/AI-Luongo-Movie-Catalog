import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

export function getGenAI() {
  if (!genAI) {
    // In Vite, process.env is replaced by the 'define' plugin
    const getKeys = () => {
      const p = typeof process !== 'undefined' ? process.env : {};
      const m = (import.meta as any).env || {};
      return [
        { name: 'CHIAVE_PERSONALE', value: p?.CHIAVE_PERSONALE || m?.VITE_CHIAVE_PERSONALE },
        { name: 'GEMINI_API_KEY', value: p?.GEMINI_API_KEY || m?.VITE_GEMINI_API_KEY },
        { name: 'GOOGLE_API_KEY', value: p?.GOOGLE_API_KEY || m?.VITE_GOOGLE_API_KEY }
      ];
    };

    const allKeys = getKeys().filter(k => k.value && typeof k.value === 'string' && k.value.trim() !== "");
    
    // Priorità 1: Chiavi che sembrano reali (iniziano con AIza)
    let selected = allKeys.find(k => k.value.startsWith("AIza"));
    
    // Priorità 2: Se non ci sono chiavi "reali", preferisci CHIAVE_PERSONALE
    if (!selected) {
      selected = allKeys.find(k => k.name === 'CHIAVE_PERSONALE');
    }
    
    // Priorità 3: Qualsiasi cosa sia rimasta
    if (!selected) {
      selected = allKeys[0];
    }

    const apiKey = selected?.value;
    const keyName = selected?.name || "NESSUNA";
    
    console.log("Debug AI: Verificando configurazione...");
    console.log("Debug AI: Variabile selezionata:", keyName);
    
    const obfuscate = (key: any) => {
      if (!key || typeof key !== 'string') return "null/undefined";
      if (key.length < 8) return "*** (too short)";
      return key.substring(0, 4) + "..." + key.substring(key.length - 4);
    };

    console.log("Debug AI: Chiave rilevata:", obfuscate(apiKey));
    
    const isPlaceholder = (key: any) => {
      if (!key || typeof key !== 'string') return true;
      const p = key.toUpperCase();
      return p.includes("YOUR_API_KEY") || 
             p.includes("INSERISCI_QUI") || 
             p.includes("MY_GEMINI_API_KEY") ||
             p.includes("FREE TIER") ||
             p.trim() === "" ||
             p.length < 10;
    };

    if (isPlaceholder(apiKey)) {
      console.error("Debug AI: Chiave API non trovata o non valida.");
      throw new Error(`API_KEY_MISSING|${keyName}|${obfuscate(apiKey)}`);
    }
    
    genAI = new GoogleGenAI({ apiKey: apiKey!.trim() });
    console.log("Debug AI: Client inizializzato con successo.");
  }
  return genAI as GoogleGenAI;
}

export function getApiKeyStatus() {
  try {
    const p = typeof process !== 'undefined' ? process.env : {};
    const m = (import.meta as any).env || {};
    const keys = [
      { name: 'CHIAVE_PERSONALE', value: p?.CHIAVE_PERSONALE || m?.VITE_CHIAVE_PERSONALE },
      { name: 'GEMINI_API_KEY', value: p?.GEMINI_API_KEY || m?.VITE_GEMINI_API_KEY },
      { name: 'GOOGLE_API_KEY', value: p?.GOOGLE_API_KEY || m?.VITE_GOOGLE_API_KEY }
    ].filter(k => k.value && typeof k.value === 'string' && k.value.trim() !== "");

    if (keys.length === 0) return "NOT_FOUND";

    let selected = keys.find(k => k.value.startsWith("AIza")) || keys.find(k => k.name === 'CHIAVE_PERSONALE') || keys[0];
    const key = selected.value;
    const name = selected.name;

    if (key.length < 10) return `TOO_SHORT (${name}: ${key.length} chars)`;
    if (key.includes("INSERISCI") || key.includes("YOUR_API") || key.includes("MY_GEMINI") || key.toUpperCase().includes("FREE TIER")) {
      return `PLACEHOLDER (${name}: ${key})`;
    }
    return `FOUND (${name}: ${key.substring(0, 4)}...${key.substring(key.length - 4)})`;
  } catch (e) {
    return "ERROR_CHECKING";
  }
}
