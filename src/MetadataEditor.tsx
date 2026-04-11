import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Image as ImageIcon, Search, Save, X, FolderOpen, Edit2, Upload, FileVideo, AlertCircle, ShieldAlert } from 'lucide-react';
import { Type } from '@google/genai';
import { getGenAI, getApiKeyStatus } from './lib/gemini';

declare global {
  interface Window {
    showDirectoryPicker(options?: any): Promise<any>;
  }
}

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

  const scanDirectoryForVideos = async (dirHandle: any, path = '', depth = 0): Promise<{name: string, handle: any, parentHandle: any, path: string}[]> => {
    if (depth > 4) return []; // Limite di profondità per evitare blocchi
    let foundFiles: {name: string, handle: any, parentHandle: any, path: string}[] = [];
    const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
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
          const lowerName = entry.name.toLowerCase();
          if (VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
            foundFiles.push({ name: entry.name, handle: entry, parentHandle: dirHandle, path: path + entry.name });
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

  const handleVideoSelect = (video: {name: string, handle: any, parentHandle: any, path: string}) => {
    setSelectedVideo(video);
    const nameWithoutExt = video.name.substring(0, video.name.lastIndexOf('.'));
    setFormData(prev => ({ ...prev, name: nameWithoutExt }));
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
      alert("Seleziona una cartella e un file video prima di salvare.");
      return;
    }

    setLoading(true);
    try {
      const baseName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.'));
      const targetDirHandle = selectedVideo.parentHandle;
      
      // Generate NFO content
      const nfoContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>${formData.name}</title>
  <originaltitle>${formData.name}</originaltitle>
  <sorttitle>${formData.name}</sorttitle>
  <year>${formData.releaseDate ? formData.releaseDate.substring(0, 4) : ''}</year>
  <premiered>${formData.releaseDate}</premiered>
  <releasedate>${formData.releaseDate}</releasedate>
  <plot>${formData.description}</plot>
  <tagline>${formData.tagline}</tagline>
  <genre>${formData.genre}</genre>
  <director>${formData.director}</director>
  <credits>${formData.screenwriters}</credits>
  <mpaa>${formData.contentRating}</mpaa>
  <actor>
    ${formData.actors.split(',').map(actor => `<name>${actor.trim()}</name>`).join('\n    ')}
  </actor>
</movie>`;

      // Save NFO directly
      const nfoHandle = await targetDirHandle.getFileHandle(`${baseName}.nfo`, { create: true });
      const nfoWritable = await nfoHandle.createWritable();
      await nfoWritable.write(nfoContent);
      await nfoWritable.close();

      // Save Poster directly if exists
      if (posterUrl) {
        const response = await fetch(posterUrl);
        const blob = await response.blob();
        
        const posterHandle = await targetDirHandle.getFileHandle(`${baseName}-poster.jpg`, { create: true });
        const pWritable = await posterHandle.createWritable();
        await pWritable.write(blob);
        await pWritable.close();
      }

      alert("Metadati e locandina salvati con successo nella cartella del film!");
    } catch (error) {
      console.error("Errore salvataggio:", error);
      alert("Si è verificato un errore durante il salvataggio. Assicurati di aver concesso i permessi alla cartella.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-neutral-950 text-neutral-300 font-sans p-2 md:p-4 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex-none flex items-center justify-between mb-2 pb-2 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-white">Edit Media Metadata</h1>
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
          <div className="flex-none space-y-2 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/50">
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
          </div>

          <div className="flex-none flex justify-end gap-3 pt-1">
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
  );
}
