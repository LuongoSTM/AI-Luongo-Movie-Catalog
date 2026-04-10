import { ArrowLeft, Printer, BookOpen } from 'lucide-react';

export default function Manual({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-300 font-sans p-6 print:bg-white print:text-black print:p-0">
      <div className="max-w-4xl mx-auto">
        
        {/* Header - Hidden when printing */}
        <div className="flex justify-between items-center mb-8 print:hidden bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800">
          <button 
            onClick={onBack} 
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-neutral-800"
          >
            <ArrowLeft className="w-5 h-5" /> Torna alla Home
          </button>
          <button 
            onClick={() => window.print()} 
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all"
          >
            <Printer className="w-5 h-5" /> Stampa Manuale
          </button>
        </div>
        
        {/* Printable Content */}
        <div className="space-y-8 print:space-y-6">
          <div className="text-center border-b border-neutral-800 print:border-gray-300 pb-8 print:pb-4">
            <div className="flex justify-center mb-4 print:hidden">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-white print:text-black mb-2">Manuale d'Uso & Installazione</h1>
            <h2 className="text-xl text-blue-400 print:text-blue-600 font-semibold">AI Movie Studio</h2>
            <p className="text-neutral-500 print:text-gray-600 mt-2">Ideato da Fiore Luongo • Ultimo aggiornamento: Aprile 2026</p>
          </div>

          <section className="space-y-4">
            <h3 className="text-2xl font-bold text-white print:text-black border-l-4 border-blue-500 pl-4">1. Movie Renamer</h3>
            <p className="leading-relaxed">
              Il <strong>Movie Renamer</strong> utilizza l'Intelligenza Artificiale per analizzare i nomi dei file video disordinati (es. <code className="bg-neutral-900 print:bg-gray-100 px-1 rounded text-sm">Il.Gladiatore.1080p.ITA.ENG.mkv</code>) e trasformarli in formati puliti e standardizzati (es. <code className="bg-neutral-900 print:bg-gray-100 px-1 rounded text-sm">Il Gladiatore (2000).mkv</code>).
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Seleziona Cartella:</strong> Clicca per scegliere la cartella contenente i tuoi film.</li>
              <li><strong>Analizza:</strong> L'IA leggerà i nomi, rimuoverà le etichette tecniche (risoluzione, codec, lingua) e cercherà di dedurre l'anno di uscita se mancante.</li>
              <li><strong>Risoluzione Conflitti:</strong> Se due file ottengono lo stesso nome, l'app ti avviserà.</li>
              <li><strong>Genera Script:</strong> L'app non rinomina i file direttamente per sicurezza. Genera invece uno script (.bat per Windows o .sh per Mac/Linux). Scarica lo script, mettilo nella cartella dei film e avvialo con un doppio clic.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-2xl font-bold text-white print:text-black border-l-4 border-emerald-500 pl-4">2. Edit Metadata & FFmpeg</h3>
            <p className="leading-relaxed">
              La sezione <strong>Edit Metadata</strong> ti permette di scaricare informazioni dettagliate (trama, attori, locandina) e iniettarle nei tuoi file.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Ricerca IA:</strong> Inserisci il titolo e clicca "Cerca Metadati con IA". L'IA compilerà automaticamente i campi in Italiano o Inglese.</li>
              <li><strong>Locandina:</strong> Usa la lente d'ingrandimento sull'immagine per cercare una locandina su Google. Salvala sul PC e caricala premendo l'icona di upload.</li>
              <li><strong>Salvataggio:</strong> Cliccando "Save Metadata", scaricherai 3 file:
                <ol className="list-decimal pl-6 mt-2 space-y-1 text-sm text-neutral-400 print:text-gray-700">
                  <li>Un file <strong>.nfo</strong> (standard per Kodi, Plex, Emby).</li>
                  <li>La <strong>locandina</strong> (poster.jpg).</li>
                  <li>Uno script <strong>embed_metadata.bat</strong>.</li>
                </ol>
              </li>
              <li><strong>Come iniettare i dati nel video:</strong> Assicurati di avere <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer" className="text-blue-400 underline">FFmpeg</a> installato sul tuo PC. Metti il video originale, il poster.jpg e lo script .bat nella stessa cartella. Fai doppio clic sul .bat: verrà creata una copia del video con locandina e metadati incorporati!</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-2xl font-bold text-white print:text-black border-l-4 border-purple-500 pl-4">3. Installazione in Locale (Per Sviluppatori)</h3>
            <p className="leading-relaxed">
              Se desideri eseguire questo progetto sul tuo computer locale, segui questi passaggi:
            </p>
            <div className="bg-neutral-900 print:bg-gray-100 p-6 rounded-xl border border-neutral-800 print:border-gray-300 space-y-4">
              <div>
                <h4 className="font-semibold text-white print:text-black mb-1">Prerequisiti:</h4>
                <ul className="list-disc pl-6 text-sm">
                  <li>Node.js (versione 18 o superiore) installato.</li>
                  <li>Una chiave API di Google Gemini (gratuita su Google AI Studio).</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-white print:text-black mb-1">Passaggi:</h4>
                <ol className="list-decimal pl-6 text-sm space-y-2 font-mono text-neutral-400 print:text-gray-700">
                  <li>Scarica il codice sorgente del progetto ed estrailo in una cartella.</li>
                  <li>Apri il terminale (Prompt dei comandi o PowerShell) in quella cartella.</li>
                  <li>Esegui il comando: <code className="text-blue-400">npm install</code> per installare le dipendenze.</li>
                  <li>Crea un file chiamato <code className="text-blue-400">.env</code> nella cartella principale.</li>
                  <li>Apri il file .env e inserisci la tua chiave API in questo formato:<br/>
                      <code className="text-emerald-400 bg-neutral-950 print:bg-white px-2 py-1 rounded block mt-1">VITE_GEMINI_API_KEY=la_tua_chiave_qui</code>
                  </li>
                  <li>Esegui il comando: <code className="text-blue-400">npm run dev</code></li>
                  <li>Apri il browser all'indirizzo <code className="text-blue-400">http://localhost:5173</code> (o quello indicato nel terminale).</li>
                </ol>
              </div>
            </div>
          </section>

          <div className="pt-8 text-center text-sm text-neutral-500 print:text-gray-500 border-t border-neutral-800 print:border-gray-300">
            <p>AI Movie Studio - Sviluppato per uso personale.</p>
            <p>Le API di Google Gemini potrebbero essere soggette a limiti di utilizzo gratuiti.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
