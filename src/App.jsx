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
 * This handles different Arabic encodings and non-breaking spaces.
 */
const stripBismillah = (text, surahNumber) => {
  // Surah Al-Fatiha (1) and At-Tawbah (9) should remain untouched.
  if (surahNumber === 1 || surahNumber === 9) return text;
  
  // 1. Trim whitespace and split by ANY whitespace character (handles hidden spaces)
  const words = text.trim().split(/\s+/);
  
  // 2. In Uthmani script, the Bismillah is consistently the first 4 tokens.
  // We check if the first token starts with "Bism" (بِسْمِ) to ensure we're stripping the right thing.
  if (words.length > 4 && words[0].includes("بِسْمِ")) {
    // Join all words starting from the 5th word (index 4)
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
  
  // Audio state tracking
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Quick Master State
  const [isQuickMasterModalOpen, setIsQuickMasterModalOpen] = useState(false);
  const [selectedQuickMasterIds, setSelectedQuickMasterIds] = useState([]);

  const audioRef = useRef(new Audio());
  const abortControllerRef = useRef(null);

  // Authentication Setup (Rule 3)
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

  // Firestore Sync (Rule 1 & 2)
  useEffect(() => {
  if (!user) return;
  
  // Updated path to ensure cloud sync works across all devices
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
    // Ensuring the save path matches the retrieval path exactly
    const docRef = doc(db, 'users', user.uid, 'data', 'progress');
    await setDoc(docRef, { ayahs: newData }, { merge: true });
  }
};

  // Fetch Surah List
  useEffect(() => {
    fetch(`${API_BASE}/surah`)
      .then(res => res.json())
      .then(data => { 
        setSurahs(data.data); 
        setLoading(false); 
      });
  }, []);

  // Fetch Ayahs when a Surah is selected
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

  // Handle Audio Looping (Single Ayah Only)
  useEffect(() => {
  const audio = audioRef.current;
  
  const handleEnded = () => {
    setCurrentLoop(prevLoop => {
      if (prevLoop < loopCount) {
        audio.currentTime = 0;
        // 50ms delay helps mobile browsers register the "new" play request
        setTimeout(() => {
          audio.play().catch(e => console.log("Mobile playback error:", e));
        }, 50);
        return prevLoop + 1;
      } else {
        setIsPlaying(false);
        return 1;
      }
    });
  };
  
  audio.addEventListener('ended', handleEnded);
  return () => audio.removeEventListener('ended', handleEnded);
}, [loopCount]);
  
  // Handle Volume
  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  // Load new audio source when Ayah changes
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

      // Process each selected surah sequentially to build the final object
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

  // Logic to find the surah closest to being finished
// Logic to find the surah closest to being finished
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

  // --- ADD THIS NEW BLOCK HERE ---
  const shortestRemainingSurah = useMemo(() => {
    if (surahs.length === 0) return null;

    const candidates = surahs.map(s => {
      const masteredCount = Object.keys(memorizedAyahs).filter(key => key.startsWith(`${s.number}:`)).length;
      return { ...s, isMastered: masteredCount === s.numberOfAyahs };
    });

    const incomplete = candidates.filter(c => !c.isMastered);
    if (incomplete.length === 0) return null;

    // Sorts by total length to find the easiest "Quick Win"
    return incomplete.sort((a, b) => a.numberOfAyahs - b.numberOfAyahs)[0];
  }, [surahs, memorizedAyahs]);
    
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
            <button 
              onClick={() => setView('menu')} 
              className="w-full py-4 bg-transparent border-2 border-slate-100 text-slate-400 rounded-xl font-bold hover:bg-slate-50 transition-all"
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
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6 pattern-bg">
        <div className="w-full max-w-lg space-y-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-4">
                <div className="h-1 w-12 bg-[#c29b40]"></div>
            </div>
            <h1 className="text-5xl font-heading text-[#1e3a31] tracking-tight">Assalamualaikum</h1>
            <p className="text-[#8b7d6b] italic font-light text-lg">"If Allah permits it, you will one day memorise the Quran!"</p>
          </div>
          
          <div className="space-y-4">
            <button onClick={() => setView('browser')} className="w-full group p-8 bg-[#1e3a31] rounded-[2rem] text-white flex items-center justify-between transition-all hover:translate-y-[-4px] shadow-xl shadow-emerald-900/30">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1">Begin Journey</h3>
                <p className="text-emerald-100/60 text-sm font-light">Browse through the Sacred Verses</p>
              </div>
              <div className="p-4 bg-[#c29b40] rounded-full text-[#1e3a31]">
                <PlayCircle size={32} />
              </div>
            </button>

            <button onClick={() => setView('how-to')} className="w-full p-8 bg-white border border-[#e8dfca] rounded-[2rem] text-[#1e3a31] flex items-center justify-between transition-all hover:bg-[#faf7f0]">
              <div className="text-left">
                <h3 className="text-2xl font-heading mb-1">Manual</h3>
                <p className="text-slate-500 text-sm font-light">Guidelines for memorization</p>
              </div>
              <HelpCircle size={32} className="text-[#c29b40]" />
            </button>
          </div>
          
          {user && (
            <button onClick={() => signOut(auth)} className="w-full py-2 text-[#c29b40] text-xs font-bold hover:underline tracking-widest uppercase">
              Sign Out
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === 'how-to') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center bg-[#fdfaf3] p-6 pt-20 pattern-bg">
        <div className="w-full max-w-2xl bg-white rounded-[3rem] p-10 shadow-2xl relative border border-[#e8dfca]">
          <button onClick={() => setView('menu')} className="absolute top-8 right-8 p-2 bg-[#fdfaf3] rounded-full text-[#1e3a31] hover:text-[#c29b40]">
            <X size={20} />
          </button>
          <h2 className="text-3xl font-heading text-[#1e3a31] mb-8 border-b border-[#e8dfca] pb-4">Memorization Guide</h2>
          <div className="space-y-8 text-[#5c5346] leading-relaxed">
            <section className="flex gap-4">
                <div className="h-8 w-8 rounded-full bg-[#1e3a31] text-[#c29b40] flex items-center justify-center shrink-0 font-bold">1</div>
                <div>
                    <h4 className="font-bold text-[#1e3a31] mb-1">Repetition (Tikrar)</h4>
                    <p className="font-light">Use the 3x, 5x, or 10x loop modes. Listen until the rhythm of the verse feels natural to your tongue.</p>
                </div>
            </section>
            <section className="flex gap-4">
                <div className="h-8 w-8 rounded-full bg-[#1e3a31] text-[#c29b40] flex items-center justify-center shrink-0 font-bold">2</div>
                <div>
                    <h4 className="font-bold text-[#1e3a31] mb-1">Visualization</h4>
                    <p className="font-light">Hide the text and try to recite. If you stumble, reveal the text for a second, then hide it again.</p>
                </div>
            </section>
          </div>
          <button onClick={() => setView('browser')} className="w-full mt-10 py-4 bg-[#1e3a31] text-white rounded-2xl font-bold shadow-lg shadow-emerald-900/20">Understood</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#fdfaf3] text-[#1e3a31] font-sans flex flex-col items-center">
      <header className="w-full bg-white border-b border-[#e8dfca] p-6 flex flex-col md:flex-row justify-between items-center px-8 shadow-sm gap-4">
        {!selectedSurah ? (
          <>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button onClick={() => setView('menu')} className="p-2 hover:bg-[#faf7f0] rounded-full text-[#c29b40]">
                <ChevronLeft size={24} />
              </button>
              <h1 className="text-2xl font-heading text-[#1e3a31]">TanzeelLite</h1>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c29b40]" size={18} />
              <input 
                type="text" 
                placeholder="Search Surah (Name or Number)..." 
                className="w-full bg-[#fdfaf3] border border-[#e8dfca] rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#c29b40]/20 transition-all" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b7d6b] hover:text-[#1e3a31]"
                >
                  <X size={16} />
                </button>
              )}
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
          <div className="w-full h-1 bg-[#e8dfca] rounded-full overflow-hidden">
            <div className="h-full bg-[#c29b40] transition-all duration-700 ease-out" style={{ width: `${masteryPercentage}%` }} />
          </div>
        </div>
      )}

      <main className="w-full max-w-6xl flex-1 flex flex-col items-center justify-center p-6 text-center">
        {!selectedSurah ? (
          <div className="w-full">
            {/* QUICK MASTER SECTION */}
            {!searchQuery && (
              <div className="w-full mb-12 bg-white/50 border border-[#e8dfca] rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <FastForward size={16} className="text-[#c29b40]" />
                    <span className="text-[10px] font-black text-[#c29b40] uppercase tracking-[0.3em]">Quick Mastery</span>
                  </div>
                  <h3 className="text-xl font-heading text-[#1e3a31]">Skip to Full Mastery</h3>
                  <p className="text-[#8b7d6b] text-xs font-light">Already know a Surah? Mark multiple as finished instantly.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <button 
                    onClick={() => setIsQuickMasterModalOpen(true)}
                    className="flex-1 md:w-64 bg-[#fdfaf3] border border-[#e8dfca] rounded-xl px-4 py-3 text-sm text-[#8b7d6b] text-left flex items-center justify-between group hover:border-[#c29b40] transition-all"
                  >
                    <span>{selectedQuickMasterIds.length > 0 ? `${selectedQuickMasterIds.length} Surahs Selected` : "Select Surahs..."}</span>
                    <ChevronRight size={18} className="text-[#c29b40] group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button 
                    onClick={handleQuickMaster}
                    disabled={selectedQuickMasterIds.length === 0 || loading}
                    className="px-6 py-3 bg-[#1e3a31] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#2a4e42] transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {/* CONTINUE JOURNEY SECTION */}
            {resumeSurah && !searchQuery && (
              <div className="w-full mb-12 text-left animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={16} className="text-[#c29b40]" />
                  <span className="text-[10px] font-black text-[#c29b40] uppercase tracking-[0.3em]">Continue Journey</span>
                </div>
                <button 
                  onClick={() => setSelectedSurah(resumeSurah)}
                  className="w-full bg-[#1e3a31] rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between group relative overflow-hidden shadow-2xl shadow-emerald-900/40 border border-[#c29b40]/30"
                >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#c29b40]/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none"></div>
                  
                  <div className="relative z-10 space-y-3 md:space-y-1 text-center md:text-left">
                    <p className="text-[#c29b40] text-[10px] font-bold tracking-widest uppercase">Almost there • {resumeSurah.remaining} Ayahs left</p>
                    <h2 className="text-3xl md:text-4xl font-heading text-white">{resumeSurah.englishName}</h2>
                    <p className="text-emerald-100/40 text-xs font-light tracking-wide">{resumeSurah.englishNameTranslation} • Surah {resumeSurah.number}</p>
                  </div>

                  <div className="flex flex-col items-center md:items-end gap-4 mt-6 md:mt-0 relative z-10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-heading text-[#c29b40]">{Math.round(resumeSurah.mastery)}</span>
                      <span className="text-xs text-white/40 font-bold uppercase tracking-widest">% Mastery</span>
                    </div>
                    <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[#c29b40] transition-all duration-1000" style={{ width: `${resumeSurah.mastery}%` }} />
                    </div>
                  </div>
                </button>
              </div>
            )}

            {filteredSurahs.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-6 justify-start">
                  <List size={16} className="text-[#8b7d6b]" />
                  <span className="text-[10px] font-black text-[#8b7d6b] uppercase tracking-[0.3em]">Surah Library</span>
                </div>
                <div className="grid grid-cols-1 gap-6 w-full py-8 max-w-2xl mx-auto">
                  {filteredSurahs.map(s => {
                    const totalAyahs = s.numberOfAyahs;
                    const masteredCount = Object.keys(memorizedAyahs).filter(key => key.startsWith(`${s.number}:`)).length;
                    const surahMastery = Math.round((masteredCount / totalAyahs) * 100);
                    const isFullyMastered = surahMastery === 100;

                    return (
                      <button 
                        key={s.number} 
                        onClick={() => setSelectedSurah(s)} 
                        className={`p-6 border-b-4 transition-all text-left flex justify-between items-center group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-md ${
                          isFullyMastered 
                          ? 'bg-[#1e3a31] border-[#c29b40] text-white shadow-emerald-900/20' 
                          : 'bg-white border-[#e8dfca] hover:border-[#c29b40] text-[#1e3a31]'
                        }`}
                      >
                        <div className="flex flex-col relative z-10">
                           <p className={`text-[10px] font-black mb-1 ${isFullyMastered ? 'text-[#c29b40]' : 'text-[#8b7d6b]'}`}>SURAH {s.number}</p>
                           <h3 className="text-xl font-heading font-bold group-hover:translate-x-1 transition-transform">{s.englishName}</h3>
                           <p className={`text-[10px] mt-2 font-bold uppercase ${isFullyMastered ? 'text-emerald-100/60' : 'opacity-60'}`}>
                             {s.numberOfAyahs} VERSES • {s.englishNameTranslation}
                           </p>
                           <div className="mt-3 flex items-center gap-2">
                              <div className={`h-1 w-12 rounded-full overflow-hidden ${isFullyMastered ? 'bg-[#c29b40]/20' : 'bg-slate-100'}`}>
                                <div className={`h-full transition-all duration-500 bg-[#c29b40]`} style={{ width: `${surahMastery}%` }}></div>
                              </div>
                              <span className={`text-[9px] font-black tracking-widest uppercase ${isFullyMastered ? 'text-[#c29b40]' : 'text-[#8b7d6b]'}`}>
                                {surahMastery}% Surah Mastery
                              </span>
                           </div>
                        </div>
                        <div className="text-right relative z-10">
                          <p className={`font-arabic text-4xl ${isFullyMastered ? 'text-[#c29b40]' : 'text-[#1e3a31]'}`}>{s.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-20 text-center space-y-4">
                <Search size={48} className="mx-auto text-[#e8dfca]" />
                <p className="text-[#8b7d6b] font-heading">No Surahs found matching "{searchQuery}"</p>
                <button onClick={() => setSearchQuery("")} className="text-[#c29b40] font-bold text-sm uppercase tracking-widest hover:underline">Clear Search</button>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full space-y-12 py-6">
            <div className="relative p-10 md:p-16 bg-[#fffcf5] rounded-[3rem] border border-[#e8dfca] shadow-inner overflow-hidden mx-auto max-w-5xl">
              <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none pattern-bg"></div>
              
              <div className="relative flex flex-col items-center justify-center space-y-10">
                {activeAyahIndex === 0 && selectedSurah.number !== 1 && selectedSurah.number !== 9 && (
                  <div className="flex items-center gap-6 text-[#c29b40]/60 mb-2">
                    <div className="h-px w-10 bg-current opacity-30"></div>
                    <p className="font-arabic text-2xl">{BISMILLAH_ARABIC}</p>
                    <div className="h-px w-10 bg-current opacity-30"></div>
                  </div>
                )}
                
                <div className={`transition-all duration-1000 transform ${isTextHidden ? 'blur-3xl opacity-0 scale-95' : 'blur-0 opacity-100 scale-100'}`}>
                  <p className="font-arabic text-2xl md:text-4xl leading-[2.5] text-[#1e3a31] drop-shadow-[0_1px_1px_rgba(0,0,0,0.05)] text-center w-full max-w-4xl" style={{ direction: 'rtl' }}>
                    {ayahs[activeAyahIndex]?.text}
                  </p>
                  
                  <div className="flex justify-center items-center gap-4 my-8">
                    <div className="h-px w-10 bg-gradient-to-r from-transparent to-[#c29b40]/40"></div>
                    <div className="w-1.5 h-1.5 rotate-45 border border-[#c29b40]"></div>
                    <div className="h-px w-10 bg-gradient-to-l from-transparent to-[#c29b40]/40"></div>
                  </div>

                  <p className="text-[#5c5346] text-xl md:text-2xl font-body italic max-w-4xl mx-auto leading-[1.6] px-4">
                    "{ayahs[activeAyahIndex]?.translation}"
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center space-y-12">
              <div className="flex items-center gap-10">
                <button onClick={() => setIsTextHidden(!isTextHidden)} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isTextHidden ? 'bg-[#c29b40] text-[#1e3a31] shadow-lg scale-110' : 'bg-white border border-[#e8dfca] text-[#1e3a31] hover:bg-[#faf7f0]'}`}>
                  {isTextHidden ? <Eye size={32} /> : <EyeOff size={32} />}
                </button>

                <div className="flex flex-col gap-4">
                    <div className="flex items-center bg-[#1e3a31] rounded-full shadow-2xl p-4 gap-8 border-4 border-[#c29b40]/20">
                    <button onClick={() => setActiveAyahIndex(p => Math.max(0, p - 1))} disabled={activeAyahIndex === 0} className="p-2 text-white/40 hover:text-[#c29b40] disabled:opacity-10 transition-colors"><ChevronLeft size={40}/></button>
                    <button onClick={togglePlay} className="w-24 h-24 bg-[#c29b40] text-[#1e3a31] rounded-full flex items-center justify-center shadow-lg hover:brightness-110 transition-all transform active:scale-95">
                        {isPlaying ? <Pause size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" className="ml-2" />}
                    </button>
                    <button onClick={() => setActiveAyahIndex(p => Math.min(ayahs.length - 1, p + 1))} disabled={activeAyahIndex === ayahs.length - 1} className="p-2 text-white/40 hover:text-[#c29b40] disabled:opacity-10 transition-colors"><ChevronRight size={40}/></button>
                    </div>
                </div>

                <button onClick={() => { audioRef.current.currentTime = 0; audioRef.current.play(); setIsPlaying(true); }} className="w-16 h-16 rounded-full bg-white border border-[#e8dfca] flex items-center justify-center text-[#1e3a31] hover:bg-[#faf7f0]">
                  <RotateCcw size={32} />
                </button>
              </div>

              <div className="w-full max-w-xl flex flex-col items-center gap-2 group">
                 <div className="flex justify-between w-full text-[10px] font-bold text-[#8b7d6b] uppercase tracking-widest">
                    <span>{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
                    <span>Iteration {currentLoop}/{loopCount}</span>
                    <span>{new Date(duration * 1000).toISOString().substr(14, 5)}</span>
                 </div>
                 <input 
                    type="range" 
                    min="0" 
                    max={duration || 0} 
                    value={currentTime} 
                    onChange={handleSeek}
                    className="w-full accent-[#c29b40] h-1.5 cursor-pointer rounded-full bg-[#e8dfca] appearance-none"
                 />
              </div>

              <div className="flex flex-col items-center gap-5">
                <span className="text-[11px] font-black text-[#c29b40] uppercase tracking-[0.3em]">Ayah Iterations</span>
                <div className="flex bg-[#1e3a31]/5 p-2 rounded-2xl border border-[#e8dfca]">
                  {[1, 3, 5, 10].map(count => (
                    <button key={count} onClick={() => setLoopCount(count)} className={`px-10 py-3 rounded-xl text-sm font-bold transition-all ${loopCount === count ? 'bg-[#1e3a31] text-white shadow-md' : 'text-[#1e3a31]/40 hover:text-[#1e3a31]'}`}>
                      {count}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 w-full max-w-2xl mx-auto pt-10">
              <button 
                onClick={() => {
                  const key = `${selectedSurah.number}:${ayahs[activeAyahIndex].number}`;
                  const next = {...memorizedAyahs};
                  if (next[key]) delete next[key]; else next[key] = true;
                  updateMemorizedData(next);
                }}
                className={`flex flex-col items-center gap-3 py-8 rounded-[2.5rem] font-heading transition-all border-2 ${memorizedAyahs[`${selectedSurah.number}:${ayahs[activeAyahIndex]?.number}`] ? 'bg-[#1e3a31] border-[#c29b40] text-[#c29b40]' : 'bg-white border-[#e8dfca] text-[#1e3a31] hover:border-[#c29b40]'}`}
              >
                <CheckCircle2 size={28} />
                <span className="text-sm font-bold uppercase tracking-widest">
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
                className="flex flex-col items-center gap-3 py-8 rounded-[2.5rem] bg-white border-2 border-[#e8dfca] text-[#1e3a31] font-heading hover:border-[#c29b40] transition-all"
              >
                <BookOpen size={28} className="text-[#c29b40]" />
                <span className="text-sm font-bold uppercase tracking-widest">View Tafsir</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {selectedSurah && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#1e3a31] text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-6 border border-[#c29b40]/30 z-20 backdrop-blur-sm bg-opacity-95">
          <div className="flex items-center gap-3 border-r border-white/10 pr-6">
            <button onClick={() => setVolume(v => v === 0 ? 1 : 0)} className="text-[#c29b40]">
                {volume === 0 ? <VolumeX size={20} /> : volume < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
            </button>
            <input 
                type="range" min="0" max="1" step="0.01" value={volume} 
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20 accent-[#c29b40] h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>
          <select value={reciter} onChange={(e) => setReciter(e.target.value)} className="bg-transparent text-sm font-heading focus:outline-none appearance-none cursor-pointer pr-4">
            {RECITERS.map(r => <option key={r.id} value={r.id} className="text-slate-900">{r.name}</option>)}
          </select>
        </div>
      )}

      {/* QUICK MASTER MODAL */}
      {isQuickMasterModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#1e3a31]/90 backdrop-blur-md">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border-t-[12px] border-[#c29b40]">
            <div className="p-8 border-b border-[#e8dfca] flex justify-between items-center bg-[#fdfaf3]">
              <div>
                <h3 className="font-heading text-2xl text-[#1e3a31]">Multi-Master Surahs</h3>
                <p className="text-[#8b7d6b] text-xs font-bold uppercase tracking-widest mt-1">Select all the Surahs you have memorized</p>
              </div>
              <button 
                onClick={() => setIsQuickMasterModalOpen(false)} 
                className="p-3 bg-white border border-[#e8dfca] rounded-full text-[#1e3a31] hover:text-[#c29b40] transition-colors shadow-sm"
              >
                <X size={24}/>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-[#fdfaf3]/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {surahs.map(s => {
                  const isSelected = selectedQuickMasterIds.includes(s.number);
                  return (
                    <button
                      key={s.number}
                      onClick={() => toggleQuickMasterId(s.number)}
                      className={`p-4 rounded-2xl text-left transition-all border-2 flex items-center justify-between group ${
                        isSelected 
                        ? 'bg-[#1e3a31] border-[#c29b40] text-white' 
                        : 'bg-white border-[#e8dfca] text-[#1e3a31] hover:border-[#c29b40]/50'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase ${isSelected ? 'text-[#c29b40]' : 'text-[#8b7d6b]'}`}>Surah {s.number}</span>
                        <span className="font-heading text-sm truncate">{s.englishName}</span>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'bg-[#c29b40] border-[#c29b40]' : 'border-[#e8dfca]'
                      }`}>
                        {isSelected && <Check size={14} className="text-[#1e3a31]" strokeWidth={4} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-8 border-t border-[#e8dfca] bg-white flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-left">
                <p className="text-sm font-bold text-[#1e3a31]">{selectedQuickMasterIds.length} Surahs Selected</p>
                <p className="text-[10px] text-[#8b7d6b] uppercase tracking-wider">This action will mark every ayah in these surahs as mastered.</p>
              </div>
              <div className="flex gap-4 w-full md:w-auto">
                <button 
                  onClick={() => setSelectedQuickMasterIds([])}
                  className="flex-1 md:px-8 py-4 border-2 border-[#e8dfca] text-[#8b7d6b] rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Clear All
                </button>
                <button 
                  onClick={handleQuickMaster}
                  disabled={selectedQuickMasterIds.length === 0 || loading}
                  className="flex-[2] md:px-12 py-4 bg-[#1e3a31] text-[#c29b40] rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-emerald-900/20 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  Confirm Mastery
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTafsir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-emerald-950/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-3xl rounded-[4rem] p-12 shadow-2xl border-t-[12px] border-[#c29b40]">
            <div className="flex justify-between items-center mb-10">
              <h3 className="font-heading text-3xl text-[#1e3a31]">Deep Reflection</h3>
              <button onClick={() => setShowTafsir(false)} className="p-2 hover:bg-[#faf7f0] rounded-full"><X size={32}/></button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto text-[#5c5346] leading-[1.8] text-2xl font-body italic pr-8 custom-scrollbar">
                {tafsir}
            </div>
            <button onClick={() => setShowTafsir(false)} className="w-full mt-12 py-6 bg-[#1e3a31] text-[#c29b40] rounded-3xl font-bold tracking-[0.2em] uppercase text-sm shadow-xl">Close Reflection</button>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cinzel:wght@400;700;900&display=swap');
        
        .font-arabic { 
          font-family: 'Scheherazade New', serif;
          word-spacing: 0.15em;
          letter-spacing: 0.05em;
          line-height: 2.8;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
        }
        
        .font-body { 
          font-family: 'Playfair Display', serif; 
        }
        
        .font-heading { 
          font-family: 'Cinzel', serif; 
        }

        .pattern-bg {
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l15 30-15 30L15 30z' fill='%23c29b40' fill-opacity='0.05' fill-rule='evenodd'/%3E%3C/svg%3E");
        }

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
