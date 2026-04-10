import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Image as ImageIcon, Search, Save, X, FolderOpen, Edit2, Upload } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface MetadataEditorProps {
  onBack: () => void;
}

export default function MetadataEditor({ onBack }: MetadataEditorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // Auto-fill name from filename
      const nameWithoutExt = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
      setFormData(prev => ({ ...prev, name: nameWithoutExt }));
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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
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
    } catch (error) {
      console.error("Error searching metadata:", error);
      alert("Errore durante la ricerca dei metadati.");
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
    // Generate NFO file content (Kodi/XBMC standard)
    const nfoContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>${formData.name}</title>
  <originaltitle>${formData.name}</originaltitle>
  <sorttitle>${formData.name}</sorttitle>
  <premiered>${formData.releaseDate}</premiered>
  <releasedate>${formData.releaseDate}</releasedate>
  <year>${formData.releaseDate ? formData.releaseDate.substring(0, 4) : ''}</year>
  <plot>${formData.description}</plot>
  <tagline>${formData.tagline}</tagline>
  <director>${formData.director}</director>
  <credits>${formData.screenwriters}</credits>
  <genre>${formData.genre}</genre>
  <mpaa>${formData.contentRating}</mpaa>
  ${formData.actors.split(',').map(actor => `<actor><name>${actor.trim()}</name></actor>`).join('\n  ')}
</movie>`;

    // Download NFO
    const blob = new Blob([nfoContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formData.name || 'movie'}.nfo`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // If a poster was uploaded, download it too
    if (posterUrl) {
      try {
        const response = await fetch(posterUrl);
        const blob = await response.blob();
        const posterDownloadUrl = URL.createObjectURL(blob);
        const aPoster = document.createElement('a');
        aPoster.href = posterDownloadUrl;
        aPoster.download = `poster.jpg`;
        document.body.appendChild(aPoster);
        aPoster.click();
        document.body.removeChild(aPoster);
        URL.revokeObjectURL(posterDownloadUrl);
      } catch (e) {
        console.error("Error downloading poster", e);
      }
    }

    // Generate FFmpeg script for embedding
    const originalFileName = file ? file.name : 'video.mp4';
    const ext = originalFileName.substring(originalFileName.lastIndexOf('.'));
    const baseName = originalFileName.substring(0, originalFileName.lastIndexOf('.'));
    const outputFileName = `${baseName}_metadata${ext}`;
    
    const batContent = `@echo off
echo ===================================================
echo INSERIMENTO METADATI NEL FILE VIDEO
echo ===================================================
echo Assicurati di avere FFmpeg installato sul tuo PC.
echo Questo script iniettera' il titolo e la locandina nel file video.
echo.

set INPUT_VIDEO="${originalFileName}"
set OUTPUT_VIDEO="${outputFileName}"
set POSTER="poster.jpg"
set TITLE="${formData.name}"
set YEAR="${formData.releaseDate ? formData.releaseDate.substring(0, 4) : ''}"
set GENRE="${formData.genre}"
set COMMENT="${formData.description.replace(/"/g, '""')}"

if not exist %INPUT_VIDEO% (
    echo ERRORE: Il file video %INPUT_VIDEO% non e' stato trovato in questa cartella.
    pause
    exit /b
)

if exist %POSTER% (
    echo Locandina trovata. Inserimento video + locandina...
    ffmpeg -i %INPUT_VIDEO% -i %POSTER% -map 0 -map 1 -c copy -c:v:1 mjpeg -disposition:v:1 attached_pic -metadata title=%TITLE% -metadata year=%YEAR% -metadata genre=%GENRE% -metadata comment=%COMMENT% %OUTPUT_VIDEO%
) else (
    echo Locandina non trovata. Inserimento solo metadati testuali...
    ffmpeg -i %INPUT_VIDEO% -c copy -metadata title=%TITLE% -metadata year=%YEAR% -metadata genre=%GENRE% -metadata comment=%COMMENT% %OUTPUT_VIDEO%
)

echo.
echo Operazione completata! Il nuovo file e' %OUTPUT_VIDEO%
pause
`;

    const batBlob = new Blob([batContent], { type: 'text/plain' });
    const batUrl = URL.createObjectURL(batBlob);
    const aBat = document.createElement('a');
    aBat.href = batUrl;
    aBat.download = `embed_metadata.bat`;
    document.body.appendChild(aBat);
    aBat.click();
    document.body.removeChild(aBat);
    URL.revokeObjectURL(batUrl);

    alert("File scaricati! Troverai il file .nfo, la locandina (se inserita) e uno script 'embed_metadata.bat'. Esegui lo script per iniettare i dati direttamente nel file video!");
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
            <div className="flex items-center gap-3">
              <label className="w-20 text-xs text-right text-neutral-400">Add File:</label>
              <div className="flex-1 flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={file ? file.name : ''} 
                  placeholder="Seleziona un file video..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs text-neutral-500" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors"
                >
                  <FolderOpen className="w-4 h-4 text-neutral-300" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept="video/*" 
                  className="hidden" 
                />
              </div>
            </div>

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

          {/* Action Buttons */}
          <div className="flex-none flex justify-end gap-3 pt-1">
            <button 
              onClick={onBack}
              className="px-4 py-1.5 rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-xs font-medium"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="px-6 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white transition-colors text-xs font-medium shadow-[0_0_15px_rgba(147,51,234,0.3)] flex items-center gap-2"
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
