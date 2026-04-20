import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Search, BookOpen, 
  ChevronRight, ChevronLeft, EyeOff, 
  Eye, Volume2, Info, CheckCircle2, List,
  Trophy, LogIn, PlayCircle, HelpCircle, X,
  Loader2, Sparkles, Volume1, VolumeX, FastForward,
  Check
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
  const [activeAyahIndex, setActiveAyahIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopCount, setLoopCount] = useState(1);
  const [currentLoop, setCurrentLoop] = useState(1);
  const [isTextHidden, setIsTextHidden] = useState(false);
  const [reciter, setReciter] = useState(RECITERS[0].id);
  const [tafsir, setTafsir] = useState(null);
  const [showTafsir, setShowTafsir] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const [isQuickMasterModalOpen, setIsQuickMasterModalOpen] = useState(false);
  const [selectedQuickMasterIds, setSelectedQuickMasterIds] = useState([]);

  // --- NEW FEATURES STATE (Inserted at Line 104) ---
  const [khusyukMode, setKhusyukMode] = useState(false);
  const [lockedSurahId, setLockedSurahId] = useState(null);
  const [phase, setPhase] = useState('tikrah'); // 'tikrah' | 'hifz'
  const [tikrahRange, setTikrahRange] = useState({ start: 1, end: 7 });
  const [tikrahRepetitions, setTikrahRepetitions] = useState(10);
  const [isInfinite, setIsInfinite] = useState(false);

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
      .catch(err => {
        if (err.name !== 'AbortError') setLoading(false);
      });
  }, [selectedSurah, reciter]);

  // --- NEW LOGIC: TIKRAH & HIFZ (Inserted at Line 202) ---
  const toggleKhusyuk = () => {
    if (!khusyukMode) {
      const rec = resumeSurah || surahs[0];
      if (rec) setLockedSurahId(rec.number);
      setKhusyukMode(true);
    } else {
      setKhusyukMode(false);
      setLockedSurahId(null);
      setPhase('tikrah');
    }
  };

  const isAyahMastered = (surahNum, ayahNum) => !!memorizedAyahs[`${surahNum}:${ayahNum}`];
  
  const canGoNext = useMemo(() => {
    if (phase !== 'hifz') return true;
    return isAyahMastered(selectedSurah?.number, ayahs[activeAyahIndex]?.number);
  }, [phase, activeAyahIndex, memorizedAyahs, selectedSurah, ayahs]);

  useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => {
      if (phase === 'tikrah') {
        setCurrentLoop(prev => {
          if (!isInfinite && prev >= tikrahRepetitions) {
            const currentAyahNum = ayahs[activeAyahIndex]?.number;
            if (currentAyahNum < tikrahRange.end) {
              setActiveAyahIndex(prevIdx => prevIdx + 1);
              return 1;
            } else {
              setIsPlaying(false);
              return 1;
            }
          }
          audio.currentTime = 0;
          setTimeout(() => audio.play().catch(() => {}), 50);
          return prev + 1;
        });
      } else {
        // Original loop logic for Hifz/Normal
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
  }, [loopCount, phase, tikrahRepetitions, isInfinite, activeAyahIndex, tikrahRange, ayahs]);

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
        <div className="relative">
            <Loader2 className="animate-spin text-[#1e3a31]" size={64} strokeWidth={1} />
            <BookOpen className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#c29b40]" size={24} />
        </div>
        <p className="text-[#1e3a31] font-heading mt-4 tracking-widest uppercase text-xs">TanzeelLite</p>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6 pattern-bg">
        <div className="w-full max-w-md bg-white rounded-[2rem] border-t-8 border-[#c29b40] shadow-2xl p-10 text-center space-y-8">
          <div className="w-24 h-24 bg-[#1e3a31] rounded-full flex items-center justify-center mx-auto shadow-inner">
            <BookOpen size={48} className="text-[#c29b40]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-heading text-[#1e3a31]">TanzeelLite</h1>
            <div className="h-px w-24 bg-[#c29b40] mx-auto"></div>
            <p className="text-slate-500 font-light">Your modern path to traditional mastery</p>
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
              className="w-full py-4 bg-[#1e3a31] text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-[#2a4e42] transition-all shadow-lg shadow-emerald-900/20"
            >
              <LogIn size={20} className="text-[#c29b40]" /> Continue with Google
            </button>
            <button onClick={() => setView('menu')} className="w-full py-4 bg-transparent border-2 border-slate-100 text-slate-400 rounded-xl font-bold hover:bg-slate-50 transition-all">Start as Guest</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6 pattern-bg">
        <div className="w-full max-w-lg space-y-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-4"><div className="h-1 w-12 bg-[#c29b40]"></div></div>
            <h1 className="text-5xl font-heading text-[#1e3a31] tracking-tight">Assalamualaikum</h1>
            <p className="text-[#8b7d6b] italic font-light text-lg">"If Allah permits it, you will one day memorise the Quran!"</p>
          </div>
          <div className="space-y-4">
            <button onClick={() => setView('browser')} className="w-full group p-8 bg-[#1e3a31] rounded-[2rem] text-white flex items-center justify-between transition-all hover:translate-y-[-4px] shadow-xl shadow-emerald-900/30">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1">Begin Journey</h3>
                <p className="text-emerald-100/60 text-sm font-light">Browse through the Sacred Verses</p>
              </div>
              <div className="p-4 bg-[#c29b40] rounded-full text-[#1e3a31]"><PlayCircle size={32} /></div>
            </button>
            <button onClick={() => setView('how-to')} className="w-full p-8 bg-white border border-[#e8dfca] rounded-[2rem] text-[#1e3a31] flex items-center justify-between transition-all hover:bg-[#faf7f0]">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1">Manual</h3>
                <p className="text-slate-500 text-sm font-light">Guidelines for memorization</p>
              </div>
              <HelpCircle size={32} className="text-[#c29b40]" />
            </button>
          </div>
          {user && <button onClick={() => signOut(auth)} className="w-full py-2 text-[#c29b40] text-xs font-bold hover:underline tracking-widest uppercase">Sign Out</button>}
        </div>
      </div>
    );
  }

  if (view === 'how-to') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center bg-[#fdfaf3] p-6 pt-20 pattern-bg">
        <div className="w-full max-w-2xl bg-white rounded-[3rem] p-10 shadow-2xl relative border border-[#e8dfca]">
          <button onClick={() => setView('menu')} className="absolute top-8 right-8 p-2 bg-[#fdfaf3] rounded-full text-[#1e3a31] hover:text-[#c29b40]"><X size={20} /></button>
          <h2 className="text-3xl font-heading text-[#1e3a31] mb-8 border-b border-[#e8dfca] pb-4">Memorization Guide</h2>
          <div className="space-y-8 text-[#5c5346] leading-relaxed">
            <section className="flex gap-4">
                <div className="h-8 w-8 rounded-full bg-[#1e3a31] text-[#c29b40] flex items-center justify-center shrink-0 font-bold">1</div>
                <div><h4 className="font-bold text-[#1e3a31] mb-1">Repetition (Tikrar)</h4><p className="font-light">Use the 3x, 5x, or 10x loop modes. Listen until the rhythm of the verse feels natural to your tongue.</p></div>
            </section>
            <section className="flex gap-4">
                <div className="h-8 w-8 rounded-full bg-[#1e3a31] text-[#c29b40] flex items-center justify-center shrink-0 font-bold">2</div>
                <div><h4 className="font-bold text-[#1e3a31] mb-1">Visualization</h4><p className="font-light">Hide the text and try to recite. If you stumble, reveal the text for a second, then hide it again.</p></div>
            </section>
          </div>
          <button onClick={() => setView('browser')} className="w-full mt-10 py-4 bg-[#1e3a31] text-white rounded-2xl font-bold shadow-lg shadow-emerald-900/20">Understood</button>
        </div>
      </div>
    );
  }

  return (
    // --- UPDATED KHUSYUK THEME (Inserted at Line 418) ---
    <div className={`w-full min-h-screen transition-all duration-1000 flex flex-col items-center ${
      khusyukMode 
      ? 'bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-blue-100' 
      : 'bg-[#fdfaf3] text-[#1e3a31]'
    } font-sans`}>
      
      <header className="w-full bg-white border-b border-[#e8dfca] p-6 flex flex-col md:flex-row justify-between items-center px-8 shadow-sm gap-4">
        {!selectedSurah ? (
          <>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button onClick={() => setView('menu')} className="p-2 hover:bg-[#faf7f0] rounded-full text-[#c29b40]"><ChevronLeft size={24} /></button>
              <h1 className="text-2xl font-heading text-[#1e3a31]">TanzeelLite</h1>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c29b40]" size={18} />
              <input type="text" placeholder="Search Surah (Name or Number)..." className="w-full bg-[#fdfaf3] border border-[#e8dfca] rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#c29b40]/20 transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b7d6b] hover:text-[#1e3a31]"><X size={16} /></button>}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => { setSelectedSurah(null); setIsPlaying(false); audioRef.current.pause(); }} className="flex items-center gap-2 text-[#8b7d6b] hover:text-[#1e3a31] transition-colors">
              <ChevronLeft size={24} /> <span className="font-heading text-lg">Return to Library</span>
            </button>
            <div className="text-right border-l-2 border-[#c29b40] pl-4">
               <h2 className="font-heading text-xl text-[#1e3a31]">{selectedSurah.englishName}</h2>
               <p className="text-[10px] text-[#8b7d6b] uppercase tracking-widest font-bold">Ayah {activeAyahIndex + 1} / {selectedSurah.numberOfAyahs}</p>
            </div>
          </>
        )}
      </header>

      {selectedSurah && (
        <div className="w-full max-w-5xl px-8 pt-6">
          <div className="w-full h-1 bg-[#e8dfca] rounded-full overflow-hidden"><div className="h-full bg-[#c29b40] transition-all duration-700 ease-out" style={{ width: `${masteryPercentage}%` }} /></div>
        </div>
      )}

      <main className="w-full max-w-6xl flex-1 flex flex-col items-center justify-center p-6 text-center">
        {!selectedSurah ? (
          <div className="w-full">
            {/* KHUSYUK TOGGLE (Line 588 Area) */}
            <div className="flex items-center justify-between mb-6 w-full max-w-2xl mx-auto">
              <div className="flex items-center gap-2">
                <List size={16} className={khusyukMode ? "text-blue-300" : "text-[#8b7d6b]"} />
                <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${khusyukMode ? "text-blue-300" : "text-[#8b7d6b]"}`}>
                  {khusyukMode ? "Khusyuk Protocol Active" : "Surah Library"}
                </span>
              </div>
              <button onClick={toggleKhusyuk} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border ${khusyukMode ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-[0_0_15px_rgba(96,165,250,0.3)]' : 'bg-white border-[#e8dfca] text-[#1e3a31]'}`}>
                {khusyukMode ? "Disable Khusyuk Mode" : "Enable Khusyuk Mode"}
              </button>
            </div>

            {filteredSurahs.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 w-full py-8 max-w-2xl mx-auto">
                {filteredSurahs.map(s => {
                  const isLockedOut = khusyukMode && s.number !== lockedSurahId;
                  const masteredCount = Object.keys(memorizedAyahs).filter(key => key.startsWith(`${s.number}:`)).length;
                  const surahMastery = Math.round((masteredCount / s.numberOfAyahs) * 100);
                  const isFullyMastered = surahMastery === 100;

                  return (
                    <button key={s.number} disabled={isLockedOut} onClick={() => setSelectedSurah(s)} 
                      className={`p-6 border-b-4 transition-all text-left flex justify-between items-center group relative overflow-hidden rounded-2xl shadow-sm ${
                        isLockedOut ? 'opacity-20 grayscale cursor-not-allowed' : 'hover:shadow-md'
                      } ${isFullyMastered ? 'bg-[#1e3a31] border-[#c29b40] text-white' : 'bg-white border-[#e8dfca] hover:border-[#c29b40] text-[#1e3a31]'}`}>
                      <div className="flex flex-col relative z-10">
                         <p className={`text-[10px] font-black mb-1 ${isFullyMastered ? 'text-[#c29b40]' : 'text-[#8b7d6b]'}`}>SURAH {s.number}</p>
                         <h3 className="text-xl font-heading font-bold">{s.englishName}</h3>
                         <p className="text-[10px] mt-2 font-bold uppercase opacity-60">{s.numberOfAyahs} VERSES • {s.englishNameTranslation}</p>
                      </div>
                      <div className="text-right relative z-10"><p className="font-arabic text-4xl">{s.name}</p></div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="w-full space-y-12 py-6">
            <div className="relative p-10 md:p-16 bg-[#fffcf5] rounded-[3rem] border border-[#e8dfca] shadow-inner overflow-hidden mx-auto max-w-5xl">
              {/* HIFZ BLUR LOGIC (Line 643 Area) */}
              <div className={`transition-all duration-1000 transform ${
                (isTextHidden || (phase === 'hifz' && !isAyahMastered(selectedSurah.number, ayahs[activeAyahIndex]?.number))) 
                ? 'blur-3xl opacity-0 scale-95' 
                : 'blur-0 opacity-100 scale-100'
              }`}>
                <p className="font-arabic text-2xl md:text-4xl leading-[2.5] text-center w-full max-w-4xl" style={{ direction: 'rtl' }}>
                  {ayahs[activeAyahIndex]?.text}
                </p>
                <p className="text-[#5c5346] text-xl md:text-2xl font-body italic max-w-4xl mx-auto mt-8">
                  "{ayahs[activeAyahIndex]?.translation}"
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center space-y-12">
              <div className="flex items-center gap-10">
                <button onClick={() => setIsTextHidden(!isTextHidden)} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isTextHidden ? 'bg-[#c29b40] text-[#1e3a31]' : 'bg-white border text-[#1e3a31]'}`}>
                  {isTextHidden ? <Eye size={32} /> : <EyeOff size={32} />}
                </button>
                <div className="flex items-center bg-[#1e3a31] rounded-full p-4 gap-8">
                  <button onClick={() => setActiveAyahIndex(p => Math.max(0, p - 1))} className="text-white/40"><ChevronLeft size={40}/></button>
                  <button onClick={togglePlay} className="w-24 h-24 bg-[#c29b40] rounded-full flex items-center justify-center">
                    {isPlaying ? <Pause size={48} /> : <Play size={48} className="ml-2" />}
                  </button>
                  {/* NAV LOCK (Line 674 Area) */}
                  <button onClick={() => setActiveAyahIndex(p => Math.min(ayahs.length - 1, p + 1))} disabled={!canGoNext} className={`text-white/40 ${!canGoNext ? 'opacity-10 cursor-not-allowed' : ''}`}><ChevronRight size={40}/></button>
                </div>
              </div>

              {/* PHASE SWITCHER & TIKRAH PRO (Line 728 Area) */}
              <div className="flex gap-2 p-1 bg-black/10 rounded-2xl border border-white/5 w-full max-w-sm mx-auto">
                <button onClick={() => setPhase('tikrah')} className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${phase === 'tikrah' ? 'bg-[#c29b40] text-[#1e3a31]' : 'text-current opacity-50'}`}>Tikrah</button>
                <button onClick={() => setPhase('hifz')} className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${phase === 'hifz' ? 'bg-blue-500 text-white' : 'text-current opacity-50'}`}>Hifz</button>
              </div>

              {phase === 'tikrah' && (
                <div className="w-full max-w-2xl mx-auto p-8 bg-white/5 rounded-[2.5rem] border border-white/10 mt-8 space-y-6">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-60">Ayah Range</label>
                      <div className="flex items-center gap-2">
                        <input type="number" value={tikrahRange.start} onChange={e => setTikrahRange({...tikrahRange, start: parseInt(e.target.value)})} className="w-full bg-black/20 rounded-lg p-2 text-center" />
                        <span>-</span>
                        <input type="number" value={tikrahRange.end} onChange={e => setTikrahRange({...tikrahRange, end: parseInt(e.target.value)})} className="w-full bg-black/20 rounded-lg p-2 text-center" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-60">Repetitions</label>
                      <div className="flex items-center gap-2">
                        <input type="number" disabled={isInfinite} value={tikrahRepetitions} onChange={e => setTikrahRepetitions(parseInt(e.target.value))} className="w-full bg-black/20 rounded-lg p-2 text-center" />
                        <button onClick={() => setIsInfinite(!isInfinite)} className={`p-2 rounded-lg border ${isInfinite ? 'bg-[#c29b40] text-black' : 'border-white/10'}`}>∞</button>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setPhase('hifz')} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold uppercase tracking-widest text-xs">Start Hifz Phase</button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
import { createRoot } from 'react-dom/client';
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);

