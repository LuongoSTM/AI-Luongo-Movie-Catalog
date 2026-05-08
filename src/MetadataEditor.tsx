import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Image as ImageIcon, Search, Save, X, FolderOpen, Edit2, Upload, FileVideo, AlertCircle, ShieldAlert, Sparkles, Info, CheckCircle2 } from 'lucide-react';
import { Type } from '@google/genai';
import { getGenAI, getApiKeyStatus } from './lib/gemini';
import { Logo } from './components/Logo';

declare global {
  interface Window {
    showDirectoryPicker(options?: any): Promise<any>;
  }
}

const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', 
  '.ts', '.m2ts', '.vob', '.3gp', '.mpg', '.mpeg', '.divx', '.xvid', '.asf', '.rmvb',
  '.iso', '.m2t', '.m1v', '.m2v', '.mp2', '.mpeg4', '.div', '.ogm', '.ogv', '.qt',
  '.rm', '.m4p', '.m4b', '.m4r', '.f4v', '.f4p', '.f4a', '.f4b',
  '.3g2', '.mod', '.tod', '.vro', '.dvr-ms', '.amv', '.mjp', '.mjpeg'
];

const DIRTY_PATTERN = /(1080p|720p|2160p|4k|bluray|bdrip|brrip|dvdrip|web-dl|webrip|x264|h264|hevc|x265|ita|eng|dts|ac3|aac|multisub|remux|xvid|divx|h265|h.264|h.265|10bit|hdr|dovi|vision|atvp|amzn|netflix|nf|dnp|dsnp|cyber|iamable|juggs|rarbg|ettv|tpx|tgx|psa|qxr|yify|yts|evans|galaxy|mkv|mp4|avi)/i;

interface MetadataEditorProps {
  onBack: () => void;
}

export default function MetadataEditor({ onBack }: MetadataEditorProps) {
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [videoFiles, setVideoFiles] = useState<{name: string, handle: any, parentHandle: any, path: string}[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{name: string, handle: any, parentHandle: any, path: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  
  const [error, setError] = useState('');
  const [isSecurityError, setIsSecurityError] = useState(false);
  const [isIframe, setIsIframe] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkPosterLoading, setBulkPosterLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, lastFile: '' });
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  const parseNfo = (xmlText: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const getText = (tag: string) => {
      const node = xmlDoc.getElementsByTagName(tag)[0];
      return node ? node.textContent || '' : '';
    };

    return {
      name: getText('title'),
      releaseDate: getText('year') || getText('premiered')?.substring(0, 10),
      description: getText('plot'),
      genre: getText('genre'),
      director: getText('director'),
      actors: Array.from(xmlDoc.getElementsByTagName('actor')).map(a => a.getElementsByTagName('name')[0]?.textContent || '').filter(Boolean).join(', '),
      tagline: getText('tagline'),
    };
  };

  // Form State
  const [formData, setFormData] = useState({
    type: 'Movies',
    name: '',
    language: 'Italiano',
    releaseDate: '',
    genre: '',
    contentRating: 'No Rating',
    definition: 'HD',
    episodeName: '',
    actors: '',
    director: '',
    screenwriters: '',
    tagline: '',
    description: '',
    comments: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

  useEffect(() => {
    if (saveStatus) {
      const timer = setTimeout(() => setSaveStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const scanDirectoryForVideos = async (dirHandle: any, path = '', depth = 0): Promise<{name: string, handle: any, parentHandle: any, path: string}[]> => {
    if (depth > 12) return []; // Profondità aumentata per librerie complesse
    let foundFiles: {name: string, handle: any, parentHandle: any, path: string}[] = [];
    const IGNORED_DIRS = ['.git', '.trashes', 'system volume information', 'node_modules', '$recycle.bin', 'metadata', 'backups'];
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
          const lowerName = entry.name.toLowerCase();
          const hasVideoExt = VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
          const looksLikeMovie = DIRTY_PATTERN.test(lowerName) && !lowerName.endsWith('.txt') && !lowerName.endsWith('.nfo') && !lowerName.endsWith('.jpg') && !lowerName.endsWith('.srt');

          if (hasVideoExt || looksLikeMovie) {
            foundFiles.push({ name: entry.name, handle: entry, parentHandle: dirHandle, path: path + entry.name });
          }
        }
      }
    } catch (e) {
      console.error("Error scanning directory:", e);
    }
    return foundFiles;
  };

  const handleBulkPosters = async () => {
    if (videoFiles.length === 0) {
      alert("Nessun file video caricato.");
      return;
    }

    const confirmBulk = window.confirm(`Stai per cercare e scaricare le locandine per tutti i ${videoFiles.length} film. L'IA cercherà i link diretti alle immagini. Nota: Alcuni download potrebbero fallire per restrizioni di sicurezza (CORS). Continuare?`);
    if (!confirmBulk) return;

    setBulkPosterLoading(true);
    setBulkProgress({ current: 0, total: videoFiles.length, lastFile: '' });

    try {
      for (let i = 0; i < videoFiles.length; i++) {
        const video = videoFiles[i];
        setBulkProgress(prev => ({ ...prev, current: i + 1, lastFile: video.name }));

        try {
          const baseName = video.name.substring(0, video.name.lastIndexOf('.'));
          
          // 1. Check if poster already exists
          const posterExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
          const posterNames = [`${baseName}-poster`, 'poster', 'folder'];
          let exists = false;
          for (const pName of posterNames) {
            for (const ext of posterExtensions) {
              try {
                await video.parentHandle.getFileHandle(`${pName}${ext}`);
                exists = true;
                break;
              } catch { continue; }
            }
            if (exists) break;
          }
          if (exists) continue;

          // 2. Ask AI for a poster URL
          const prompt = `Find a direct, public, high-quality image URL for the movie poster of "${baseName}". Respond ONLY with a JSON object: {"posterUrl": "URL"}. Use reliable sources like TMDB.`;
          
          const ai = getGenAI();
          const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
          });

          const responseText = result.text;
          if (responseText) {
            const data = JSON.parse(responseText);
            if (data.posterUrl) {
              // 3. Attempt to download and save
              const response = await fetch(data.posterUrl);
              const blob = await response.blob();
              
              const posterHandle = await video.parentHandle.getFileHandle(`${baseName}-poster.jpg`, { create: true });
              const pWritable = await posterHandle.createWritable();
              await pWritable.write(blob);
              await pWritable.close();
            }
          }
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
          console.error(`Errore poster bulk per ${video.name}:`, err);
        }
      }
      alert("Download Bulk Locandine completato!");
    } catch (error) {
      console.error("Errore generale Bulk Posters:", error);
    } finally {
      setBulkPosterLoading(false);
    }
  };

  const handleFolderSelect = async () => {
    if (isIframe) {
      const confirm = window.confirm("SICUREZZA BROWSER: L'accesso ai file locali è bloccato nell'anteprima. Vuoi aprire l'app in una nuova scheda per sbloccare tutte le funzionalità?");
      if (confirm) {
        window.open(window.location.href, '_blank');
      }
      return;
    }

    // Firefox Fallback
    if (!window.showDirectoryPicker) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setDirHandle(handle);
      
      setLoading(true);
      setError('');
      setIsSecurityError(false);
      const vFiles = await scanDirectoryForVideos(handle);
      setLoading(false);
      
      setVideoFiles(vFiles);
      if (vFiles.length > 0) {
        handleVideoSelect(vFiles[0]);
      } else {
        setError("Nessun file video trovato in questa cartella o nelle sue sottocartelle.");
      }
    } catch (error: any) {
      setLoading(false);
      console.error("Errore selezione cartella:", error);
      if (error.name === 'SecurityError' || error.message?.includes('Cross origin sub frames')) {
        setIsSecurityError(true);
        setError("SICUREZZA BROWSER: Per modificare i metadati e salvare file NFO/Poster, l'app deve avere accesso al disco. Questo è bloccato nell'anteprima.");
      } else if (error.name !== 'AbortError') {
        setError(`Errore durante la selezione: ${error.message || 'Impossibile accedere alla cartella'}. Assicurati di non selezionare un'intera unità di sistema (es. C:).`);
      }
    }
  };

  const handleManualMetadataSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setLoading(true);
    setError('');
    
    const foundFiles: {name: string, handle: any, parentHandle: any, path: string}[] = [];
    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const name = file.name;
        const lowerName = name.toLowerCase();
        
        const hasVideoExt = VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
        const looksLikeMovie = DIRTY_PATTERN.test(lowerName) && !lowerName.endsWith('.txt') && !lowerName.endsWith('.nfo') && !lowerName.endsWith('.jpg') && !lowerName.endsWith('.srt');

        if (hasVideoExt || looksLikeMovie) {
            foundFiles.push({ 
                name: file.name, 
                handle: null, 
                parentHandle: null, 
                path: (file as any).webkitRelativePath || name 
            });
        }
    }

    setVideoFiles(foundFiles);
    setLoading(false);
    
    if (foundFiles.length > 0) {
        handleVideoSelect(foundFiles[0]);
    } else {
        setError("Nessun file video trovato in questa cartella.");
    }
  };

  const handleVideoSelect = async (video: {name: string, handle: any, parentHandle: any, path: string}) => {
    setSelectedVideo(video);
    setLoading(true);
    const baseName = video.name.substring(0, video.name.lastIndexOf('.'));
    
    // Reset form with default name
    setFormData(prev => ({ 
      ...prev, 
      name: baseName,
      description: '',
      genre: '',
      director: '',
      actors: '',
      tagline: '',
      releaseDate: '',
      comments: ''
    }));
    setPosterUrl(null);

    try {
      // 1. Cerca file NFO
      let nfoHandle;
      try { nfoHandle = await video.parentHandle.getFileHandle(`${baseName}.nfo`); }
      catch { 
        try { nfoHandle = await video.parentHandle.getFileHandle(`movie.nfo`); }
        catch { /* No NFO */ }
      }

      if (nfoHandle) {
        const file = await nfoHandle.getFile();
        const text = await file.text();
        const nfoData = parseNfo(text);
        setFormData(prev => ({ 
          ...prev, 
          ...nfoData,
          name: nfoData.name || baseName 
        }));
      }

      // 2. Cerca Poster
      const posterExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      const posterNames = [`${baseName}-poster`, 'poster', 'folder', baseName];
      
      let foundPoster = false;
      for (const pName of posterNames) {
        for (const ext of posterExtensions) {
          try {
            const pHandle = await video.parentHandle.getFileHandle(`${pName}${ext}`);
            const pFile = await pHandle.getFile();
            setPosterUrl(URL.createObjectURL(pFile));
            foundPoster = true;
            break;
          } catch { continue; }
        }
        if (foundPoster) break;
      }
    } catch (e) {
      console.error("Errore caricamento metadati esistenti:", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePosterSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setPosterUrl(url);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = async () => {
    if (!formData.name) return;
    
    setLoading(true);
    try {
      const prompt = `
        Act as an expert movie database API. I will give you a movie or TV show title.
        Extract and provide the following metadata in JSON format. 
        
        CRITICAL INSTRUCTION: You MUST provide the 'description', 'tagline', and 'genre' strictly in ${formData.language}.
        
        Title to search: "${formData.name}"
        
        Respond ONLY with a valid JSON object with these keys:
        - name (Cleaned original title)
        - releaseDate (YYYY-MM-DD)
        - genre (Comma separated, e.g., "Azione, Fantascienza" if Italian)
        - actors (Comma separated list of main actors)
        - director (Name of director)
        - screenwriters (Name of writers)
        - tagline (Short catchy phrase in ${formData.language})
        - description (Detailed plot summary in ${formData.language})
      `;

      const ai = getGenAI();
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              releaseDate: { type: Type.STRING },
              genre: { type: Type.STRING },
              actors: { type: Type.STRING },
              director: { type: Type.STRING },
              screenwriters: { type: Type.STRING },
              tagline: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["name", "releaseDate", "genre", "description"]
          }
        }
      });

      const responseText = result.text;
      if (responseText) {
        const data = JSON.parse(responseText);
        setFormData(prev => ({
          ...prev,
          name: data.name || prev.name,
          releaseDate: data.releaseDate || prev.releaseDate,
          genre: data.genre || prev.genre,
          actors: data.actors || prev.actors,
          director: data.director || prev.director,
          screenwriters: data.screenwriters || prev.screenwriters,
          tagline: data.tagline || prev.tagline,
          description: data.description || prev.description,
        }));
      }
    } catch (error: any) {
      console.error("Error searching metadata:", error);
      let errorMessage = "Errore IA: Impossibile recuperare i metadati";
      let diagnostic = "";

      if (error.message?.startsWith('API_KEY_MISSING')) {
        const parts = error.message.split('|');
        const varName = parts[1] || "Sconosciuta";
        const varValue = parts[2] || "null";
        errorMessage = `CHIAVE MANCANTE: La variabile '${varName}' sembra non essere configurata correttamente.`;
        diagnostic = `Variabile rilevata: ${varName} (${varValue})`;
      } else if (error.status === 401 || error.status === 403 || error.message?.toLowerCase().includes('api key')) {
        errorMessage = "CHIAVE NON VALIDA: La chiave API nei Settings non è corretta o non ha i permessi per Gemini API.";
      } else if (error.message) {
        errorMessage = `Errore IA: ${error.message}`;
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
    } finally {
      setLoading(false);
    }
  };

  const searchPosterOnWeb = () => {
    if (!formData.name) {
      alert("Inserisci prima il nome del film!");
      return;
    }
    const query = encodeURIComponent(`${formData.name} ${formData.releaseDate ? formData.releaseDate.substring(0,4) : ''} movie poster high resolution`);
    window.open(`https://www.google.com/search?tbm=isch&q=${query}`, '_blank');
  };

  const handleSave = async () => {
    if (!selectedVideo || !selectedVideo.parentHandle) {
      setSaveStatus({ type: 'error', message: "Seleziona una cartella e un file video prima di salvare." });
      return;
    }

    setLoading(true);
    setSaveStatus(null);
    try {
      await saveNfoAndPoster(selectedVideo, formData, posterUrl);
      setSaveStatus({ 
        type: 'success', 
        message: "Metadati (.nfo) e Locandine (.jpg) salvati con successo! I file sono ora pronti per Plex/Kodi." 
      });
    } catch (error) {
      console.error("Errore salvataggio:", error);
      setSaveStatus({ 
        type: 'error', 
        message: "Errore durante il salvataggio. Assicurati di aver concesso i permessi alla cartella." 
      });
    } finally {
      setLoading(false);
    }
  };

  const saveNfoAndPoster = async (video: any, data: any, pUrl: string | null) => {
    const baseName = video.name.substring(0, video.name.lastIndexOf('.'));
    const targetDirHandle = video.parentHandle;
    
    // Generate NFO content
    const nfoContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>${data.name}</title>
  <originaltitle>${data.name}</originaltitle>
  <sorttitle>${data.name}</sorttitle>
  <year>${data.releaseDate ? data.releaseDate.substring(0, 4) : ''}</year>
  <premiered>${data.releaseDate}</premiered>
  <releasedate>${data.releaseDate}</releasedate>
  <plot>${data.description}</plot>
  <tagline>${data.tagline}</tagline>
  <genre>${data.genre}</genre>
  <director>${data.director}</director>
  <credits>${data.screenwriters}</credits>
  <mpaa>${data.contentRating}</mpaa>
  <actor>
    ${data.actors.split(',').map((actor: string) => `<name>${actor.trim()}</name>`).join('\n    ')}
  </actor>
</movie>`;

    // Save NFO directly
    const nfoHandle = await targetDirHandle.getFileHandle(`${baseName}.nfo`, { create: true });
    const nfoWritable = await nfoHandle.createWritable();
    await nfoWritable.write(nfoContent);
    await nfoWritable.close();

    // Save Poster directly if exists
    if (pUrl) {
      try {
        const response = await fetch(pUrl);
        const blob = await response.blob();
        
        // Save with multiple names for maximum compatibility with Plex/Kodi/Jellyfin
        const posterNames = [`${baseName}-poster.jpg`, `poster.jpg`, `folder.jpg`];
        
        for (const pName of posterNames) {
          try {
            const posterHandle = await targetDirHandle.getFileHandle(pName, { create: true });
            const pWritable = await posterHandle.createWritable();
            await pWritable.write(blob);
            await pWritable.close();
          } catch (e) {
            console.error(`Errore salvataggio poster ${pName}:`, e);
          }
        }
      } catch (e) {
        console.error("Errore fetch poster:", e);
      }
    }
  };

  const handleBulkGenerate = async () => {
    if (videoFiles.length === 0) {
      alert("Nessun file video caricato.");
      return;
    }

    const confirmBulk = window.confirm(`Stai per generare i metadati (.nfo) per tutti i ${videoFiles.length} film nella lista. L'operazione userà l'IA per ogni file. Continuare?`);
    if (!confirmBulk) return;

    setBulkLoading(true);
    setBulkProgress({ current: 0, total: videoFiles.length, lastFile: '' });

    try {
      for (let i = 0; i < videoFiles.length; i++) {
        const video = videoFiles[i];
        setBulkProgress(prev => ({ ...prev, current: i + 1, lastFile: video.name }));

        try {
          const baseName = video.name.substring(0, video.name.lastIndexOf('.'));
          
          // 1. Check if NFO already exists
          try {
            await video.parentHandle.getFileHandle(`${baseName}.nfo`);
            continue; // Skip if exists
          } catch { /* Doesn't exist, proceed */ }

          // 2. Fetch metadata with AI
          const prompt = `
            Act as an expert movie database API. I will give you a movie or TV show title.
            Extract and provide the following metadata in JSON format. 
            
            CRITICAL INSTRUCTION: You MUST provide the 'description', 'tagline', and 'genre' strictly in ${formData.language}.
            
            Title to search: "${baseName}"
            
            Respond ONLY with a valid JSON object with these keys:
            - name (Cleaned original title)
            - releaseDate (YYYY-MM-DD)
            - genre (Comma separated)
            - actors (Comma separated list)
            - director (Name)
            - screenwriters (Name)
            - tagline (Short phrase)
            - description (Detailed plot summary)
            - posterUrl (A direct public URL to a high-quality movie poster image, preferably from a CDN like tmdb.org or similar)
          `;

          const ai = getGenAI();
          const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
          });

          const responseText = result.text;
          if (responseText) {
            const data = JSON.parse(responseText);
            // 3. Save NFO (No poster in bulk unless specified)
            await saveNfoAndPoster(video, {
              ...data,
              contentRating: 'No Rating',
              screenwriters: data.screenwriters || ''
            }, null);
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.error(`Errore bulk per ${video.name}:`, err);
        }
      }
      alert("Generazione Bulk completata!");
    } catch (error) {
      console.error("Errore generale Bulk:", error);
      alert("Si è verificato un errore durante la generazione bulk.");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="h-screen bg-neutral-950 text-neutral-300 font-sans p-2 md:p-4 flex flex-col overflow-hidden">
      {isIframe && (
        <div className="mb-4 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/50 text-white p-4 rounded-xl shadow-2xl backdrop-blur-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-xl shadow-lg shadow-indigo-500/40">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Sblocca Funzionalità Complete</h3>
              <p className="text-xs text-neutral-300">L'accesso ai file locali è possibile solo aprendo l'app in una nuova scheda.</p>
            </div>
          </div>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full md:w-auto px-6 py-2 bg-white text-indigo-600 hover:bg-neutral-100 rounded-lg font-bold text-sm transition-all transform hover:scale-105 active:scale-95 shadow-xl"
          >
            APRI ORA
          </button>
        </div>
      )}
      {/* Top Bar */}
      <div className="flex-none flex items-center justify-between mb-1 pb-1 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 flex items-center justify-center">
            <Logo className="w-full h-full drop-shadow-[0_0_12px_rgba(255,0,128,0.25)]" />
          </div>
          <h1 className="text-lg font-bold text-white">Edit Media Metadata</h1>
          <input
            type="file"
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={handleManualMetadataSelection}
          />
        </div>
        <button onClick={onBack} className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="flex-1 min-h-0 w-full max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Column - Images & Quick Info */}
        <div className="lg:col-span-3 flex flex-col gap-3 min-h-0">
          {/* Poster Area */}
          <div className="flex-1 min-h-0 relative bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden group flex items-center justify-center">
            {posterUrl ? (
              <img src={posterUrl} alt="Poster" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-neutral-600">
                <ImageIcon className="w-16 h-16 mb-2 opacity-50" />
                <span className="text-sm font-medium">Nessuna Locandina</span>
              </div>
            )}
            
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
              <button 
                onClick={() => posterInputRef.current?.click()}
                className="bg-purple-600 hover:bg-purple-500 text-white p-3 rounded-full shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all"
                title="Carica locandina dal PC"
              >
                <Upload className="w-5 h-5" />
              </button>
              <button 
                onClick={searchPosterOnWeb}
                className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-full shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all delay-75"
                title="Cerca locandina sul Web"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
            <input 
              type="file" 
              ref={posterInputRef} 
              onChange={handlePosterSelect} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
          
          <p className="flex-none text-[10px] text-neutral-500 text-center px-2">
            Usa <Search className="w-3 h-3 inline" /> per cercare su Google, salva sul PC e carica con <Upload className="w-3 h-3 inline" />.
          </p>

          {/* Quick Info Fields */}
          <div className="flex-none space-y-3 bg-neutral-900 p-4 rounded-xl border border-neutral-700 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-600/20 rounded-lg">
                <Info className="w-5 h-5 text-purple-400" />
              </div>
              <p className="text-sm text-white font-bold leading-relaxed">
                L'app salva file <span className="text-purple-400">.nfo</span> e <span className="text-purple-400">.jpg</span>. È la soluzione reale usata da Plex/Kodi per non appesantire il file video.
              </p>
            </div>
            <div className="h-px bg-neutral-800 w-full" />
            <div className="flex items-center gap-2">
              <label className="w-1/3 text-xs text-right text-neutral-400">Release:</label>
              <input type="date" name="releaseDate" value={formData.releaseDate} onChange={handleInputChange} className="w-2/3 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none" />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-1/3 text-xs text-right text-neutral-400">Genre:</label>
              <input type="text" name="genre" value={formData.genre} onChange={handleInputChange} className="w-2/3 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none" placeholder="Azione..." />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-1/3 text-xs text-right text-neutral-400">Rating:</label>
              <select name="contentRating" value={formData.contentRating} onChange={handleInputChange} className="w-2/3 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none">
                <option>No Rating</option>
                <option>G</option>
                <option>PG</option>
                <option>PG-13</option>
                <option>R</option>
                <option>NC-17</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="w-1/3 text-xs text-right text-neutral-400">Def:</label>
              <select name="definition" value={formData.definition} onChange={handleInputChange} className="w-2/3 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none">
                <option>SD</option>
                <option>HD</option>
                <option>FHD (1080p)</option>
                <option>4K (UHD)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Column - Detailed Metadata */}
        <div className="lg:col-span-9 flex flex-col gap-3 min-h-0">
          
          {/* File Selection & Search */}
          <div className="flex-none bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/50 space-y-2">
            {error && (
              <div className={`${isSecurityError ? 'bg-purple-600/20 border-purple-500/50' : 'bg-red-500/10 border-red-500/50'} border text-white p-4 rounded-xl mb-4 flex flex-col gap-3 shadow-xl`}>
                <div className="flex items-center gap-3">
                  <AlertCircle className={`w-5 h-5 ${isSecurityError ? 'text-purple-400' : 'text-red-400'}`} />
                  <p className={isSecurityError ? 'text-sm font-bold' : 'text-xs'}>{error}</p>
                </div>
                
                {error.includes("CHIAVE") && (
                  <div className="p-3 bg-black/40 rounded-lg border border-white/10 text-[10px] font-mono space-y-1">
                    <div className="flex items-center gap-2 text-blue-400">
                      <ShieldAlert className="w-3 h-3" />
                      <span>Diagnosi:</span>
                    </div>
                    <p className="text-neutral-400">Stato: <span className="text-white">{getApiKeyStatus()}</span></p>
                    <p className="text-neutral-500 italic">Se "NOT_FOUND", aggiungi GEMINI_API_KEY nei Settings.</p>
                  </div>
                )}

                {isSecurityError && (
                  <button 
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-xs transition-all shadow-lg shadow-purple-500/20"
                  >
                    SBLOCCA ORA (Apri in Nuova Scheda)
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="w-20 text-xs text-right text-neutral-400">Add File:</label>
              <div className="flex-1 flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={selectedVideo ? selectedVideo.name : ''} 
                  placeholder="Seleziona un file video..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs text-neutral-500" 
                />
                <button 
                  onClick={handleFolderSelect}
                  className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4 text-neutral-300" />
                  <span className="text-xs text-neutral-300">Scegli Cartella</span>
                </button>
              </div>
            </div>

            {videoFiles.length > 0 && (
              <div className="flex flex-col gap-2 pl-[5.5rem]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <button 
                    onClick={handleBulkGenerate}
                    disabled={bulkLoading || bulkPosterLoading || loading}
                    className="py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-600/30 transition-all flex items-center justify-center gap-2 font-bold text-xs"
                  >
                    {bulkLoading ? (
                      <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {bulkLoading ? 'Bulk NFO...' : `Genera NFO (${videoFiles.length})`}
                  </button>

                  <button 
                    onClick={handleBulkPosters}
                    disabled={bulkLoading || bulkPosterLoading || loading}
                    className="py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-all flex items-center justify-center gap-2 font-bold text-xs"
                  >
                    {bulkPosterLoading ? (
                      <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ImageIcon className="w-4 h-4" />
                    )}
                    {bulkPosterLoading ? 'Bulk Posters...' : `Scarica Locandine (${videoFiles.length})`}
                  </button>
                </div>
                
                {(bulkLoading || bulkPosterLoading) && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                      <motion.div 
                        className={`h-full ${bulkLoading ? 'bg-indigo-500' : 'bg-purple-500'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-neutral-500 flex justify-between">
                      <span>{bulkLoading ? 'NFO' : 'Poster'}: {bulkProgress.lastFile}</span>
                      <span>{bulkProgress.current} / {bulkProgress.total}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {videoFiles.length > 0 && (
              <div className="flex items-center gap-3">
                <label className="w-20 text-xs text-right text-neutral-400">Video:</label>
                <select 
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none text-white"
                  value={selectedVideo?.path || ''}
                  onChange={(e) => {
                    const video = videoFiles.find(v => v.path === e.target.value);
                    if (video) handleVideoSelect(video);
                  }}
                >
                  {videoFiles.map(v => (
                    <option key={v.path} value={v.path}>{v.path}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <label className="w-20 text-xs text-right text-neutral-400">Type:</label>
              <select name="type" value={formData.type} onChange={handleInputChange} className="w-32 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none">
                <option>Movies</option>
                <option>TV Shows</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <label className="w-20 text-xs text-right text-neutral-400">Name:</label>
              <input 
                type="text" 
                name="name" 
                value={formData.name} 
                onChange={handleInputChange} 
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none text-white" 
              />
              <label className="text-xs text-neutral-400">Lang:</label>
              <select name="language" value={formData.language} onChange={handleInputChange} className="w-24 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none">
                <option value="Italiano">Italiano</option>
                <option value="English">English</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pl-[5.5rem]">
              <button 
                onClick={handleSearch}
                disabled={loading || !formData.name}
                className="flex items-center gap-2 px-4 py-1.5 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-full hover:bg-purple-600/30 transition-colors disabled:opacity-50 text-xs font-medium"
              >
                {loading ? <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /> : <Search className="w-3 h-3" />}
                {loading ? 'Ricerca in corso...' : 'Cerca Metadati con IA'}
              </button>
            </div>
          </div>

          {/* Detailed Fields */}
          <div className="flex-1 min-h-0 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/50 flex flex-col gap-2 overflow-y-auto">
            {formData.type === 'TV Shows' && (
              <div className="flex items-center gap-3">
                <label className="w-20 text-xs text-right text-neutral-400">Episode:</label>
                <input type="text" name="episodeName" value={formData.episodeName} onChange={handleInputChange} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none" />
              </div>
            )}
            
            <div className="flex items-start gap-3">
              <label className="w-20 text-xs text-right text-neutral-400 pt-1">Actors:</label>
              <textarea name="actors" value={formData.actors} onChange={handleInputChange} rows={2} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none resize-none" />
            </div>

            <div className="flex items-center gap-3">
              <label className="w-20 text-xs text-right text-neutral-400">Director:</label>
              <input type="text" name="director" value={formData.director} onChange={handleInputChange} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none" />
            </div>

            <div className="flex items-center gap-3">
              <label className="w-20 text-xs text-right text-neutral-400">Writers:</label>
              <input type="text" name="screenwriters" value={formData.screenwriters} onChange={handleInputChange} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none" />
            </div>

            <div className="flex items-center gap-3">
              <label className="w-20 text-xs text-right text-neutral-400">Tagline:</label>
              <input type="text" name="tagline" value={formData.tagline} onChange={handleInputChange} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none" />
            </div>

            <div className="flex items-start gap-3">
              <label className="w-20 text-xs text-right text-neutral-400 pt-1">Desc:</label>
              <textarea name="description" value={formData.description} onChange={handleInputChange} rows={3} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none resize-none leading-relaxed" />
            </div>
            
            <div className="flex items-start gap-3">
              <label className="w-20 text-xs text-right text-neutral-400 pt-1">Comments:</label>
              <textarea name="comments" value={formData.comments} onChange={handleInputChange} rows={1} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs focus:border-purple-500 outline-none resize-none" />
            </div>

            <div className="mt-4 p-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-inner">
              <h4 className="text-sm font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-purple-400" /> OPZIONI AVANZATE
              </h4>
              <p className="text-sm text-white font-bold mb-3 leading-relaxed">
                Se vuoi assolutamente "nascondere" i metadati dentro il file video (MKV), puoi usare questo comando via terminale dopo aver salvato i file con l'app:
              </p>
              <code className="block p-3 bg-black rounded-lg text-xs text-purple-400 break-all font-mono border border-neutral-800 shadow-lg">
                mkvpropedit "{selectedVideo?.name}" --tags all:"{selectedVideo?.name?.replace(/\.[^/.]+$/, "")}.nfo" --attachment-add "poster.jpg"
              </code>
            </div>
          </div>

          <div className="flex-none flex items-center justify-between gap-3 pt-1">
            <div className="flex-1">
              <AnimatePresence>
                {saveStatus && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                      saveStatus.type === 'success' 
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {saveStatus.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {saveStatus.message}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={onBack}
                className="px-4 py-1.5 rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-xs font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={!selectedVideo || loading}
                className="px-6 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white transition-colors text-xs font-medium shadow-[0_0_15px_rgba(147,51,234,0.3)] flex items-center gap-2"
              >
                <Save className="w-3 h-3" />
                Save Metadata
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
