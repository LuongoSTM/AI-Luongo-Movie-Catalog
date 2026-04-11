import React, { useState, useRef, useEffect } from 'react';
import { Type } from '@google/genai';
import { getGenAI, getApiKeyStatus } from './lib/gemini';
import { FolderOpen, Sparkles, Download, CheckCircle2, FileVideo, AlertCircle, AlertTriangle, FileText, ChevronDown, ChevronUp, ArrowLeft, Save, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { Logo } from './components/Logo';

// AI client is now initialized lazily via getGenAI()

declare global {
  interface Window {
    showDirectoryPicker(options?: any): Promise<any>;
  }
}

interface FileData {
  originalName: string;
  relativePath: string;
  relativeDir: string;
  nameWithoutExt: string;
  extension: string;
  isAlreadyCorrect: boolean;
  fileHandle?: any;
}

interface AnalyzedFile {
  originalName: string;
  relativePath: string;
  relativeDir: string;
  cleanTitle: string;
  year: string;
  originalTitle?: string;
  director?: string;
  actors?: string[];
  edition?: string;
  extension: string;
  proposedName: string;
  selected: boolean;
  isAlreadyCorrect: boolean;
  hasConflict?: boolean;
}

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
const CORRECT_PATTERN = /^.+ \(\d{4}\)$/;
const DIRTY_PATTERN = /(1080p|720p|2160p|4k|bluray|bdrip|brrip|dvdrip|web-dl|webrip|x264|h264|hevc|x265|ita|eng|dts|ac3|aac|multisub|remux|xvid|divx)/i;

export default function MovieRenamer({ onBack }: { onBack: () => void }) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [analyzedFiles, setAnalyzedFiles] = useState<AnalyzedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSecurityError, setIsSecurityError] = useState(false);
  const [isIframe, setIsIframe] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'to_rename' | 'correct' | 'problematic'>('all');
  const [scriptTypeToGenerate, setScriptTypeToGenerate] = useState<'windows' | 'mac' | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleRowExpansion = (originalName: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [originalName]: !prev[originalName]
    }));
  };

  useEffect(() => {
    setIsIframe(window.self !== window.top);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const scanDirectoryForVideos = async (dirHandle: any, path = '', depth = 0): Promise<FileData[]> => {
    if (depth > 4) return []; // Limite di profondità per evitare blocchi
    let foundFiles: FileData[] = [];
    const IGNORED_DIRS = ['.git', '.trashes', 'system volume information', 'node_modules', '$recycle.bin'];
    let iterations = 0;
    
    try {
      for await (const entry of dirHandle.values()) {
        iterations++;
        if (iterations % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
        
        if (entry.kind === 'directory') {
          const lowerName = entry.name.toLowerCase();
          if (entry.name.startsWith('.') || IGNORED_DIRS.includes(lowerName)) continue;
          
          const subFiles = await scanDirectoryForVideos(entry, path + entry.name + '/', depth + 1);
          foundFiles = foundFiles.concat(subFiles);
        } else if (entry.kind === 'file') {
          const name = entry.name as string;
          const lowerName = name.toLowerCase();
          if (VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
            const lastDotIndex = name.lastIndexOf('.');
            const nameWithoutExt = name.substring(0, lastDotIndex);
            const extension = name.substring(lastDotIndex);
            const isAlreadyCorrect = CORRECT_PATTERN.test(nameWithoutExt) && !DIRTY_PATTERN.test(nameWithoutExt);
            
            foundFiles.push({
              originalName: name,
              relativePath: path + name,
              relativeDir: path,
              nameWithoutExt,
              extension,
              isAlreadyCorrect,
              fileHandle: entry
            });
          }
        }
      }
    } catch (e) {
      console.error("Error scanning directory:", e);
    }
    return foundFiles;
  };

  const handleFolderSelect = async () => {
    try {
      if (!window.showDirectoryPicker) {
        setError("Il tuo browser non supporta la File System Access API. Usa Chrome o Edge su PC.");
        return;
      }
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setDirHandle(handle);
      
      setLoading(true);
      setError('');
      setIsSecurityError(false);
      const videoFiles = await scanDirectoryForVideos(handle);
      setLoading(false);
      
      setFiles(videoFiles);
      setAnalyzedFiles([]);
      
      if (videoFiles.length === 0) {
        setError("Nessun file video trovato in questa cartella o nelle sue sottocartelle.");
      }
    } catch (error: any) {
      setLoading(false);
      console.error("Errore selezione cartella:", error);
      if (error.name === 'SecurityError' || error.message?.includes('Cross origin sub frames')) {
        setIsSecurityError(true);
        setError("SICUREZZA BROWSER: Per rinominare i file, l'app deve avere accesso diretto al disco. Questo è bloccato nell'anteprima.");
      } else if (error.name !== 'AbortError') {
        setError(`Errore durante la selezione: ${error.message || 'Impossibile accedere alla cartella'}. Assicurati di non selezionare un'intera unità di sistema (es. C:).`);
      }
    }
  };

  const analyzeFiles = async (specificFiles?: FileData[]) => {
    const filesToAnalyze = specificFiles || files.filter(f => !f.isAlreadyCorrect);
    if (filesToAnalyze.length === 0) return;
    
    let aiData: any[] = [];

    setLoading(true);
    setError('');

    try {
      const ai = getGenAI();
      const fileNames = filesToAnalyze.map(f => f.originalName);
      
      const prompt = specificFiles 
        ? `I have a list of messy movie filenames that were difficult to parse previously. Please try harder to extract the actual movie title, release year, original movie title (if different), director, actors, and edition details from each filename. 
        CRITICAL INSTRUCTIONS:
        1. You MUST clean the title. Replace dots and underscores with spaces.
        2. Remove all technical tags: resolution (1080p, 720p, 4k), codecs (x264, HEVC, h264), audio tags (ITA, ENG, AC3, DTS), source (Bluray, BDRip, DVDrip), and release group names.
        3. Capitalize the title correctly (e.g., "The Matrix", not "the matrix").
        4. If the release year is missing from the filename but you recognize the movie, YOU MUST PROVIDE THE CORRECT YEAR.
        5. Provide the original movie title (e.g., the English title if the filename is in Italian).
        
        Filenames:\n${JSON.stringify(fileNames)}`
        : `I have a list of messy movie filenames. Extract the actual movie title, release year, original movie title, director, actors, and edition details. 
        CRITICAL: Clean the title by replacing dots/underscores with spaces and removing all technical tags (1080p, Bluray, x264, ITA, ENG, etc.). Capitalize correctly. If the year is missing but you know the movie, provide the year.
        
        Filenames:\n${JSON.stringify(fileNames)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              results: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    originalName: { type: Type.STRING },
                    cleanTitle: { type: Type.STRING },
                    year: { type: Type.STRING },
                    originalTitle: { type: Type.STRING },
                    director: { type: Type.STRING },
                    actors: { type: Type.ARRAY, items: { type: Type.STRING } },
                    edition: { type: Type.STRING }
                  },
                  required: ["originalName", "cleanTitle", "year"]
                }
              }
            },
            required: ["results"]
          }
        }
      });

      const responseText = response.text;
      if (responseText) {
        try {
          const parsed = JSON.parse(responseText);
          if (!parsed.results || !Array.isArray(parsed.results)) {
            throw new Error("Formato JSON non valido: array 'results' mancante.");
          }
          aiData = parsed.results;
        } catch (parseErr) {
          console.error("JSON Parse Error:", parseErr, responseText);
          setError("L'Intelligenza Artificiale ha restituito dati in un formato non leggibile. Prova a riavviare l'analisi o a selezionare meno file alla volta.");
          setLoading(false);
          return;
        }
      } else {
        setError("L'IA non ha restituito alcun dato. Potrebbe esserci un problema temporaneo con il servizio. Riprova tra poco.");
        setLoading(false);
        return;
      }
    } catch (err: any) {
      console.error("API Error:", err);
      let errorMessage = "Errore sconosciuto durante l'analisi. Riprova tra poco.";
      let diagnostic = "";
      
      if (err.message?.startsWith('API_KEY_MISSING')) {
        const parts = err.message.split('|');
        const varName = parts[1] || "Sconosciuta";
        const varValue = parts[2] || "null";
        errorMessage = `CHIAVE MANCANTE: La variabile '${varName}' sembra non essere configurata correttamente.`;
        diagnostic = `Variabile rilevata: ${varName} (${varValue})`;
      } else if (err.status === 429 || err.message?.includes('429') || err.message?.toLowerCase().includes('quota')) {
        errorMessage = "LIMITE RAGGIUNTO: Hai superato la quota gratuita. Attendi un minuto e riprova.";
      } else if (err.status === 401 || err.status === 403 || err.message?.toLowerCase().includes('api key')) {
        errorMessage = "CHIAVE NON VALIDA: La chiave API inserita nei Settings non è corretta o non ha i permessi per Gemini API.";
      } else if (err.message?.toLowerCase().includes('fetch') || err.message?.toLowerCase().includes('network')) {
        errorMessage = "Errore di rete. Controlla la tua connessione internet e riprova.";
      } else if (err.message) {
        errorMessage = `Errore durante l'analisi: ${err.message}`;
      }

      setError(
        <div className="space-y-3">
          <p>{errorMessage}</p>
          <div className="mt-4 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg text-xs font-mono text-blue-200">
            <p className="font-bold mb-1 flex items-center gap-2">
              <ShieldAlert className="w-3 h-3" /> Diagnosi Sistema:
            </p>
            <p>Stato Variabile: <span className="text-white font-bold">{getApiKeyStatus()}</span></p>
            {diagnostic && <p>Dettaglio: <span className="text-white">{diagnostic}</span></p>}
            <p className="mt-2 text-[10px] opacity-70 italic">
              Se lo stato è NOT_FOUND, la chiave non è stata salvata correttamente nel menu Secrets.
              Se è PLACEHOLDER, la chiave inserita non sembra valida.
            </p>
          </div>
        </div>
      );
      setLoading(false);
      return;
    }

    setAnalyzedFiles(prev => {
      const baseFiles = specificFiles ? prev : files.map(file => {
        if (file.isAlreadyCorrect) {
          return {
            originalName: file.originalName,
            relativePath: file.relativePath,
            relativeDir: file.relativeDir,
            cleanTitle: file.nameWithoutExt.replace(/ \(\d{4}\)$/, ''),
            year: file.nameWithoutExt.match(/\((\d{4})\)$/)?.[1] || '',
            originalTitle: '',
            director: '',
            actors: [],
            edition: '',
            extension: file.extension,
            proposedName: file.originalName,
            selected: false,
            isAlreadyCorrect: true
          };
        }
        return {
          originalName: file.originalName,
          relativePath: file.relativePath,
          relativeDir: file.relativeDir,
          cleanTitle: file.nameWithoutExt,
          year: '',
          originalTitle: '',
          director: '',
          actors: [],
          edition: '',
          extension: file.extension,
          proposedName: file.originalName,
          selected: false,
          isAlreadyCorrect: false
        };
      });

      const merged = baseFiles.map(file => {
        if (file.isAlreadyCorrect) return file;
        
        const data = aiData.find((d: any) => d.originalName === file.originalName);
        if (!data && specificFiles) return file; // Keep existing if not re-analyzed

        const cleanTitle = (data?.cleanTitle || file.cleanTitle).replace(/[\n\r]/g, ' ');
        const yearData = (data?.year || '').replace(/[\n\r]/g, ' ').trim();
        const year = yearData ? ` (${yearData})` : '';
        const originalTitle = (data?.originalTitle || '').replace(/[\n\r]/g, ' ').trim();
        const director = (data?.director || '').replace(/[\n\r]/g, ' ').trim();
        const actors = Array.isArray(data?.actors) ? data.actors.map((a: string) => a.replace(/[\n\r]/g, ' ').trim()).filter(Boolean) : [];
        const edition = (data?.edition || '').replace(/[\n\r]/g, ' ').trim();
        
        const safeTitle = cleanTitle.replace(/[<>:"/\\|?*]+/g, '').replace(/\s+/g, ' ').trim();
        const proposedName = `${safeTitle}${year}${file.extension}`;
        
        return {
          ...file,
          cleanTitle: safeTitle,
          year: yearData,
          originalTitle,
          director,
          actors,
          edition,
          proposedName: proposedName,
          selected: proposedName !== file.originalName,
        };
      });
      
      const finalMerged = merged.map(file => {
        const hasConflict = file.originalName !== file.proposedName && 
          merged.some(other => other.originalName !== file.originalName && other.originalName === file.proposedName);
        return {
          ...file,
          hasConflict,
          selected: hasConflict ? false : file.selected
        };
      });

      return finalMerged;
    });
    
    setLoading(false);
  };

  const reanalyzeProblematicFiles = () => {
    const problematicFiles = analyzedFiles
      .filter(f => (!f.isAlreadyCorrect && f.originalName === f.proposedName) || f.hasConflict)
      .map(f => files.find(orig => orig.originalName === f.originalName))
      .filter(Boolean) as FileData[];
      
    if (problematicFiles.length > 0) {
      analyzeFiles(problematicFiles);
    }
  };

  const toggleSelection = (originalName: string) => {
    setAnalyzedFiles(prev => prev.map(f => 
      f.originalName === originalName ? { ...f, selected: !f.selected } : f
    ));
  };

  const generateScript = (os: 'windows' | 'mac') => {
    const selected = analyzedFiles.filter(f => f.selected);
    if (selected.length === 0) return;

    let scriptContent = '';
    let filename = '';

    if (os === 'windows') {
      scriptContent = '@echo off\r\nchcp 65001 > nul\r\n';
      scriptContent += 'cd /d "%~dp0"\r\n\r\n';
      scriptContent += 'echo =========================================\r\n';
      scriptContent += 'echo Inizio rinominazione dei file video...\r\n';
      scriptContent += 'echo =========================================\r\n\r\n';

      selected.forEach(f => {
        const safeOrig = f.relativePath.replace(/[\n\r]/g, '').replace(/\//g, '\\');
        const safeProp = f.proposedName.replace(/[\n\r]/g, '');
        
        scriptContent += `echo Rinomino: "${safeOrig}" -^> "${safeProp}"\r\n`;
        scriptContent += `if exist "${safeOrig}" (\r\n`;
        scriptContent += `    ren "${safeOrig}" "${safeProp}"\r\n`;
        scriptContent += `    if errorlevel 1 (\r\n`;
        scriptContent += `        echo [ERRORE] Impossibile rinominare il file.\r\n`;
        scriptContent += `    ) else (\r\n`;
        scriptContent += `        echo [OK] Rinominato con successo.\r\n`;
        scriptContent += `    )\r\n`;
        scriptContent += `) else (\r\n`;
        scriptContent += `    echo [ATTENZIONE] File non trovato. Assicurati che lo script sia nella cartella corretta.\r\n`;
        scriptContent += `)\r\n`;
        scriptContent += `echo.\r\n`;
      });
      scriptContent += '\r\necho =========================================\r\n';
      scriptContent += 'echo Rinominazione completata!\r\n';
      scriptContent += 'echo =========================================\r\n';
      scriptContent += 'pause\r\n';
      filename = 'rinomina_film.bat';
    } else {
      scriptContent = '#!/bin/bash\n';
      scriptContent += 'cd "$(dirname "$0")"\n\n';
      scriptContent += 'echo "========================================="\n';
      scriptContent += 'echo "Inizio rinominazione dei file video..."\n';
      scriptContent += 'echo "========================================="\n\n';

      selected.forEach(f => {
        const safeOrig = f.relativePath.replace(/[\n\r]/g, '');
        const safeProp = f.proposedName.replace(/[\n\r]/g, '');
        const dirPrefix = f.relativeDir ? f.relativeDir + '/' : '';
        
        scriptContent += `echo 'Rinomino: "${safeOrig}" -> "${safeProp}"'\n`;
        scriptContent += `if [ -f "${safeOrig}" ]; then\n`;
        scriptContent += `    mv "${safeOrig}" "${dirPrefix}${safeProp}"\n`;
        scriptContent += `    if [ $? -eq 0 ]; then\n`;
        scriptContent += `        echo "[OK] Rinominato con successo."\n`;
        scriptContent += `    else\n`;
        scriptContent += `        echo "[ERRORE] Impossibile rinominare il file."\n`;
        scriptContent += `    fi\n`;
        scriptContent += `else\n`;
        scriptContent += `    echo "[ATTENZIONE] File non trovato. Assicurati che lo script sia nella cartella corretta."\n`;
        scriptContent += `fi\n`;
        scriptContent += `echo ""\n`;
      });
      scriptContent += '\necho "========================================="\n';
      scriptContent += 'echo "Rinominazione completata!"\n';
      scriptContent += 'echo "========================================="\n';
      filename = 'rinomina_film.sh';
    }

    const blobContent = os === 'windows' ? '\uFEFF' + scriptContent : scriptContent;
    const blob = new Blob([blobContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadClick = (os: 'windows' | 'mac') => {
    setScriptTypeToGenerate(os);
    setShowConfirmDialog(true);
  };

  const confirmGenerateScript = () => {
    if (scriptTypeToGenerate) {
      generateScript(scriptTypeToGenerate);
    }
    setShowConfirmDialog(false);
    setScriptTypeToGenerate(null);
  };

  const cancelGenerateScript = () => {
    setShowConfirmDialog(false);
    setScriptTypeToGenerate(null);
  };

  const generateInstructionsPDF = () => {
    const doc = new jsPDF();
    
    // Configurazione font e colori
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(41, 128, 185);
    doc.text("AI Luongo Movie Renamer", 20, 20);
    
    doc.setFontSize(16);
    doc.setTextColor(44, 62, 80);
    doc.text("Guida all'Installazione Locale", 20, 30);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    
    let y = 45;
    const lineHeight = 7;
    
    const addLine = (text: string, isBold = false) => {
      if (isBold) doc.setFont("helvetica", "bold");
      else doc.setFont("helvetica", "normal");
      
      const lines = doc.splitTextToSize(text, 170);
      doc.text(lines, 20, y);
      y += lines.length * lineHeight;
    };

    addLine("Questa guida ti spieghera' come far funzionare l'applicazione sul tuo computer locale.", false);
    y += 5;
    
    addLine("1. Prerequisiti", true);
    addLine("- Node.js: Assicurati di aver installato Node.js (scaricabile da nodejs.org).");
    addLine("- Chiave API Gemini: Devi avere una chiave API valida di Google Gemini.");
    y += 5;

    addLine("2. Download del Progetto", true);
    addLine("- Clicca sull'icona dell'ingranaggio (Impostazioni) in alto a destra in AI Studio.");
    addLine("- Seleziona 'Esporta progetto' e scarica il file ZIP.");
    addLine("- Estrai il file ZIP in una cartella sul tuo computer.");
    y += 5;

    addLine("3. Installazione", true);
    addLine("- Apri il Terminale (o Prompt dei comandi) e naviga nella cartella estratta.");
    addLine("- Esegui il comando:  npm install");
    addLine("  (Questo scarichera' tutte le librerie necessarie).");
    y += 5;

    addLine("4. Configurazione della Chiave API", true);
    addLine("- Nella cartella del progetto, trova il file chiamato '.env.example'.");
    addLine("- Rinominalo in '.env' (senza .example).");
    addLine("- Apri il file .env con un editor di testo e inserisci la tua chiave API:");
    addLine('  GEMINI_API_KEY="INSERISCI_QUI_LA_TUA_CHIAVE"');
    y += 5;

    addLine("5. Avvio dell'Applicazione", true);
    addLine("- Nel terminale, esegui il comando:  npm run dev");
    addLine("- Il terminale mostrera' un indirizzo locale (solitamente http://localhost:3000).");
    addLine("- Apri quell'indirizzo nel tuo browser web.");
    y += 5;

    addLine("Fatto! Ora puoi usare AI Luongo Movie Renamer direttamente dal tuo PC.", true);

    doc.save("Istruzioni_Locali_Movie_Renamer.pdf");
  };

  const unmodifiedCount = analyzedFiles.filter(f => !f.isAlreadyCorrect && f.originalName === f.proposedName).length;
  const conflictCount = analyzedFiles.filter(f => f.hasConflict).length;
  const selectedCount = analyzedFiles.filter(f => f.selected).length;

  const getYearString = (yearField: string) => yearField.replace(/[() ]/g, '');
  const availableYears = Array.from(new Set(analyzedFiles.map(f => getYearString(f.year)).filter(Boolean))).sort().reverse();
  
  const filteredFiles = analyzedFiles.filter(f => {
    let statusMatch = true;
    if (filterType === 'problematic') {
      statusMatch = (!f.isAlreadyCorrect && f.originalName === f.proposedName) || !!f.hasConflict;
    } else if (filterType === 'to_rename') {
      statusMatch = !f.isAlreadyCorrect && f.originalName !== f.proposedName && !f.hasConflict;
    } else if (filterType === 'correct') {
      statusMatch = f.isAlreadyCorrect;
    }

    if (!statusMatch) return false;
    if (selectedYear === 'All') return true;
    return getYearString(f.year) === selectedYear;
  });

  const timeString = currentTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateString = currentTime.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans selection:bg-neutral-800 pt-44 pb-12 px-6 md:pt-48 md:pb-16 md:px-12">
      {isIframe && (
        <div className="mb-8 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/50 text-white p-6 rounded-2xl shadow-2xl backdrop-blur-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 rounded-2xl shadow-lg shadow-blue-500/40">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Sblocca Funzionalità Complete</h3>
              <p className="text-sm text-neutral-300">Per motivi di sicurezza del browser, l'accesso ai file locali è possibile solo aprendo l'app in una nuova scheda.</p>
            </div>
          </div>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full md:w-auto px-8 py-4 bg-white text-blue-600 hover:bg-neutral-100 rounded-xl font-black text-lg transition-all transform hover:scale-105 active:scale-95 shadow-xl"
          >
            APRI IN NUOVA SCHEDA
          </button>
        </div>
      )}
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 min-h-16 py-2 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800/60 z-50 flex items-center justify-between px-4 md:px-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-colors"
            title="Torna alla Home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-[120px] h-[120px] flex items-center justify-center">
            <Logo className="w-full h-full drop-shadow-[0_0_12px_rgba(255,0,128,0.25)]" />
          </div>
          <h1 className="font-bold text-lg md:text-xl tracking-tight bg-gradient-to-r from-white via-blue-100 to-blue-400 bg-clip-text text-transparent">
            AI Luongo Movie Renamer
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={generateInstructionsPDF}
            className="hidden sm:flex items-center gap-2 text-neutral-400 hover:text-white bg-neutral-900/50 hover:bg-neutral-800 border border-neutral-800 px-3 py-1.5 rounded-xl transition-colors text-sm font-medium"
            title="Scarica istruzioni per l'uso locale"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden md:inline">Istruzioni Locali</span>
          </button>
          <span className="hidden lg:block text-neutral-400 text-sm capitalize">{dateString}</span>
          <div className="bg-black/50 border border-neutral-800 px-3 md:px-4 py-1.5 rounded-xl flex items-center gap-2 shadow-inner">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="font-mono text-blue-400 font-bold tracking-widest text-sm md:text-base">{timeString}</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto space-y-12">
        
        {/* Header */}
        <header className="text-center space-y-4">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            AI Movie <span className="text-blue-500">Renamer</span>
          </h2>
          <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
            Seleziona la tua cartella dei film. L'Intelligenza Artificiale analizzerà i nomi dei file disordinati e genererà uno script sicuro per rinominarli con Titolo e Anno corretti.
          </p>
        </header>

        {/* Step 1: Select Folder */}
        <section className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-8 text-center">
          <input
            type="file"
            // @ts-ignore - webkitdirectory is non-standard but widely supported
            webkitdirectory="true"
            directory="true"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={handleFolderSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full font-semibold text-lg hover:bg-neutral-200 transition-colors"
          >
            <FolderOpen className="w-6 h-6" />
            Seleziona Cartella "Films"
          </button>
          
          {files.length > 0 && analyzedFiles.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 space-y-6"
            >
              <div className="text-neutral-400 max-w-3xl mx-auto">
                <div className="flex items-center justify-center gap-4 md:gap-6 mb-6">
                  <div className="bg-neutral-900 px-6 py-3 rounded-2xl border border-neutral-800 flex-1">
                    <span className="block text-2xl font-bold text-white">{files.length}</span>
                    <span className="text-xs uppercase tracking-wider text-neutral-500">Totali</span>
                  </div>
                  <div className="bg-blue-950/30 px-6 py-3 rounded-2xl border border-blue-900/50 flex-1">
                    <span className="block text-2xl font-bold text-blue-400">{files.filter(f => !f.isAlreadyCorrect).length}</span>
                    <span className="text-xs uppercase tracking-wider text-blue-500">Da Rinominare</span>
                  </div>
                  <div className="bg-green-950/30 px-6 py-3 rounded-2xl border border-green-900/50 flex-1">
                    <span className="block text-2xl font-bold text-green-400">{files.filter(f => f.isAlreadyCorrect).length}</span>
                    <span className="text-xs uppercase tracking-wider text-green-500">Già Corretti</span>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto bg-neutral-950/50 rounded-xl border border-neutral-800 p-4 text-left text-sm font-mono space-y-2 mb-6 shadow-inner">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 p-2 rounded-lg hover:bg-neutral-900/50 transition-colors">
                      <div className="truncate text-neutral-300 flex items-center gap-3">
                        <FileVideo className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                        <span className="truncate">{f.originalName}</span>
                      </div>
                      {f.isAlreadyCorrect ? (
                        <span className="flex items-center gap-1.5 text-green-400 bg-green-400/10 px-2.5 py-1 rounded-md text-xs font-sans font-medium flex-shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" /> OK
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-blue-400 bg-blue-400/10 px-2.5 py-1 rounded-md text-xs font-sans font-medium flex-shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5" /> Da elaborare
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => analyzeFiles()}
                disabled={loading || files.filter(f => !f.isAlreadyCorrect).length === 0}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-full font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                    <Sparkles className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
                {loading ? 'Analisi in corso...' : files.filter(f => !f.isAlreadyCorrect).length === 0 ? 'Tutti i file sono già corretti' : 'Analizza file da rinominare'}
              </button>
            </motion.div>
          )}
        </section>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`${isSecurityError ? 'bg-purple-900/40 border-purple-500/50' : 'bg-red-950/30 border-red-900/50'} border text-white p-6 rounded-2xl flex flex-col md:flex-row items-center gap-6 mb-6 shadow-2xl`}
            >
              <div className="flex items-center gap-4 flex-1">
                <AlertCircle className={`w-8 h-8 flex-shrink-0 ${isSecurityError ? 'text-purple-400' : 'text-red-400'}`} />
                <div>
                  <p className="font-bold text-lg">{isSecurityError ? 'Funzione Bloccata dall\'Anteprima' : 'Errore'}</p>
                  <p className="text-sm text-neutral-300">{error}</p>
                  
                  {error.includes("CHIAVE") && (
                    <div className="mt-4 p-3 bg-black/40 rounded-xl border border-white/10 text-xs font-mono space-y-2">
                      <div className="flex items-center gap-2 text-blue-400">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Diagnosi Sistema:</span>
                      </div>
                      <p className="text-neutral-400">Stato Variabile: <span className="text-white">{getApiKeyStatus()}</span></p>
                      <p className="text-neutral-500 italic">Se lo stato è NOT_FOUND, la chiave non è stata salvata correttamente nel menu Settings.</p>
                    </div>
                  )}
                </div>
              </div>
              {isSecurityError && (
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="w-full md:w-auto px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-purple-500/30 whitespace-nowrap"
                >
                  SBLOCCA ORA
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 2: Review and Download */}
        {analyzedFiles.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-blue-950/20 border border-blue-900/30 p-6 rounded-2xl">
              <div>
                <h3 className="text-xl font-semibold text-blue-400">Analisi Completata</h3>
                <p className="text-neutral-400 text-sm mt-1">
                  Controlla i nomi proposti qui sotto. Quando sei pronto, scarica lo script per rinominare i file.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center">
                <div className="flex items-center gap-2 bg-neutral-900/80 border border-neutral-800 px-3 py-1.5 rounded-lg">
                  <span className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Filtro:</span>
                  <select 
                    value={filterType} 
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="all">Tutti i file</option>
                    <option value="to_rename">Da rinominare</option>
                    <option value="correct">Già corretti</option>
                    <option value="problematic">Problematici</option>
                  </select>
                </div>
                {availableYears.length > 0 && (
                  <div className="flex items-center gap-2 bg-neutral-900/80 border border-neutral-800 px-3 py-1.5 rounded-lg">
                    <span className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Anno:</span>
                    <select 
                      value={selectedYear} 
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
                    >
                      <option value="All">Tutti</option>
                      {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDownloadClick('windows')}
                    disabled={selectedCount === 0}
                    className="inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" /> Script Windows (.bat)
                  </button>
                  <button
                    onClick={() => handleDownloadClick('mac')}
                    disabled={selectedCount === 0}
                    className="inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" /> Script Mac/Linux (.sh)
                  </button>
                </div>
              </div>
            </div>

            {unmodifiedCount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-yellow-950/30 border border-yellow-900/50 text-yellow-400 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-lg">Attenzione: {unmodifiedCount} file non modificati</h4>
                    <p className="text-sm opacity-80 mt-1">
                      L'Intelligenza Artificiale non è riuscita a proporre un nome migliore per alcuni file, oppure il nome originale era già il migliore possibile ma non corrispondeva esattamente al formato standard. Questi file sono stati deselezionati per sicurezza e non verranno inclusi nello script.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setFilterType(filterType === 'problematic' ? 'all' : 'problematic')}
                    className="flex-1 sm:flex-none px-4 py-2 bg-yellow-900/30 hover:bg-yellow-900/50 border border-yellow-700/50 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    {filterType === 'problematic' ? 'Mostra Tutti' : 'Vedi File'}
                  </button>
                  <button
                    onClick={reanalyzeProblematicFiles}
                    disabled={loading}
                    className="flex-1 sm:flex-none px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-yellow-950 rounded-xl text-sm font-bold transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    Rianalizza
                  </button>
                </div>
              </motion.div>
            )}

            {conflictCount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-950/30 border border-red-900/50 text-red-400 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-lg">Pericolo Sovrascrittura: {conflictCount} conflitti rilevati</h4>
                    <p className="text-sm opacity-80 mt-1">
                      Il nome proposto per alcuni file è identico al nome originale di altri file già presenti nella cartella. Per prevenire la perdita di dati, questi file sono stati evidenziati in rosso e deselezionati.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setFilterType(filterType === 'problematic' ? 'all' : 'problematic')}
                    className="flex-1 sm:flex-none px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    {filterType === 'problematic' ? 'Mostra Tutti' : 'Vedi File'}
                  </button>
                  <button
                    onClick={reanalyzeProblematicFiles}
                    disabled={loading}
                    className="flex-1 sm:flex-none px-4 py-2 bg-red-600 hover:bg-red-500 text-red-950 rounded-xl text-sm font-bold transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    Rianalizza
                  </button>
                </div>
              </motion.div>
            )}

            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900 text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="p-4 w-12 text-center">✓</th>
                      <th className="p-4">Stato</th>
                      <th className="p-4">Nome Originale</th>
                      <th className="p-4">Nome Proposto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {filteredFiles.map((file, idx) => (
                      <tr 
                        key={idx} 
                        className={`transition-colors hover:bg-neutral-800/30 ${!file.selected && !file.isAlreadyCorrect && !file.hasConflict ? 'opacity-50' : ''} ${file.isAlreadyCorrect ? 'bg-green-950/5' : ''} ${file.hasConflict ? 'bg-red-950/10' : ''}`}
                      >
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={file.selected}
                            disabled={file.isAlreadyCorrect || file.originalName === file.proposedName || file.hasConflict}
                            onChange={() => toggleSelection(file.originalName)}
                            className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900 disabled:opacity-30"
                          />
                        </td>
                        <td className="p-4">
                          {file.hasConflict ? (
                            <span className="inline-flex items-center gap-1.5 text-red-400 bg-red-400/10 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap">
                              <AlertCircle className="w-3.5 h-3.5" /> Conflitto
                            </span>
                          ) : file.isAlreadyCorrect ? (
                            <span className="inline-flex items-center gap-1.5 text-green-400 bg-green-400/10 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Già Corretto
                            </span>
                          ) : file.originalName === file.proposedName ? (
                            <span className="inline-flex items-center gap-1.5 text-yellow-400 bg-yellow-400/10 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap">
                              <AlertTriangle className="w-3.5 h-3.5" /> Nessuna Modifica
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-blue-400 bg-blue-400/10 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap">
                              <Sparkles className="w-3.5 h-3.5" /> Nuovo Nome
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-neutral-400 font-mono text-xs break-all">
                          {file.originalName}
                        </td>
                        <td className={`p-4 font-medium break-all ${file.isAlreadyCorrect || file.originalName === file.proposedName ? 'text-neutral-500' : 'text-green-400'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span>{file.proposedName}</span>
                            {(file.originalTitle || file.director || (file.actors && file.actors.length > 0) || file.edition || file.year) && (
                              <button 
                                onClick={() => toggleRowExpansion(file.originalName)} 
                                className="p-1.5 hover:bg-neutral-800/80 rounded-md text-neutral-400 hover:text-white transition-colors flex-shrink-0"
                                title="Mostra/Nascondi Metadati"
                              >
                                {expandedRows[file.originalName] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                          <AnimatePresence>
                            {expandedRows[file.originalName] && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="text-xs text-neutral-300 mt-3 p-3 bg-neutral-950/50 rounded-lg border border-neutral-800/50 space-y-1.5 font-sans">
                                  {file.year && <div><span className="font-semibold text-neutral-500 mr-1">Anno:</span> {file.year}</div>}
                                  {file.originalTitle && <div><span className="font-semibold text-neutral-500 mr-1">Titolo Originale:</span> {file.originalTitle}</div>}
                                  {file.director && <div><span className="font-semibold text-neutral-500 mr-1">Regia:</span> {file.director}</div>}
                                  {file.actors && file.actors.length > 0 && <div><span className="font-semibold text-neutral-500 mr-1">Cast:</span> {file.actors.join(', ')}</div>}
                                  {file.edition && <div><span className="font-semibold text-neutral-500 mr-1">Edizione:</span> {file.edition}</div>}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.section>
        )}
        {/* Confirmation Dialog */}
        <AnimatePresence>
          {showConfirmDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={cancelGenerateScript}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-neutral-900 border border-neutral-800 p-6 md:p-8 rounded-3xl max-w-md w-full shadow-2xl"
              >
                <h3 className="text-2xl font-bold text-white mb-2">Conferma Download</h3>
                <div className="text-neutral-400 mb-6 space-y-3">
                  <p>
                    Stai per scaricare uno script che rinominerà <strong className="text-white">{selectedCount}</strong> file video.
                  </p>
                  <div className="bg-blue-950/30 border border-blue-900/50 p-4 rounded-xl text-sm">
                    <strong className="text-blue-400 block mb-1">⚠️ Istruzione Importante:</strong>
                    Per funzionare correttamente su qualsiasi cartella o disco esterno, dovrai <strong>spostare il file scaricato all'interno della cartella che contiene i tuoi film</strong> prima di fare doppio clic per avviarlo.
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={cancelGenerateScript}
                    className="px-5 py-2.5 rounded-xl font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={confirmGenerateScript}
                    className="px-5 py-2.5 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Scarica Script
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
