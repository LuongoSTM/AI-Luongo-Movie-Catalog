import { useState, useEffect } from 'react';
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
}

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];

export default function MovieCatalog({ onBack }: { onBack: () => void }) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isIframe, setIsIframe] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

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
    if (depth > 4) return []; // Limite di profondità per evitare blocchi
    let foundMovies: Movie[] = [];
    const IGNORED_DIRS = ['.git', '.trashes', 'system volume information', 'node_modules', '$recycle.bin'];
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
          
          if (VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
            const baseName = name.substring(0, name.lastIndexOf('.'));
            let movieData: Partial<Movie> = {
              id: path + name,
              videoFileName: name,
              videoFileHandle: entry,
              title: baseName // Fallback title
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
    try {
      if (!window.showDirectoryPicker) {
        setError("Il tuo browser non supporta la File System Access API. Usa Chrome o Edge su PC.");
        return;
      }
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      setLoading(true);
      setError('');
      const scannedMovies = await scanDirectory(dirHandle);
      
      // Sort alphabetically
      scannedMovies.sort((a, b) => a.title.localeCompare(b.title));
      
      setMovies(scannedMovies);
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

  const filteredMovies = movies.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (m.genre && m.genre.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans flex flex-col">
      {/* Top Navigation */}
      <div className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-[120px] h-[120px] flex items-center justify-center">
            <Logo className="w-full h-full drop-shadow-[0_0_12px_rgba(255,0,128,0.25)]" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {filteredMovies.map((movie) => (
              <motion.div 
                key={movie.id}
                layoutId={`movie-${movie.id}`}
                onClick={() => setSelectedMovie(movie)}
                className="group cursor-pointer flex flex-col gap-3"
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-lg">
                  {movie.posterUrl ? (
                    <img src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-700">
                      <Film className="w-12 h-12" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                    <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-lg">
                      <Info className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-200 truncate group-hover:text-purple-400 transition-colors">{movie.title}</h3>
                  <p className="text-xs text-neutral-500">{movie.year || 'Anno sconosciuto'}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Movie Details Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMovie(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              layoutId={`movie-${selectedMovie.id}`}
              className="relative w-full max-w-5xl bg-neutral-900 rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
            >
              {/* Poster Side */}
              <div className="w-full md:w-1/3 lg:w-2/5 bg-neutral-950 relative flex-shrink-0">
                {selectedMovie.posterUrl ? (
                  <img src={selectedMovie.posterUrl} alt={selectedMovie.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full min-h-[300px] flex items-center justify-center text-neutral-800">
                    <Film className="w-24 h-24" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-neutral-900" />
              </div>

              {/* Details Side */}
              <div className="flex-1 p-8 md:p-10 overflow-y-auto">
                <button 
                  onClick={() => setSelectedMovie(null)}
                  className="absolute top-6 right-6 p-2 bg-neutral-800/50 hover:bg-neutral-700 rounded-full text-neutral-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-2">{selectedMovie.title}</h2>
                    {selectedMovie.originalTitle && selectedMovie.originalTitle !== selectedMovie.title && (
                      <p className="text-lg text-neutral-400 italic">{selectedMovie.originalTitle}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
                    {selectedMovie.year && (
                      <span className="flex items-center gap-1.5 text-purple-400 bg-purple-400/10 px-3 py-1 rounded-full">
                        <Calendar className="w-4 h-4" /> {selectedMovie.year}
                      </span>
                    )}
                    {selectedMovie.genre && (
                      <span className="text-neutral-300 bg-neutral-800 px-3 py-1 rounded-full">
                        {selectedMovie.genre}
                      </span>
                    )}
                  </div>

                  {selectedMovie.plot && (
                    <div>
                      <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-2">Trama</h4>
                      <p className="text-neutral-300 leading-relaxed text-lg">{selectedMovie.plot}</p>
                    </div>
                  )}

                  {selectedMovie.director && (
                    <div>
                      <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-1">Regia</h4>
                      <p className="text-neutral-200">{selectedMovie.director}</p>
                    </div>
                  )}

                  <div className="pt-6 border-t border-neutral-800">
                    <p className="text-xs text-neutral-500 font-mono break-all">
                      File: {selectedMovie.videoFileName}
                    </p>
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
