import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Search, BookOpen, 
  ChevronRight, ChevronLeft, EyeOff, 
  Eye, Volume2, Info, CheckCircle2, List,
  Trophy, LogIn, PlayCircle, HelpCircle, X,
  Loader2, Sparkles, Volume1, VolumeX, FastForward,
  Check, Headphones
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection 
} from 'firebase/firestore';

// --- Configuration & Constants ---
const API_BASE = "https://api.alquran.cloud/v1";
const RECITERS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
  { id: 'ar.mahermuaiqly', name: 'Maher Al-Muaiqly' }, // Added as requested
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq El-Minshawi' },
  { id: 'ar.abdulsamad', name: 'Abdul Basit Abdus Samad' }
];

const BISMILLAH_ARABIC = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

// Firebase Setup
const firebaseConfig = {
  apiKey: "AIzaSyD9OD-pAQDf3pMMyqI3mzoUsQU_zaEhFR0",
  authDomain: "tanzeellite.firebaseapp.com",
  projectId: "tanzeellite",
  storageBucket: "tanzeellite.firebasestorage.app",
  messagingSenderId: "934906834665",
  appId: "1:934906834665:web:e073e5be1bb365d1cc4a78",
  measurementId: "G-VKDJTKSZTJ"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const stripBismillah = (text, surahNumber) => {
  if (surahNumber === 1 || surahNumber === 9) return text;
  const words = text.trim().split(/\s+/);
  if (words.length > 4 && words[0].includes("بِسْمِ")) {
    return words.slice(4).join(" ");
  }
  return text;
};

const App = () => {
  const [view, setView] = useState('loading');
  const [user, setUser] = useState(null);
  const [memorizedAyahs, setMemorizedAyahs] = useState({});
  const [surahs, setSurahs] = useState([]);
  const [selectedSurah, setSelectedSurah] = useState(null);
  const [ayahs, setAyahs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeAyahIndex, setActiveAyahIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopCount, setLoopCount] = useState(1);
  const [currentLoop, setCurrentLoop] = useState(1);
  const [isTextHidden, setIsTextHidden] = useState(false);
  const [reciter, setReciter] = useState(RECITERS[0].id);
  const [tafsir, setTafsir] = useState(null);
  const [showTafsir, setShowTafsir] = useState(false);
  const [mode, setMode] = useState('manual'); // 'manual' or 'listen'
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const [isQuickMasterModalOpen, setIsQuickMasterModalOpen] = useState(false);
  const [selectedQuickMasterIds, setSelectedQuickMasterIds] = useState([]);

  const audioRef = useRef(new Audio());
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Critical Auth failure:", e);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (view === 'loading') setView('menu');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'data', 'progress');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) setMemorizedAyahs(docSnap.data().ayahs || {});
    });
    return () => unsubscribe();
  }, [user]);

  const updateMemorizedData = async (newData) => {
    setMemorizedAyahs(newData);
    if (user) {
      const docRef = doc(db, 'users', user.uid, 'data', 'progress');
      await setDoc(docRef, { ayahs: newData }, { merge: true });
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/surah`)
      .then(res => res.json())
      .then(data => { setSurahs(data.data); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedSurah) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    fetch(`${API_BASE}/surah/${selectedSurah.number}/editions/quran-uthmani,en.sahih,${reciter}`, {
      signal: abortControllerRef.current.signal
    })
      .then(res => res.json())
      .then(data => {
        const arabic = data.data[0].ayahs;
        const english = data.data[1].ayahs;
        const audio = data.data[2].ayahs;
        
        setAyahs(arabic.map((ayah, i) => ({
          number: ayah.numberInSurah,
          text: i === 0 ? stripBismillah(ayah.text, selectedSurah.number) : ayah.text,
          translation: english[i].text,
          audio: audio[i].audio
        })));
        setActiveAyahIndex(0);
        setLoading(false);
      })
      .catch(err => { if (err.name !== 'AbortError') setLoading(false); });
  }, [selectedSurah, reciter]);

  useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => {
      if (mode === 'listen') {
        // Continuous Playback Logic
        if (activeAyahIndex < ayahs.length - 1) {
          setActiveAyahIndex(prev => prev + 1);
        } else {
          setIsPlaying(false);
        }
      } else {
        // Manual/Journey Looping Logic
        setCurrentLoop(prevLoop => {
          if (prevLoop < loopCount) {
            audio.currentTime = 0;
            setTimeout(() => audio.play().catch(() => {}), 50);
            return prevLoop + 1;
          } else {
            setIsPlaying(false);
            return 1;
          }
        });
      }
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [loopCount, mode, activeAyahIndex, ayahs]);

  useEffect(() => {
    if (ayahs[activeAyahIndex]) {
      const audio = audioRef.current;
      audio.src = ayahs[activeAyahIndex].audio;
      audio.load();
      if (isPlaying) audio.play().catch(() => {});
    }
  }, [activeAyahIndex, ayahs]);

  const togglePlay = () => {
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const filteredSurahs = useMemo(() => 
    surahs.filter(s => 
      s.englishName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.number.toString() === searchQuery
    ), [surahs, searchQuery]
  );

  const handleQuickMaster = async () => {
    if (selectedQuickMasterIds.length === 0) return;
    setLoading(true);
    try {
      let newMemorized = { ...memorizedAyahs };
      for (const surahId of selectedQuickMasterIds) {
        const response = await fetch(`${API_BASE}/surah/${surahId}/editions/quran-uthmani`);
        const data = await response.json();
        data.data[0].ayahs.forEach(ayah => {
          newMemorized[`${surahId}:${ayah.numberInSurah}`] = true;
        });
      }
      await updateMemorizedData(newMemorized);
      setSelectedQuickMasterIds([]);
      setIsQuickMasterModalOpen(false);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const masteryPercentage = useMemo(() => {
    if (!selectedSurah || ayahs.length === 0) return 0;
    const count = ayahs.filter(a => memorizedAyahs[`${selectedSurah.number}:${a.number}`]).length;
    return Math.round((count / ayahs.length) * 100);
  }, [selectedSurah, ayahs, memorizedAyahs]);

  if (view === 'loading') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3]">
        <Loader2 className="animate-spin text-[#1e3a31]" size={64} />
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6 pattern-bg">
        <div className="w-full max-w-lg space-y-6 text-center">
          <h1 className="text-5xl font-heading text-[#1e3a31]">Assalamualaikum</h1>
          <div className="grid gap-4 mt-12">
            <button onClick={() => { setMode('manual'); setView('browser'); }} className="w-full group p-8 bg-[#1e3a31] rounded-[2rem] text-white flex items-center justify-between transition-all hover:translate-y-[-4px] shadow-xl">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1">Begin Journey</h3>
                <p className="text-emerald-100/60 text-sm">Guided memorization session</p>
              </div>
              <PlayCircle size={32} className="text-[#c29b40]" />
            </button>

            <button onClick={() => { setMode('listen'); setView('browser'); }} className="w-full group p-8 bg-[#c29b40] rounded-[2rem] text-[#1e3a31] flex items-center justify-between transition-all hover:translate-y-[-4px] shadow-xl">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1">Listen</h3>
                <p className="text-[#1e3a31]/60 text-sm">Continuous Surah playback</p>
              </div>
              <Headphones size={32} />
            </button>

            <button onClick={() => setView('how-to')} className="w-full p-8 bg-white border border-[#e8dfca] rounded-[2rem] text-[#1e3a31] flex items-center justify-between transition-all">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1">Manual</h3>
                <p className="text-slate-500 text-sm">Memorization guidelines</p>
              </div>
              <HelpCircle size={32} className="text-[#c29b40]" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'how-to') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center bg-[#fdfaf3] p-6 pt-20 pattern-bg">
        <div className="w-full max-w-2xl bg-white rounded-[3rem] p-10 shadow-2xl relative border border-[#e8dfca]">
          <button onClick={() => setView('menu')} className="absolute top-8 right-8 p-2 text-[#1e3a31]"><X size={20} /></button>
          <h2 className="text-3xl font-heading text-[#1e3a31] mb-8">Memorization Guide</h2>
          <div className="space-y-6">
            <p>1. <strong>Tikrar:</strong> Use loops to fix the verse in your mind.</p>
            <p>2. <strong>Listen Mode:</strong> Use the new Listen option for full Surah flow without stops.</p>
          </div>
          <button onClick={() => setView('menu')} className="w-full mt-10 py-4 bg-[#1e3a31] text-white rounded-2xl font-bold">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#fdfaf3] text-[#1e3a31] font-sans flex flex-col items-center">
      <header className="w-full bg-white border-b border-[#e8dfca] p-6 flex justify-between items-center px-8 shadow-sm">
        <button onClick={() => { setSelectedSurah(null); setView('menu'); }} className="flex items-center gap-2 text-[#8b7d6b] hover:text-[#1e3a31]">
          <ChevronLeft size={24} /> <span className="font-heading">Return</span>
        </button>
        {selectedSurah && (
          <div className="text-right">
            <h2 className="font-heading text-xl">{selectedSurah.englishName}</h2>
            <p className="text-[10px] font-bold uppercase text-[#c29b40]">{mode} mode</p>
          </div>
        )}
      </header>

      <main className="w-full max-w-6xl flex-1 p-6">
        {!selectedSurah ? (
          <div className="grid grid-cols-1 gap-4 max-w-2xl mx-auto">
            <div className="relative mb-8">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c29b40]" size={18} />
              <input 
                type="text" placeholder="Search Surah..." 
                className="w-full bg-white border border-[#e8dfca] rounded-2xl py-3 pl-12 pr-4"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {filteredSurahs.map(s => (
              <button key={s.number} onClick={() => setSelectedSurah(s)} className="p-6 bg-white border border-[#e8dfca] rounded-2xl flex justify-between items-center hover:border-[#c29b40] transition-all">
                <div className="text-left">
                  <p className="text-[10px] font-black text-[#8b7d6b]">SURAH {s.number}</p>
                  <h3 className="text-xl font-heading font-bold">{s.englishName}</h3>
                </div>
                <p className="font-arabic text-3xl">{s.name}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-12 text-center">
             <div className="p-10 md:p-16 bg-[#fffcf5] rounded-[3rem] border border-[#e8dfca] shadow-inner relative overflow-hidden">
                {activeAyahIndex === 0 && selectedSurah.number !== 1 && selectedSurah.number !== 9 && (
                   <p className="font-arabic text-2xl text-[#c29b40]/60 mb-6">{BISMILLAH_ARABIC}</p>
                )}
                <div className={`${isTextHidden ? 'blur-2xl opacity-0' : 'opacity-100'} transition-all duration-700`}>
                  <p className="font-arabic text-3xl md:text-5xl leading-[2.5]" style={{ direction: 'rtl' }}>{ayahs[activeAyahIndex]?.text}</p>
                  <p className="text-[#5c5346] text-xl md:text-2xl font-body italic mt-8">"{ayahs[activeAyahIndex]?.translation}"</p>
                </div>
             </div>

             <div className="flex flex-col items-center gap-10">
                <div className="flex items-center gap-8">
                   <button onClick={() => setIsTextHidden(!isTextHidden)} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isTextHidden ? 'bg-[#c29b40] text-white' : 'bg-white border border-[#e8dfca]'}`}>
                      {isTextHidden ? <Eye size={32} /> : <EyeOff size={32} />}
                   </button>
                   <div className="flex items-center bg-[#1e3a31] rounded-full p-4 gap-6">
                      <button onClick={() => setActiveAyahIndex(p => Math.max(0, p - 1))} className="text-white/40 hover:text-[#c29b40]"><ChevronLeft size={40}/></button>
                      <button onClick={togglePlay} className="w-20 h-20 bg-[#c29b40] text-[#1e3a31] rounded-full flex items-center justify-center">
                         {isPlaying ? <Pause size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" className="ml-1" />}
                      </button>
                      <button onClick={() => setActiveAyahIndex(p => Math.min(ayahs.length - 1, p + 1))} className="text-white/40 hover:text-[#c29b40]"><ChevronRight size={40}/></button>
                   </div>
                   <button onClick={() => { audioRef.current.currentTime = 0; audioRef.current.play(); setIsPlaying(true); }} className="w-16 h-16 rounded-full bg-white border border-[#e8dfca] flex items-center justify-center">
                      <RotateCcw size={32} />
                   </button>
                </div>

                {mode !== 'listen' && (
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#c29b40]">Ayah Iterations</span>
                    <div className="flex bg-[#1e3a31]/5 p-2 rounded-2xl border border-[#e8dfca]">
                      {[1, 3, 5, 10].map(count => (
                        <button key={count} onClick={() => setLoopCount(count)} className={`px-8 py-2 rounded-xl text-sm font-bold transition-all ${loopCount === count ? 'bg-[#1e3a31] text-white' : 'text-[#1e3a31]/40'}`}>
                          {count}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}
      </main>

      {selectedSurah && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#1e3a31] text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-6 z-20">
          <select value={reciter} onChange={(e) => setReciter(e.target.value)} className="bg-transparent text-sm focus:outline-none appearance-none cursor-pointer pr-4 border-r border-white/10">
            {RECITERS.map(r => <option key={r.id} value={r.id} className="text-slate-900">{r.name}</option>)}
          </select>
          <div className="flex items-center gap-3">
             <Volume2 size={18} className="text-[#c29b40]" />
             <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-20 accent-[#c29b40]" />
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Playfair+Display:ital,wght@0,400;1,400&family=Cinzel:wght@400;700&display=swap');
        .font-arabic { font-family: 'Scheherazade New', serif; }
        .font-body { font-family: 'Playfair Display', serif; }
        .font-heading { font-family: 'Cinzel', serif; }
        .pattern-bg { background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l15 30-15 30L15 30z' fill='%23c29b40' fill-opacity='0.03'/%3E%3C/svg%3E"); }
      `}</style>
    </div>
  );
};

export default App;

import { createRoot } from 'react-dom/client';
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
