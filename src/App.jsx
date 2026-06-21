import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Search, BookOpen, 
  ChevronRight, ChevronLeft, EyeOff, 
  Eye, Volume2, Info, CheckCircle2, List,
  Trophy, LogIn, PlayCircle, HelpCircle, X,
  Loader2, Sparkles, Volume1, VolumeX, FastForward,
  Check, Headphones, Hash, Languages, Type
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
  { id: 'ar.mahermuaiqly', name: 'Maher Al-Muaiqly' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq El-Minshawi' },
  { id: 'ar.abdulsamad', name: 'Abdul Basit Abdus Samad' }
];

const BISMILLAH_ARABIC = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

// Firebase Setup using global variables provided by environment (MANDATORY)
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
const appId = 'tanzeel-lite-v1';

/**
 * Robust utility to strip Bismillah using word-tokenization.
 */
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
  const [verseSearch, setVerseSearch] = useState(""); // New: Verse search state
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

  // Visibility flags for optional text fields
  const [showTranslation, setShowTranslation] = useState(true);
  const [showTransliteration, setShowTransliteration] = useState(true);

  const audioRef = useRef(new Audio());
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenErr) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Critical Auth failure:", e);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (view === 'loading') {
        setView(u ? 'menu' : 'auth');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'data', 'progress');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setMemorizedAyahs(docSnap.data().ayahs || {});
      }
    }, (error) => {
      console.error("Firestore sync error:", error);
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
      .then(data => { 
        setSurahs(data.data); 
        setLoading(false); 
      });
  }, []);

  useEffect(() => {
    if (!selectedSurah) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    // Fetching Arabic text, English translation, and Audio along with English Transliteration edition
    fetch(`${API_BASE}/surah/${selectedSurah.number}/editions/quran-uthmani,en.sahih,${reciter},en.transliteration`, {
      signal: abortControllerRef.current.signal
    })
      .then(res => res.json())
      .then(data => {
        const arabic = data.data[0].ayahs;
        const english = data.data[1].ayahs;
        const audio = data.data[2].ayahs;
        const roman = data.data[3].ayahs;
        
        setAyahs(arabic.map((ayah, i) => ({
          number: ayah.numberInSurah,
          text: i === 0 ? stripBismillah(ayah.text, selectedSurah.number) : ayah.text,
          translation: english[i].text,
          audio: audio[i].audio,
          transliteration: roman[i].text
        })));
        setActiveAyahIndex(0);
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') setLoading(false);
      });
  }, [selectedSurah, reciter]);

  useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => {
      if (mode === 'listen') {
        if (activeAyahIndex < ayahs.length - 1) {
          setActiveAyahIndex(prev => prev + 1);
        } else {
          setIsPlaying(false);
        }
      } else {
        setCurrentLoop(prevLoop => {
          if (prevLoop < loopCount) {
            audio.currentTime = 0;
            setTimeout(() => {
              audio.play().catch(e => console.log("Mobile playback error:", e));
            }, 50);
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
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (ayahs[activeAyahIndex]) {
      const audio = audioRef.current;
      audio.pause();
      audio.src = ayahs[activeAyahIndex].audio;
      audio.load();
      setCurrentLoop(1);
      if (isPlaying) audio.play().catch(() => {});
    }
  }, [activeAyahIndex, ayahs]);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // New: Handle jumping to a specific verse
  const jumpToVerse = (e) => {
    e.preventDefault();
    const verseNum = parseInt(verseSearch);
    if (!isNaN(verseNum) && verseNum > 0 && verseNum <= ayahs.length) {
      setActiveAyahIndex(verseNum - 1);
      setVerseSearch("");
    }
  };

  const filteredSurahs = useMemo(() => 
    surahs.filter(s => 
      s.englishName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.number.toString() === searchQuery ||
      s.englishNameTranslation.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [surahs, searchQuery]
  );

  const toggleQuickMasterId = (id) => {
    setSelectedQuickMasterIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleQuickMaster = async () => {
    if (selectedQuickMasterIds.length === 0) return;
    setLoading(true);
    try {
      let newMemorized = { ...memorizedAyahs };
      for (const surahId of selectedQuickMasterIds) {
        const response = await fetch(`${API_BASE}/surah/${surahId}/editions/quran-uthmani`);
        const data = await response.json();
        const surahAyahs = data.data[0].ayahs;
        surahAyahs.forEach(ayah => {
          newMemorized[`${surahId}:${ayah.numberInSurah}`] = true;
        });
      }
      await updateMemorizedData(newMemorized);
      setSelectedQuickMasterIds([]);
      setIsQuickMasterModalOpen(false);
    } catch (e) {
      console.error("Quick master failed", e);
    } finally {
      setLoading(false);
    }
  };

  const resumeSurah = useMemo(() => {
    if (surahs.length === 0) return null;
    const candidates = surahs.map(s => {
      const masteredCount = Object.keys(memorizedAyahs).filter(key => key.startsWith(`${s.number}:`)).length;
      const percentage = (masteredCount / s.numberOfAyahs) * 100;
      return { ...s, mastery: percentage, remaining: s.numberOfAyahs - masteredCount };
    });
    const inProgress = candidates.filter(c => c.mastery > 0 && c.mastery < 100);
    if (inProgress.length === 0) return null;
    return inProgress.sort((a, b) => {
      if (b.mastery !== a.mastery) return b.mastery - a.mastery;
      return a.remaining - b.remaining;
    })[0];
  }, [surahs, memorizedAyahs]);

  const masteryPercentage = useMemo(() => {
    if (!selectedSurah || ayahs.length === 0) return 0;
    const count = ayahs.filter(a => memorizedAyahs[`${selectedSurah.number}:${a.number}`]).length;
    return Math.round((count / ayahs.length) * 100);
  }, [selectedSurah, ayahs, memorizedAyahs]);

  if (view === 'loading') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3]">
        <div className="relative scale-110 transition-transform duration-500">
            <Loader2 className="animate-spin text-[#1e3a31]" size={72} strokeWidth={1} />
            <BookOpen className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#c29b40] animate-pulse" size={26} />
        </div>
        <p className="text-[#1e3a31] font-heading mt-6 tracking-[0.25em] uppercase text-xs opacity-80 animate-pulse">TanzeelLite</p>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6 pattern-bg transition-opacity duration-500">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] border-t-8 border-[#c29b40] shadow-2xl p-10 text-center space-y-8 transform hover:scale-[1.01] transition-transform duration-500">
          <div className="w-24 h-24 bg-[#1e3a31] rounded-full flex items-center justify-center mx-auto shadow-xl border-4 border-[#fdfaf3]">
            <BookOpen size={44} className="text-[#c29b40]" />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-heading text-[#1e3a31] tracking-wide">TanzeelLite</h1>
            <div className="h-0.5 w-16 bg-[#c29b40] mx-auto opacity-60"></div>
            <p className="text-slate-500 font-light tracking-wide text-sm">Memorise the Quran today</p>
          </div>
          <div className="space-y-4 pt-4">
            <button 
              onClick={async () => {
                const provider = new GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' }); 
                try {
                  await signInWithPopup(auth, provider);
                } catch (e) {
                  console.error("Login failed:", e);
                }
              }} 
              className="w-full py-4 bg-[#1e3a31] text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-[#2a4e42] active:scale-[0.99] transition-all shadow-lg shadow-emerald-900/10"
            >
              <LogIn size={20} className="text-[#c29b40]" /> Continue with Google
            </button>
            <button 
              onClick={() => setView('menu')} 
              className="w-full py-4 bg-transparent border-2 border-slate-100 text-slate-400 rounded-xl font-bold hover:bg-slate-50 hover:text-slate-500 active:scale-[0.99] transition-all"
            >
              Start as Guest
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6 pattern-bg animate-in fade-in duration-500">
        <div className="w-full max-w-lg space-y-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-2">
                <div className="h-0.5 w-12 bg-[#c29b40]"></div>
            </div>
            <h1 className="text-5xl font-heading text-[#1e3a31] tracking-tight">Assalamualaikum</h1>
            <p className="text-[#8b7d6b] italic font-light text-lg">"If Allah permits it, you will one day memorise the Quran!"</p>
          </div>
          
          <div className="space-y-5">
            <button onClick={() => { setMode('manual'); setView('browser'); }} className="w-full group p-8 bg-[#1e3a31] rounded-[2rem] text-white flex items-center justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-900/20 active:scale-[0.99]">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1 tracking-wide">Begin Journey</h3>
                <p className="text-emerald-100/60 text-sm font-light">Browse through the Sacred Verses</p>
              </div>
              <div className="p-4 bg-[#c29b40] rounded-full text-[#1e3a31] group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <PlayCircle size={28} />
              </div>
            </button>

            <button onClick={() => { setMode('listen'); setView('browser'); }} className="w-full group p-8 bg-[#c29b40] rounded-[2rem] text-[#1e3a31] flex items-center justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-yellow-900/20 active:scale-[0.99]">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1 tracking-wide">Listen</h3>
                <p className="text-[#1e3a31]/60 text-sm font-light">Continuous Surah Playback</p>
              </div>
              <div className="p-4 bg-[#1e3a31] rounded-full text-[#c29b40] group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <Headphones size={28} />
              </div>
            </button>

            <button onClick={() => setView('how-to')} className="w-full group p-8 bg-white border border-[#e8dfca] rounded-[2rem] text-[#1e3a31] flex items-center justify-between transition-all duration-300 hover:bg-[#faf7f0] hover:-translate-y-0.5 active:scale-[0.99]">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1 tracking-wide">Manual</h3>
                <p className="text-slate-500 text-sm font-light">Guidelines for memorization</p>
              </div>
              <HelpCircle size={32} className="text-[#c29b40] group-hover:rotate-12 transition-transform duration-300" />
            </button>
          </div>
          
          {user && (
            <button onClick={() => signOut(auth)} className="w-full py-2 text-[#c29b40] text-xs font-bold hover:underline tracking-widest uppercase opacity-80 hover:opacity-100 transition-opacity">
              Sign Out
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === 'how-to') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center bg-[#fdfaf3] p-6 pt-20 pattern-bg animate-in fade-in duration-500">
        <div className="w-full max-w-2xl bg-white rounded-[3rem] p-10 shadow-2xl relative border border-[#e8dfca] transform transition-transform duration-500">
          <button onClick={() => setView('menu')} className="absolute top-8 right-8 p-2 bg-[#fdfaf3] rounded-full text-[#1e3a31] hover:text-[#c29b40] hover:scale-110 transition-all">
            <X size={20} />
          </button>
          <h2 className="text-3xl font-heading text-[#1e3a31] mb-8 border-b border-[#e8dfca] pb-4 tracking-wide">Memorization Guide</h2>
          <div className="space-y-8 text-[#5c5346] leading-relaxed">
            <section className="flex gap-5 items-start">
                <div className="h-9 w-9 rounded-full bg-[#1e3a31] text-[#c29b40] flex items-center justify-center shrink-0 font-bold shadow-md">1</div>
                <div>
                    <h4 className="font-bold text-[#1e3a31] mb-1 text-lg">Repetition (Tikrar)</h4>
                    <p className="font-light text-slate-600">Use the 3x, 5x, or 10x loop modes. Listen until the rhythm of the verse feels natural to your tongue.</p>
                </div>
            </section>
            <section className="flex gap-5 items-start">
                <div className="h-9 w-9 rounded-full bg-[#1e3a31] text-[#c29b40] flex items-center justify-center shrink-0 font-bold shadow-md">2</div>
                <div>
                    <h4 className="font-bold text-[#1e3a31] mb-1 text-lg">Listen Mode</h4>
                    <p className="font-light text-slate-600">Switch to Listen mode to hear a Surah from start to finish without interruptions, perfect for revision.</p>
                </div>
            </section>
          </div>
          <button onClick={() => { setMode('manual'); setView('browser'); }} className="w-full mt-10 py-4 bg-[#1e3a31] text-white rounded-2xl font-bold shadow-lg shadow-emerald-900/20 hover:bg-[#2a4e42] active:scale-[0.99] transition-all">Understood</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#fdfaf3] text-[#1e3a31] font-sans flex flex-col items-center">
      <header className="w-full bg-white border-b border-[#e8dfca]/80 p-5 flex flex-col md:flex-row justify-between items-center px-8 shadow-sm gap-4 transition-all sticky top-0 z-40 backdrop-blur-md bg-white/90">
        {!selectedSurah ? (
          <>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button onClick={() => setView('menu')} className="p-2 hover:bg-[#faf7f0] rounded-full text-[#c29b40] transition-colors">
                <ChevronLeft size={24} />
              </button>
              <h1 className="text-2xl font-heading text-[#1e3a31] tracking-wide">TanzeelLite</h1>
            </div>
            <div className="relative w-full md:w-85">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c29b40]" size={18} />
              <input 
                type="text" 
                placeholder="Search Surah (Name or Number)..." 
                className="w-full bg-[#fdfaf3] border border-[#e8dfca] rounded-2xl py-3 pl-12 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#c29b40]/30 focus:bg-white transition-all duration-300" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b7d6b] hover:text-[#1e3a31] transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => { setSelectedSurah(null); setIsPlaying(false); audioRef.current.pause(); }} className="flex items-center gap-2 text-[#8b7d6b] hover:text-[#1e3a31] transition-all duration-300 hover:-translate-x-0.5">
              <ChevronLeft size={24} /> <span className="font-heading text-base tracking-wide">Return to Library</span>
            </button>
            
            {/* New: Verse Search Header Element */}
            <form onSubmit={jumpToVerse} className="relative w-40">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c29b40]" size={14} />
              <input 
                type="text"
                placeholder="Jump to..."
                className="w-full bg-[#fdfaf3] border border-[#e8dfca] rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#c29b40]/30 focus:bg-white transition-all duration-300"
                value={verseSearch}
                onChange={(e) => setVerseSearch(e.target.value)}
              />
            </form>

            <div className="text-right border-l-2 border-[#c29b40] pl-4">
               <h2 className="font-heading text-xl text-[#1e3a31] tracking-wide">{selectedSurah.englishName}</h2>
               <p className="text-[10px] text-[#8b7d6b] uppercase tracking-[0.2em] font-bold mt-0.5">Ayah {activeAyahIndex + 1} / {selectedSurah.numberOfAyahs}</p>
            </div>
          </>
        )}
      </header>

      {selectedSurah && (
        <div className="w-full max-w-5xl px-8 pt-6 animate-in fade-in duration-300">
          <div className="w-full h-1.5 bg-[#e8dfca]/60 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-gradient-to-r from-[#c29b40] to-[#dfb85d] transition-all duration-1000 ease-out" style={{ width: `${masteryPercentage}%` }} />
          </div>
        </div>
      )}

      <main className="w-full max-w-6xl flex-1 flex flex-col items-center justify-center p-6 text-center">
        {!selectedSurah ? (
          <div className="w-full animate-in fade-in duration-500">
            {!searchQuery && (
              <div className="w-full mb-10 bg-white/60 border border-[#e8dfca] rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-300 hover:bg-white hover:shadow-md">
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <FastForward size={16} className="text-[#c29b40]" />
                    <span className="text-[10px] font-black text-[#c29b40] uppercase tracking-[0.3em]">Quick Mastery</span>
                  </div>
                  <h3 className="text-xl font-heading text-[#1e3a31] tracking-wide">Skip to Full Mastery</h3>
                  <p className="text-[#8b7d6b] text-xs font-light mt-0.5">Already know a Surah? Mark multiple as finished instantly.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <button 
                    onClick={() => setIsQuickMasterModalOpen(true)}
                    className="flex-1 md:w-64 bg-white border border-[#e8dfca] rounded-xl px-4 py-3 text-sm text-[#8b7d6b] text-left flex items-center justify-between group hover:border-[#c29b40] transition-all duration-300"
                  >
                    <span className="truncate">{selectedQuickMasterIds.length > 0 ? `${selectedQuickMasterIds.length} Surahs Selected` : "Select Surahs..."}</span>
                    <ChevronRight size={18} className="text-[#c29b40] group-hover:translate-x-1 transition-transform duration-300" />
                  </button>
                  <button 
                    onClick={handleQuickMaster}
                    disabled={selectedQuickMasterIds.length === 0 || loading}
                    className="px-6 py-3 bg-[#1e3a31] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#2a4e42] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center gap-2 shadow-sm"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {resumeSurah && !searchQuery && (
              <div className="w-full mb-10 text-left animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={16} className="text-[#c29b40]" />
                  <span className="text-[10px] font-black text-[#c29b40] uppercase tracking-[0.3em]">Continue Journey</span>
                </div>
                <button 
                  onClick={() => setSelectedSurah(resumeSurah)}
                  className="w-full bg-[#1e3a31] rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between group relative overflow-hidden shadow-2xl shadow-emerald-900/30 border border-[#c29b40]/20 transform transition-all duration-500 hover:-translate-y-1 hover:shadow-emerald-900/40 active:scale-[0.99]"
                >
                  <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-[#c29b40]/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none transition-all group-hover:scale-110 duration-700"></div>
                  <div className="relative z-10 space-y-3 md:space-y-1 text-center md:text-left">
                    <p className="text-[#c29b40] text-[10px] font-bold tracking-[0.15em] uppercase">Almost there • {resumeSurah.remaining} Ayahs left</p>
                    <h2 className="text-3xl md:text-4xl font-heading text-white tracking-wide">{resumeSurah.englishName}</h2>
                    <p className="text-emerald-100/40 text-xs font-light tracking-wide">{resumeSurah.englishNameTranslation} • Surah {resumeSurah.number}</p>
                  </div>
                  <div className="flex flex-col items-center md:items-end gap-3 mt-6 md:mt-0 relative z-10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-heading text-[#c29b40]">{Math.round(resumeSurah.mastery)}</span>
                      <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">% Mastery</span>
                    </div>
                    <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden shadow-inner">
                      <div className="h-full bg-[#c29b40] transition-all duration-1000 ease-out" style={{ width: `${resumeSurah.mastery}%` }} />
                    </div>
                  </div>
                </button>
              </div>
            )}

            {filteredSurahs.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-4 justify-start">
                  <List size={16} className="text-[#8b7d6b]" />
                  <span className="text-[10px] font-black text-[#8b7d6b] uppercase tracking-[0.3em]">Surah Library</span>
                </div>
                <div className="grid grid-cols-1 gap-5 w-full py-4 max-w-2xl mx-auto">
                  {filteredSurahs.map(s => {
                    const totalAyahs = s.numberOfAyahs;
                    const masteredCount = Object.keys(memorizedAyahs).filter(key => key.startsWith(`${s.number}:`)).length;
                    const surahMastery = Math.round((masteredCount / totalAyahs) * 100);
                    const isFullyMastered = surahMastery === 100;
                    return (
                      <button 
                        key={s.number} 
                        onClick={() => setSelectedSurah(s)} 
                        className={`p-6 transition-all duration-300 text-left flex justify-between items-center group relative overflow-hidden rounded-2xl border-b-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.995] ${
                          isFullyMastered 
                          ? 'bg-[#1e3a31] border-[#c29b40] text-white shadow-emerald-900/10' 
                          : 'bg-white border-[#e8dfca] hover:border-[#c29b40]/40 text-[#1e3a31]'
                        }`}
                      >
                        <div className="flex flex-col relative z-10 max-w-[70%]">
                           <p className={`text-[9px] font-black tracking-wider mb-1 ${isFullyMastered ? 'text-[#c29b40]' : 'text-[#8b7d6b]'}`}>SURAH {s.number}</p>
                           <h3 className="text-xl font-heading font-bold tracking-wide transition-transform duration-300 group-hover:translate-x-0.5">{s.englishName}</h3>
                           <p className={`text-[10px] mt-1.5 font-bold uppercase tracking-wide truncate ${isFullyMastered ? 'text-emerald-100/50' : 'opacity-60'}`}>
                             {s.numberOfAyahs} VERSES • {s.englishNameTranslation}
                           </p>
                           <div className="mt-3.5 flex items-center gap-2.5">
                              <div className={`h-1 w-14 rounded-full overflow-hidden shadow-inner ${isFullyMastered ? 'bg-[#c29b40]/20' : 'bg-slate-100'}`}>
                                <div className={`h-full transition-all duration-500 bg-[#c29b40]`} style={{ width: `${surahMastery}%` }}></div>
                              </div>
                              <span className={`text-[9px] font-black tracking-widest uppercase ${isFullyMastered ? 'text-[#c29b40]' : 'text-[#8b7d6b]'}`}>
                                {surahMastery}% Surah Mastery
                              </span>
                           </div>
                        </div>
                        <div className="text-right relative z-10 flex flex-col justify-center h-full">
                          <p className={`font-arabic text-4xl transition-transform duration-300 group-hover:scale-105 ${isFullyMastered ? 'text-[#c29b40]' : 'text-[#1e3a31]'}`}>{s.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-16 text-center space-y-4 animate-in fade-in duration-300">
                <Search size={40} className="mx-auto text-[#e8dfca]" />
                <p className="text-[#8b7d6b] font-heading text-lg">No Surahs found matching "{searchQuery}"</p>
                <button onClick={() => setSearchQuery("")} className="text-[#c29b40] font-bold text-xs uppercase tracking-widest hover:underline transition-all">Clear Search</button>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full space-y-10 py-4 animate-in fade-in duration-500">
            {/* Optional text display customization interface */}
            <div className="flex justify-center gap-4 mb-2">
              <button 
                onClick={() => setShowTransliteration(!showTransliteration)} 
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all duration-300 ${showTransliteration ? 'bg-[#c29b40]/10 border-[#c29b40] text-[#1e3a31]' : 'bg-white border-[#e8dfca] text-slate-400'}`}
              >
                <Type size={14} /> Transliteration {showTransliteration ? "On" : "Off"}
              </button>
              <button 
                onClick={() => setShowTranslation(!showTranslation)} 
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all duration-300 ${showTranslation ? 'bg-[#c29b40]/10 border-[#c29b40] text-[#1e3a31]' : 'bg-white border-[#e8dfca] text-slate-400'}`}
              >
                <Languages size={14} /> Translation {showTranslation ? "On" : "Off"}
              </button>
            </div>

            <div className="relative p-8 md:p-14 bg-[#fffcf5] rounded-[2.5rem] border border-[#e8dfca] shadow-inner overflow-hidden mx-auto max-w-5xl min-h-[250px] flex items-center justify-center">
              <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none pattern-bg"></div>
              <div className="relative flex flex-col items-center justify-center space-y-8 w-full">
                {activeAyahIndex === 0 && selectedSurah.number !== 1 && selectedSurah.number !== 9 && (
                  <div className="flex items-center gap-5 text-[#c29b40]/50 mb-1 animate-in fade-in duration-500">
                    <div className="h-px w-8 bg-current opacity-20"></div>
                    <p className="font-arabic text-xl md:text-2xl">{BISMILLAH_ARABIC}</p>
                    <div className="h-px w-8 bg-current opacity-20"></div>
                  </div>
                )}
                <div className={`w-full transition-all duration-700 ease-out transform ${isTextHidden ? 'blur-2xl opacity-0 scale-[0.97]' : 'blur-0 opacity-100 scale-100'} space-y-8`}>
                  <p className="font-arabic text-2xl md:text-4xl leading-[2.6] text-[#1e3a31] drop-shadow-[0_1px_1px_rgba(0,0,0,0.03)] text-center w-full max-w-4xl mx-auto transition-all duration-300" style={{ direction: 'rtl' }}>
                    {ayahs[activeAyahIndex]?.text}
                  </p>

                  {/* Render phonetic romanization text optionally */}
                  {showTransliteration && ayahs[activeAyahIndex]?.transliteration && (
                    <p className="text-[#c29b40] font-sans tracking-wide text-sm md:text-base max-w-3xl mx-auto opacity-90 italic">
                      {ayahs[activeAyahIndex].transliteration}
                    </p>
                  )}

                  {showTranslation && (
                    <>
                      <div className="flex justify-center items-center gap-4 my-6 opacity-60">
                        <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#c29b40]/40"></div>
                        <div className="w-1.5 h-1.5 rotate-45 border border-[#c29b40]"></div>
                        <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#c29b40]/40"></div>
                      </div>
                      <p className="text-[#5c5346] text-lg md:text-2xl font-body italic max-w-3xl mx-auto leading-[1.65] px-4 opacity-90">
                        "{ayahs[activeAyahIndex]?.translation}"
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center space-y-10">
              <div className="flex items-center gap-8 md:gap-10">
                <button 
                  onClick={() => setIsTextHidden(!isTextHidden)} 
                  className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all duration-300 shadow-sm active:scale-[0.93] ${isTextHidden ? 'bg-[#c29b40] border-[#c29b40] text-[#1e3a31] shadow-md scale-105' : 'bg-white border-[#e8dfca] text-[#1e3a31] hover:bg-[#faf7f0] hover:border-[#c29b40]/40'}`}
                >
                  {isTextHidden ? <Eye size={26} /> : <EyeOff size={26} />}
                </button>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center bg-[#1e3a31] rounded-full shadow-xl p-3 gap-6 border-4 border-[#c29b40]/10">
                      <button 
                        onClick={() => setActiveAyahIndex(p => Math.max(0, p - 1))} 
                        disabled={activeAyahIndex === 0} 
                        className="p-2 text-white/30 hover:text-[#c29b40] disabled:opacity-5 transition-colors duration-200 active:scale-90"
                      >
                        <ChevronLeft size={36}/>
                      </button>
                      <button 
                        onClick={togglePlay} 
                        className="w-20 h-20 bg-[#c29b40] text-[#1e3a31] rounded-full flex items-center justify-center shadow-md hover:brightness-105 hover:scale-[1.03] transition-all transform active:scale-95 duration-300"
                      >
                        {isPlaying ? <Pause size={38} fill="currentColor" /> : <Play size={38} fill="currentColor" className="ml-1" />}
                      </button>
                      <button 
                        onClick={() => setActiveAyahIndex(p => Math.min(ayahs.length - 1, p + 1))} 
                        disabled={activeAyahIndex === ayahs.length - 1} 
                        className="p-2 text-white/30 hover:text-[#c29b40] disabled:opacity-5 transition-colors duration-200 active:scale-90"
                      >
                        <ChevronRight size={36}/>
                      </button>
                    </div>
                </div>
                <button 
                  onClick={() => { audioRef.current.currentTime = 0; audioRef.current.play(); setIsPlaying(true); }} 
                  className="w-14 h-14 rounded-full bg-white border border-[#e8dfca] flex items-center justify-center text-[#1e3a31] hover:bg-[#faf7f0] hover:border-[#c29b40]/40 shadow-sm active:scale-[0.93] transition-all duration-300 group"
                >
                  <RotateCcw size={24} className="group-hover:-rotate-45 transition-transform duration-300" />
                </button>
              </div>

              <div className="w-full max-w-xl flex flex-col items-center gap-2.5 group px-4">
                 <div className="flex justify-between w-full text-[10px] font-bold text-[#8b7d6b] uppercase tracking-widest transition-opacity group-hover:opacity-100 opacity-80">
                    <span>{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
                    {mode !== 'listen' && <span className="text-[#c29b40] font-black">Iteration {currentLoop} / {loopCount}</span>}
                    <span>{new Date(duration * 1000).toISOString().substr(14, 5)}</span>
                 </div>
                 <div className="w-full relative py-2 flex items-center">
                   <input 
                      type="range" min="0" max={duration || 0} value={currentTime} onChange={handleSeek}
                      className="w-full accent-[#c29b40] h-1.5 cursor-pointer rounded-full bg-[#e8dfca]/70 appearance-none transition-all group-hover:h-2"
                   />
                 </div>
              </div>

              {mode !== 'listen' && (
                <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500 pt-2">
                  <span className="text-[10px] font-black text-[#c29b40] uppercase tracking-[0.25em] opacity-80">Ayah Iterations</span>
                  <div className="flex bg-[#1e3a31]/5 p-1.5 rounded-2xl border border-[#e8dfca]/60 shadow-inner">
                    {[1, 3, 5, 10].map(count => (
                      <button 
                        key={count} 
                        onClick={() => setLoopCount(count)} 
                        className={`px-8 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 active:scale-[0.95] ${loopCount === count ? 'bg-[#1e3a31] text-white shadow-md' : 'text-[#1e3a31]/50 hover:text-[#1e3a31] hover:bg-white/40'}`}
                      >
                        {count}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6 w-full max-w-2xl mx-auto pt-6">
              <button 
                onClick={() => {
                  const key = `${selectedSurah.number}:${ayahs[activeAyahIndex].number}`;
                  const next = {...memorizedAyahs};
                  if (next[key]) delete next[key]; else next[key] = true;
                  updateMemorizedData(next);
                }}
                className={`flex flex-col items-center gap-2.5 py-6 rounded-[2rem] font-heading transition-all duration-300 border-2 active:scale-[0.98] shadow-sm ${memorizedAyahs[`${selectedSurah.number}:${ayahs[activeAyahIndex]?.number}`] ? 'bg-[#1e3a31] border-[#c29b40] text-[#c29b40] shadow-md shadow-emerald-950/10' : 'bg-white border-[#e8dfca] text-[#1e3a31] hover:border-[#c29b40]/50'}`}
              >
                <CheckCircle2 size={24} />
                <span className="text-xs font-bold uppercase tracking-widest">
                   {memorizedAyahs[`${selectedSurah.number}:${ayahs[activeAyahIndex]?.number}`] ? "Ayah Mastered" : "Mark as Mastered"}
                </span>
              </button>
              
              <button 
                onClick={() => { 
                  setTafsir("Seeking knowledge..."); 
                  setShowTafsir(true); 
                  fetch(`${API_BASE}/ayah/${selectedSurah.number}:${ayahs[activeAyahIndex].number}/en.asad`)
                    .then(r => r.json())
                    .then(d => setTafsir(d.data.text)); 
                }} 
                className="flex flex-col items-center gap-2.5 py-6 rounded-[2rem] bg-white border-2 border-[#e8dfca] text-[#1e3a31] font-heading hover:border-[#c29b40]/50 active:scale-[0.98] transition-all duration-300 shadow-sm"
              >
                <BookOpen size={24} className="text-[#c29b40]" />
                <span className="text-xs font-bold uppercase tracking-widest">View Tafsir</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {selectedSurah && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1e3a31] text-white px-6 py-3.5 rounded-full shadow-2xl flex items-center gap-5 border border-[#c29b40]/20 z-20 backdrop-blur-md bg-opacity-95 transform transition-all duration-300 hover:border-[#c29b40]/40">
          <div className="flex items-center gap-3 border-r border-white/10 pr-5 group/vol">
            <button onClick={() => setVolume(v => v === 0 ? 1 : 0)} className="text-[#c29b40] active:scale-90 transition-transform">
                {volume === 0 ? <VolumeX size={18} /> : volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
            </button>
            <input 
                type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))}
                className="w-16 accent-[#c29b40] h-1 bg-white/10 rounded-full appearance-none cursor-pointer transition-all group-hover/vol:w-20"
            />
          </div>
          <div className="relative flex items-center">
            <select value={reciter} onChange={(e) => setReciter(e.target.value)} className="bg-transparent text-xs font-heading focus:outline-none appearance-none cursor-pointer pr-4 border-none text-emerald-100 hover:text-white transition-colors">
              {RECITERS.map(r => <option key={r.id} value={r.id} className="text-slate-900">{r.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {isQuickMasterModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-emerald-950/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl border-t-[10px] border-[#c29b40] animate-in zoom-in-95 duration-300">
            <div className="p-6 md:p-8 border-b border-[#e8dfca] flex justify-between items-center bg-[#fdfaf3]">
              <div>
                <h3 className="font-heading text-2xl text-[#1e3a31] tracking-wide">Multi-Master Surahs</h3>
                <p className="text-[#8b7d6b] text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">Select all the Surahs you have memorized</p>
              </div>
              <button onClick={() => setIsQuickMasterModalOpen(false)} className="p-2.5 bg-white border border-[#e8dfca] rounded-full text-[#1e3a31] hover:text-[#c29b40] hover:scale-105 transition-all shadow-sm"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#fdfaf3]/30 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {surahs.map(s => {
                  const isSelected = selectedQuickMasterIds.includes(s.number);
                  return (
                    <button key={s.number} onClick={() => toggleQuickMasterId(s.number)} className={`p-4 rounded-xl text-left transition-all duration-200 border-2 flex items-center justify-between group active:scale-[0.98] ${isSelected ? 'bg-[#1e3a31] border-[#c29b40] text-white shadow-md' : 'bg-white border-[#e8dfca] text-[#1e3a31] hover:border-[#c29b40]/40'}`}>
                      <div className="flex flex-col min-w-[75%]">
                        <span className={`text-[9px] font-black uppercase tracking-wide ${isSelected ? 'text-[#c29b40]' : 'text-[#8b7d6b]'}`}>Surah {s.number}</span>
                        <span className="font-heading text-sm truncate mt-0.5">{s.englishName}</span>
                      </div>
                      <div className={`w-5.5 h-5.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-[#c29b40] border-[#c29b40]' : 'border-[#e8dfca]'}`}>{isSelected && <Check size={12} className="text-[#1e3a31]" strokeWidth={4} />}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="p-6 md:p-8 border-t border-[#e8dfca] bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <p className="text-sm font-bold text-[#1e3a31]">{selectedQuickMasterIds.length} Surahs Selected</p>
                <p className="text-[10px] text-[#8b7d6b] uppercase tracking-wide mt-0.5">This action will mark every ayah in these surahs as mastered.</p>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button onClick={() => setSelectedQuickMasterIds([])} className="flex-1 sm:px-6 py-3.5 border-2 border-[#e8dfca] text-[#8b7d6b] hover:text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">Clear All</button>
                <button onClick={handleQuickMaster} disabled={selectedQuickMasterIds.length === 0 || loading} className="flex-[2] sm:px-8 py-3.5 bg-[#1e3a31] text-[#c29b40] rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-950/10 hover:bg-[#2a4e42] disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Confirm Mastery
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTafsir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-emerald-950/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-3xl rounded-[3rem] p-8 md:p-12 shadow-2xl border-t-[10px] border-[#c29b40] animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-heading text-2xl md:text-3xl text-[#1e3a31] tracking-wide">Deep Reflection</h3>
              <button onClick={() => setShowTafsir(false)} className="p-2 hover:bg-[#faf7f0] rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X size={26}/></button>
            </div>
            <div className="max-h-[45vh] overflow-y-auto text-[#5c5346] leading-[1.8] text-lg md:text-xl font-body italic pr-6 custom-scrollbar text-justify opacity-90">
                {tafsir}
            </div>
            <button onClick={() => setShowTafsir(false)} className="w-full mt-10 py-4 bg-[#1e3a31] text-[#c29b40] rounded-2xl font-bold tracking-[0.15em] uppercase text-xs shadow-md hover:bg-[#2a4e42] transition-colors active:scale-[0.99]">Close Reflection</button>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cinzel:wght@400;700;900&display=swap');
        .font-arabic { font-family: 'Scheherazade New', serif; word-spacing: 0.15em; letter-spacing: 0.05em; line-height: 2.8; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
        .font-body { font-family: 'Playfair Display', serif; }
        .font-heading { font-family: 'Cinzel', serif; }
        .pattern-bg { background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l15 30-15 30L15 30z' fill='%23c29b40' fill-opacity='0.04' fill-rule='evenodd'/%3E%3C/svg%3E"); }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #fdfaf3; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #c29b40; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;

import { createRoot } from 'react-dom/client';
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
