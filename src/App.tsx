import { useState } from 'react';
import { motion } from 'motion/react';
import { Film, Wand2, Library, ArrowRight, FileEdit } from 'lucide-react';
import MovieRenamer from './MovieRenamer';

const CustomLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="logoGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="50%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#c084fc" />
      </linearGradient>
      <linearGradient id="logoGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1e3a8a" />
        <stop offset="100%" stopColor="#4c1d95" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    
    <rect x="10" y="10" width="100" height="100" rx="28" fill="url(#logoGradDark)" opacity="0.6" />
    <rect x="10" y="10" width="100" height="100" rx="28" stroke="url(#logoGradMain)" strokeWidth="3" />
    
    <circle cx="22" cy="30" r="3.5" fill="#0a0a0a" />
    <circle cx="22" cy="60" r="3.5" fill="#0a0a0a" />
    <circle cx="22" cy="90" r="3.5" fill="#0a0a0a" />
    <circle cx="98" cy="30" r="3.5" fill="#0a0a0a" />
    <circle cx="98" cy="60" r="3.5" fill="#0a0a0a" />
    <circle cx="98" cy="90" r="3.5" fill="#0a0a0a" />

    <path d="M42 40 L78 60 L42 80 Z" fill="url(#logoGradMain)" filter="url(#glow)" />
    
    <path d="M85 15 Q90 25 100 30 Q90 35 85 45 Q80 35 70 30 Q80 25 85 15 Z" fill="#ffffff" filter="url(#glow)" />
  </svg>
);

export default function App() {
  const [view, setView] = useState<'home' | 'renamer' | 'catalog' | 'metadata'>('home');

  if (view === 'renamer') {
    return <MovieRenamer onBack={() => setView('home')} />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-5xl mx-auto flex flex-col items-center"
      >
        {/* Logo Area */}
        <div className="mb-16 flex flex-col items-center">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-6">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", duration: 1 }}
              className="w-24 h-24 md:w-28 md:h-28 relative flex-shrink-0"
            >
              <CustomLogo className="w-full h-full drop-shadow-[0_0_20px_rgba(99,102,241,0.5)]" />
            </motion.div>
            <div className="flex flex-col items-center md:items-start">
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-white via-blue-100 to-indigo-300 bg-clip-text text-transparent text-center md:text-left drop-shadow-sm">
                AI Movie Studio
              </h1>
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-3 px-4 py-1.5 rounded-full bg-neutral-900/80 border border-neutral-800 text-sm font-medium text-neutral-300 shadow-lg flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Ideato da <span className="text-white font-semibold">Fiore Luongo</span>
              </motion.div>
            </div>
          </div>
          <p className="text-neutral-400 text-lg md:text-xl text-center max-w-2xl leading-relaxed mt-4">
            La tua suite intelligente per la gestione cinematografica. Usa l'Intelligenza Artificiale per organizzare, rinominare e catalogare la tua libreria.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
          {/* Renamer Card */}
          <motion.button
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView('renamer')}
            className="group relative text-left bg-neutral-900/40 hover:bg-neutral-800/60 backdrop-blur-xl border border-neutral-800 hover:border-blue-500/50 p-8 rounded-3xl transition-all duration-300 overflow-hidden shadow-xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 border border-blue-500/20 group-hover:bg-blue-500/20 group-hover:border-blue-500/40 transition-all duration-300 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                <Wand2 className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3 flex items-center justify-between">
                Movie Renamer
                <ArrowRight className="w-6 h-6 text-neutral-600 group-hover:text-blue-400 transition-colors transform group-hover:translate-x-2" />
              </h2>
              <p className="text-neutral-400 leading-relaxed text-sm md:text-base">
                Pulisci e rinomina automaticamente i tuoi file video disordinati. Estrae titoli, anni, registi e metadati con precisione chirurgica grazie all'IA.
              </p>
            </div>
          </motion.button>

          {/* Catalog Card */}
          <motion.button
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {}}
            className="group relative text-left bg-neutral-900/20 backdrop-blur-xl border border-neutral-800/50 p-8 rounded-3xl transition-all duration-300 overflow-hidden shadow-xl cursor-not-allowed"
          >
            <div className="absolute top-6 right-6 z-20">
              <span className="bg-purple-500/10 text-purple-400 text-xs font-bold px-3 py-1.5 rounded-full border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.2)] uppercase tracking-wider">
                In Arrivo
              </span>
            </div>
            <div className="relative z-10 opacity-50 group-hover:opacity-70 transition-opacity duration-300">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                <Library className="w-8 h-8 text-purple-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3 flex items-center justify-between">
                Movie Catalog
              </h2>
              <p className="text-neutral-400 leading-relaxed text-sm md:text-base">
                Organizza, esplora e gestisci la tua collezione. Scarica locandine, trame e dettagli in un'interfaccia elegante e moderna.
              </p>
            </div>
          </motion.button>

          {/* Metadata Card */}
          <motion.button
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {}}
            className="group relative text-left bg-neutral-900/20 backdrop-blur-xl border border-neutral-800/50 p-8 rounded-3xl transition-all duration-300 overflow-hidden shadow-xl cursor-not-allowed"
          >
            <div className="absolute top-6 right-6 z-20">
              <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-full border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)] uppercase tracking-wider">
                In Arrivo
              </span>
            </div>
            <div className="relative z-10 opacity-50 group-hover:opacity-70 transition-opacity duration-300">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                <FileEdit className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3 flex items-center justify-between">
                Edit Metadata
              </h2>
              <p className="text-neutral-400 leading-relaxed text-sm md:text-base">
                Modifica e scrivi i metadati interni (titolo, anno, cover) direttamente nei tuoi file video per una compatibilità perfetta con i player.
              </p>
            </div>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
