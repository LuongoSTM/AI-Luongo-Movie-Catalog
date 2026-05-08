import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, FolderOpen, Play, Info, Search, Star, Clock, Calendar, Library, Film, X } from 'lucide-react';
import { Logo } from './components/Logo';

declare global {
  interface Window {
    showDirectoryPicker(options?: any): Promise<any>;
  }
}

interface Movie {
  id: string;
  title: string;
  originalTitle?: string;
  year?: string;
  plot?: string;
  genre?: string;
  director?: string;
  posterUrl?: string;
  videoFileHandle: any;
  videoFileName: string;
  lastModified: number;
}

const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', 
  '.ts', '.m2ts', '.vob', '.3gp', '.mpg', '.mpeg', '.divx', '.xvid', '.asf', '.rmvb',
  '.iso', '.m2t', '.m1v', '.m2v', '.mp2', '.mpeg4', '.div', '.ogm', '.ogv', '.qt',
  '.rm', '.m4p', '.m4b', '.m4r', '.f4v', '.f4p', '.f4a', '.f4b',
  '.3g2', '.mod', '.tod', '.vro', '.dvr-ms', '.amv', '.mjp', '.mjpeg'
];

const DIRTY_PATTERN = /(1080p|720p|2160p|4k|bluray|bdrip|brrip|dvdrip|web-dl|webrip|x264|h264|hevc|x265|ita|eng|dts|ac3|aac|multisub|remux|xvid|divx|h265|h.264|h.265|10bit|hdr|dovi|vision|atvp|amzn|netflix|nf|dnp|dsnp|cyber|iamable|juggs|rarbg|ettv|tpx|tgx|psa|qxr|yify|yts|evans|galaxy|mkv|mp4|avi)/i;

export default function MovieCatalog({ onBack }: { onBack: () => void }) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [recentMovies, setRecentMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isIframe, setIsIframe] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

  const parseNfo = (xmlText: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const getText = (tag: string) => {
      const node = xmlDoc.getElementsByTagName(tag)[0];
      return node ? node.textContent || '' : '';
    };

    return {
      title: getText('title'),
      originalTitle: getText('originaltitle'),
      year: getText('year') || getText('premiered')?.substring(0, 4),
      plot: getText('plot'),
      genre: getText('genre'),
      director: getText('director'),
    };
  };

  const scanDirectory = async (dirHandle: any, path = '', depth = 0): Promise<Movie[]> => {
    if (depth > 12) return []; // Profondità aumentata per librerie complesse
    let foundMovies: Movie[] = [];
    const IGNORED_DIRS = ['.git', '.trashes', 'system volume information', 'node_modules', '$recycle.bin', 'metadata', 'backups'];
    let iterations = 0;
    
    try {
      for await (const entry of dirHandle.values()) {
        iterations++;
        if (iterations % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
        
        if (entry.kind === 'directory') {
          const lowerName = entry.name.toLowerCase();
          if (entry.name.startsWith('.') || IGNORED_DIRS.includes(lowerName)) continue;
          
          const subMovies = await scanDirectory(entry, path + entry.name + '/', depth + 1);
          foundMovies = foundMovies.concat(subMovies);
        } else if (entry.kind === 'file') {
          const name = entry.name as string;
          const lowerName = name.toLowerCase();
          
          const hasVideoExt = VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
          const looksLikeMovie = DIRTY_PATTERN.test(lowerName) && !lowerName.endsWith('.txt') && !lowerName.endsWith('.nfo') && !lowerName.endsWith('.jpg') && !lowerName.endsWith('.srt');

          if (hasVideoExt || looksLikeMovie) {
            const lastDotIndex = name.lastIndexOf('.');
            const baseName = lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;
            const fileData = await (entry as FileSystemFileHandle).getFile();
            
            let movieData: Partial<Movie> = {
              id: path + name,
              videoFileName: name,
              videoFileHandle: entry,
              title: baseName, // Fallback title
              lastModified: fileData.lastModified
            };

            // Try to find NFO
            try {
              let nfoHandle;
              try { nfoHandle = await dirHandle.getFileHandle(`${baseName}.nfo`); }
              catch { nfoHandle = await dirHandle.getFileHandle(`movie.nfo`); }
              
              if (nfoHandle) {
                const file = await nfoHandle.getFile();
                const text = await file.text();
                const nfoData = parseNfo(text);
                movieData = { ...movieData, ...nfoData, title: nfoData.title || baseName };
              }
            } catch (e) { /* No NFO found */ }

            // Try to find Poster
            try {
              let posterHandle;
              try { posterHandle = await dirHandle.getFileHandle(`${baseName}-poster.jpg`); }
              catch { 
                try { posterHandle = await dirHandle.getFileHandle(`poster.jpg`); }
                catch { posterHandle = await dirHandle.getFileHandle(`folder.jpg`); }
              }
              
              if (posterHandle) {
                const file = await posterHandle.getFile();
                movieData.posterUrl = URL.createObjectURL(file);
              }
            } catch (e) { /* No poster found */ }

            foundMovies.push(movieData as Movie);
          }
        }
      }
    } catch (error) {
      console.error("Error scanning directory:", error);
    }
    
    return foundMovies;
  };

  const handleLoadLibrary = async () => {
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
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      setLoading(true);
      setError('');
      const scannedMovies = await scanDirectory(dirHandle);
      
      // Sort alphabetically
      scannedMovies.sort((a, b) => a.title.localeCompare(b.title));
      setMovies(scannedMovies);

      // Get recently added (top 10)
      const recent = [...scannedMovies].sort((a, b) => b.lastModified - a.lastModified).slice(0, 10);
      setRecentMovies(recent);
      
      if (scannedMovies.length === 0) {
        setError("Nessun file video trovato nella cartella selezionata.");
      }
    } catch (error: any) {
      console.error(error);
      if (error.name === 'SecurityError' || error.message?.includes('Cross origin sub frames')) {
        setError("SICUREZZA BROWSER: L'anteprima blocca l'accesso ai file. Per vedere il catalogo completo con locandine e dettagli, clicca su 'Apri in una nuova scheda' in alto a destra.");
      } else if (error.name !== 'AbortError') {
        setError(`Errore durante la selezione: ${error.message || 'Impossibile accedere alla cartella'}. Assicurati di non selezionare un'intera unità di sistema (es. C:).`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualLibrarySelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setLoading(true);
    setError('');
    
    const scannedMovies: Movie[] = [];
    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const name = file.name;
        const lowerName = name.toLowerCase();
        
        const hasVideoExt = VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
        const looksLikeMovie = DIRTY_PATTERN.test(lowerName) && !lowerName.endsWith('.txt') && !lowerName.endsWith('.nfo') && !lowerName.endsWith('.jpg') && !lowerName.endsWith('.srt');

        if (hasVideoExt || looksLikeMovie) {
            const lastDotIndex = name.lastIndexOf('.');
            const baseName = lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;
            
            scannedMovies.push({
                id: (file as any).webkitRelativePath || name,
                title: baseName,
                videoFileName: name,
                videoFileHandle: null, // No handle in manual mode
                lastModified: file.lastModified
            });
        }
    }

    // Sort alphabetically
    scannedMovies.sort((a, b) => a.title.localeCompare(b.title));
    setMovies(scannedMovies);

    // Get recently added (top 10)
    const recent = [...scannedMovies].sort((a, b) => b.lastModified - a.lastModified).slice(0, 10);
    setRecentMovies(recent);
    
    setLoading(false);

    if (scannedMovies.length === 0) {
        setError("Nessun file video trovato nella cartella selezionata.");
    }
  };

  const filteredMovies = (movies || []).filter(m => {
    if (!m || !m.title) return false;
    const search = (searchQuery || "").toLowerCase();
    const titleMatch = m.title.toLowerCase().includes(search);
    const genreMatch = m.genre ? m.genre.toLowerCase().includes(search) : false;
    const directorMatch = m.director ? m.director.toLowerCase().includes(search) : false;
    return titleMatch || genreMatch || directorMatch;
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans flex flex-col">
      {/* Top Navigation */}
      <div className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800/60 px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 flex items-center justify-center">
            <Logo className="w-full h-full drop-shadow-[0_0_12px_rgba(255,0,128,0.25)]" />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
            Movie Catalog
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Cerca film, genere..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-full pl-10 pr-4 py-2 text-sm focus:border-purple-500 outline-none w-64 transition-all focus:w-80"
            />
          </div>
          <input
            type="file"
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={handleManualLibrarySelection}
          />
          <button 
            onClick={handleLoadLibrary}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-5 py-2 rounded-full font-medium transition-colors shadow-[0_0_15px_rgba(147,51,234,0.3)]"
          >
            <FolderOpen className="w-4 h-4" />
            {movies.length > 0 ? 'Ricarica Libreria' : 'Carica Libreria'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-8">
        {isIframe && (
          <div className="mb-6 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/50 text-white p-6 rounded-2xl shadow-2xl backdrop-blur-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500 rounded-2xl shadow-lg shadow-purple-500/40">
                <Library className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Sblocca il Catalogo Completo</h3>
                <p className="text-sm text-neutral-300">Per motivi di sicurezza del browser, l'accesso ai tuoi file locali è possibile solo in una scheda dedicata.</p>
              </div>
            </div>
            <button 
              onClick={() => window.open(window.location.href, '_blank')}
              className="w-full md:w-auto px-8 py-4 bg-white text-purple-600 hover:bg-neutral-100 rounded-xl font-black text-lg transition-all transform hover:scale-105 active:scale-95 shadow-xl"
            >
              SBLOCCA ORA
            </button>
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-4 mt-32">
            <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-lg animate-pulse">Scansione della libreria in corso...</p>
          </div>
        ) : movies.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-500 mt-32">
            <Library className="w-24 h-24 mb-6 opacity-20" />
            <h2 className="text-2xl font-bold text-neutral-400 mb-2">Nessun film caricato</h2>
            <p className="max-w-md text-center">Clicca su "Carica Libreria" e seleziona la cartella principale dei tuoi film. L'app cercherà automaticamente i video, le locandine e i file .nfo.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Recently Added Section */}
            {(recentMovies || []).length > 0 && !searchQuery && (
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-600/20 rounded-lg">
                    <Clock className="w-5 h-5 text-purple-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Aggiunti di Recente</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {(recentMovies || []).map((movie) => {
                    if (!movie) return null;
                    return (
                      <motion.div 
                        key={`recent-${movie.id || Math.random()}`}
                        whileHover={{ y: -5 }}
                        onClick={() => setSelectedMovie(movie)}
                        className="group cursor-pointer bg-neutral-900/40 border border-neutral-800/50 rounded-2xl p-3 hover:bg-neutral-800/40 transition-all flex gap-4"
                      >
                        <div className="relative w-24 aspect-[2/3] rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-lg flex-shrink-0">
                          {movie.posterUrl ? (
                            <img src={movie.posterUrl} alt={movie.title || 'Movie'} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-700">
                              <Film className="w-8 h-8" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 py-1 flex flex-col justify-between">
                          <div>
                            <h3 className="font-bold text-sm text-neutral-200 truncate group-hover:text-purple-400 transition-colors">{movie.title || 'Untitled'}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-neutral-500 font-medium">{movie.year || 'N/A'}</span>
                              {movie.genre && (
                                <span className="text-[10px] text-purple-400/80 font-bold truncate max-w-[100px]">{movie.genre.split(',')[0]}</span>
                              )}
                            </div>
                          </div>
                          {movie.director && (
                            <div className="text-[10px] text-neutral-500 truncate">
                              <span className="font-bold uppercase tracking-tighter text-neutral-600 mr-1">Dir:</span> {movie.director}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* All Movies Grid */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-600/20 rounded-lg">
                  <Library className="w-5 h-5 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white">
                  {searchQuery ? `Risultati per "${searchQuery}"` : 'Tutti i Film'}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {(filteredMovies || []).map((movie) => {
                  if (!movie) return null;
                  return (
                    <motion.div 
                      key={movie.id || `movie-${Math.random()}`}
                      layoutId={`movie-${movie.id}`}
                      onClick={() => setSelectedMovie(movie)}
                      className="group cursor-pointer bg-neutral-900/30 border border-neutral-800/40 rounded-2xl p-3 hover:bg-neutral-800/40 transition-all flex flex-col gap-3"
                    >
                      <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-lg">
                        {movie.posterUrl ? (
                          <img src={movie.posterUrl} alt={movie.title || 'Movie'} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-700">
                            <Film className="w-10 h-10" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                          <p className="text-[10px] text-neutral-300 line-clamp-2 leading-tight italic">
                            {movie.plot || 'Nessuna trama disponibile.'}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-bold text-sm text-neutral-100 truncate group-hover:text-purple-400 transition-colors flex-1">{movie.title || 'Untitled'}</h3>
                          <span className="text-[10px] font-bold text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">{movie.year || 'N/A'}</span>
                        </div>
                        
                        <div className="flex flex-col gap-1">
                          {movie.genre && (
                            <div className="flex items-center gap-1.5">
                              <Film className="w-3 h-3 text-purple-500/70" />
                              <span className="text-[10px] text-neutral-400 truncate">{movie.genre}</span>
                            </div>
                          )}
                          {movie.director && (
                            <div className="flex items-center gap-1.5">
                              <Star className="w-3 h-3 text-yellow-500/70" />
                              <span className="text-[10px] text-neutral-400 truncate">Dir: {movie.director}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Compact Centered Movie Details Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMovie(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-neutral-900 rounded-[2rem] border border-neutral-800 shadow-2xl overflow-hidden flex flex-col md:flex-row"
            >
              {/* Compact Poster */}
              <div className="w-full md:w-2/5 bg-neutral-950 relative flex-shrink-0 aspect-[2/3] md:aspect-auto">
                {selectedMovie.posterUrl ? (
                  <img src={selectedMovie.posterUrl} alt={selectedMovie.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-800">
                    <Film className="w-16 h-16" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-neutral-900" />
              </div>

              {/* Compact Details */}
              <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
                <button 
                  onClick={() => setSelectedMovie(null)}
                  className="absolute top-4 right-4 p-2 bg-neutral-800/50 hover:bg-neutral-700 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">{selectedMovie.title}</h2>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedMovie.year && (
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-md border border-purple-400/20">
                          {selectedMovie.year}
                        </span>
                      )}
                      {selectedMovie.genre && (
                        <span className="text-[10px] font-bold text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-700">
                          {selectedMovie.genre}
                        </span>
                      )}
                    </div>
                  </div>

                  {selectedMovie.plot && (
                    <div className="relative">
                      <p className="text-neutral-300 text-sm leading-relaxed line-clamp-6 italic">
                        "{selectedMovie.plot}"
                      </p>
                    </div>
                  )}

                  <div className="pt-4 space-y-2 border-t border-neutral-800/50">
                    {selectedMovie.director && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Regia:</span>
                        <span className="text-xs text-neutral-200 font-medium">{selectedMovie.director}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">File:</span>
                      <span className="text-[10px] text-neutral-500 font-mono truncate max-w-[150px]">{selectedMovie.videoFileName}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
