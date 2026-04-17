import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Search, BookOpen, 
  ChevronRight, ChevronLeft, EyeOff, 
  Eye, Volume2, Info, CheckCircle2, List,
  Trophy, LogIn, PlayCircle, HelpCircle, X,
  Loader2, Sparkles, Volume1, VolumeX, FastForward,
  Check, Moon, Lock
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

// --- Configuration & Constants ---\nconst API_BASE = "https://api.alquran.cloud/v1";
const RECITERS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq El-Minshawi' },
  { id: 'ar.abdulsamad', name: 'Abdul Basit Abdus Samad' }
];

const BISMILLAH_ARABIC = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

const App = () => {
  // --- States ---
  const [surahs, setSurahs] = useState([]);
  const [currentSurah, setCurrentSurah] = useState(null);
  const [ayahs, setAyahs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("library"); // library, recitation
  const [reciter, setReciter] = useState(RECITERS[0].id);
  const [audioState, setAudioState] = useState({ playing: false, currentAyah: null, loop: false });
  const [showTafsir, setShowTafsir] = useState(false);
  
  // Progress State
  const [masteredAyahs, setMasteredAyahs] = useState({});
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- NEW KHUSYUK STATES ---
  const [khusyukMode, setKhusyukMode] = useState(false);
  const [hifzPhase, setHifzPhase] = useState('tikrah'); // 'tikrah' or 'hifz'
  const [tikrahSettings, setTikrahSettings] = useState({
    startAyah: 1,
    endAyah: 1,
    reiterations: 1,
    currentCount: 0,
    infinite: false
  });

  const audioRef = useRef(new Audio());
  const scrollRef = useRef(null);

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
  // --- Auth & Data ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'progress');
    const unsub = onSnapshot(userDoc, (docSnap) => {
      if (docSnap.exists()) {
        setMasteredAyahs(docSnap.data().mastered || {});
      }
    }, (err) => console.error("Firestore error:", err));
    return () => unsub();
  }, [user]);

  const saveMastery = async (surahNumber, ayahNumber, isMastered) => {
    if (!user) return;
    const key = `${surahNumber}_${ayahNumber}`;
    const newMastery = { ...masteredAyahs, [key]: isMastered };
    setMasteredAyahs(newMastery);
    const userDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'progress');
    await setDoc(userDoc, { mastered: newMastery }, { merge: true });
  };

  // --- API Calls ---
  useEffect(() => {
    fetch(`${API_BASE}/surah`)
      .then(res => res.json())
      .then(data => {
        setSurahs(data.data);
        setLoading(false);
      });
  }, []);

  const loadSurah = async (number) => {
    setLoading(true);
    try {
      const [quranRes, transRes] = await Promise.all([
        fetch(`${API_BASE}/surah/${number}/${reciter}`),
        fetch(`${API_BASE}/surah/${number}/en.sahih`)
      ]);
      const quranData = await quranRes.json();
      const transData = await transRes.json();

      const combined = quranData.data.ayahs.map((ayah, i) => ({
        ...ayah,
        translation: transData.data.ayahs[i].text
      }));

      setAyahs(combined);
      setCurrentSurah(quranData.data);
      setActiveTab("recitation");
      
      // Default Tikrah Settings
      setTikrahSettings(prev => ({
        ...prev,
        startAyah: 1,
        endAyah: combined.length,
        currentCount: 0
      }));
      setHifzPhase('tikrah');

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- Audio Logic ---
  const playAyah = (index) => {
    if (index >= ayahs.length) {
      setAudioState({ ...audioState, playing: false, currentAyah: null });
      return;
    }
    const ayah = ayahs[index];
    audioRef.current.src = ayah.audio;
    audioRef.current.play();
    setAudioState({ ...audioState, playing: true, currentAyah: index });
  };

  useEffect(() => {
    const handleEnded = () => {
      if (hifzPhase === 'tikrah') {
        const { startAyah, endAyah, reiterations, currentCount, infinite } = tikrahSettings;
        const currentIdx = audioState.currentAyah;
        const rangeStart = startAyah - 1;
        const rangeEnd = endAyah - 1;

        if (currentIdx < rangeEnd) {
          // Play next in range
          playAyah(currentIdx + 1);
        } else {
          // Reached end of range
          if (infinite || currentCount < reiterations - 1) {
            setTikrahSettings(p => ({ ...p, currentCount: p.currentCount + 1 }));
            playAyah(rangeStart);
          } else {
            setAudioState({ ...audioState, playing: false });
            setTikrahSettings(p => ({ ...p, currentCount: 0 }));
          }
        }
      } else {
        // Simple single loop for Hifz phase if needed, or just stop
        setAudioState({ ...audioState, playing: false });
      }
    };

    audioRef.current.addEventListener('ended', handleEnded);
    return () => audioRef.current.removeEventListener('ended', handleEnded);
  }, [audioState, ayahs, tikrahSettings, hifzPhase]);

  // --- RECOMMENDATION LOGIC ---
  const recommendedSurah = useMemo(() => {
    if (!surahs.length || Object.keys(masteredAyahs).length === 0) return surahs[0];
    
    let bestSurah = surahs[0];
    let highestPercent = -1;

    surahs.forEach(s => {
      const total = s.numberOfAyahs;
      let count = 0;
      for (let i = 1; i <= total; i++) {
        if (masteredAyahs[`${s.number}_${i}`]) count++;
      }
      const percent = count / total;
      // We want the one closest to 100% but not yet 100%
      if (percent > highestPercent && percent < 1) {
        highestPercent = percent;
        bestSurah = s;
      }
    });

    return bestSurah;
  }, [surahs, masteredAyahs]);

  // --- UI Helpers ---
  const filteredSurahs = surahs.filter(s => 
    s.englishName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.number.toString() === searchQuery
  );

  const themeClasses = khusyukMode 
    ? "bg-slate-950 text-indigo-100 selection:bg-indigo-500/30" 
    : "bg-[#fdfcf8] text-[#2c2c2c] selection:bg-[#c29b40]/20";

  const cardClasses = khusyukMode
    ? "bg-indigo-900/20 border-indigo-500/30 hover:border-indigo-400"
    : "bg-white border-[#e8e4d9] hover:border-[#c29b40]/50";

  const accentBtn = khusyukMode
    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
    : "bg-[#c29b40] hover:bg-[#b08a35] text-white";

  if (authLoading) return (
    <div className="h-screen w-full flex items-center justify-center bg-[#fdfcf8]">
      <Loader2 className="animate-spin text-[#c29b40]" size={48} />
    </div>
  );

  return (
    <div className={`min-h-screen transition-colors duration-700 font-body ${themeClasses}`}>
      
      {/* Navigation Header */}
      <nav className={`sticky top-0 z-50 px-6 py-4 border-b backdrop-blur-md flex items-center justify-between ${khusyukMode ? 'bg-slate-950/80 border-indigo-900/50' : 'bg-white/80 border-[#e8e4d9]'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${khusyukMode ? 'bg-indigo-600' : 'bg-[#c29b40]'} text-white`}>
            <BookOpen size={24} />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold tracking-widest uppercase">
              {khusyukMode ? "Khusyuk Sanctuary" : "Al-Hafiz"}
            </h1>
            <p className="text-[10px] opacity-60 tracking-[0.3em] uppercase">Memorization Companion</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {activeTab === 'recitation' && (
            <button 
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${khusyukMode ? 'hover:bg-indigo-900/40' : 'hover:bg-[#f5f2e9]'}`}
            >
              <ChevronLeft size={18} /> Library
            </button>
          )}
          
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-current opacity-30 text-xs">
            <Trophy size={14} />
            <span>{Object.keys(masteredAyahs).length} Ayahs Mastered</span>
          </div>

          {user?.isAnonymous ? (
            <button className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-60 hover:opacity-100">
              <LogIn size={16} /> Save Progress
            </button>
          ) : (
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold uppercase">{user?.displayName || 'Student'}</span>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs text-white ${khusyukMode ? 'bg-indigo-500' : 'bg-[#c29b40]'}`}>
                 {user?.email?.[0]?.toUpperCase() || 'U'}
               </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6">
        
        {activeTab === "library" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Library Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-2">
                <h2 className={`text-4xl font-heading font-black tracking-tight ${khusyukMode ? 'text-indigo-300' : 'text-[#2c2c2c]'}`}>
                  {khusyukMode ? "Focused Study" : "Surah Library"}
                </h2>
                <p className="opacity-70 max-w-md">
                  {khusyukMode 
                    ? "Your surroundings are quieted. Focus on the word of Allah without distraction."
                    : "Begin your journey by selecting a Surah. Your progress is automatically saved to the cloud."}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={() => setKhusyukMode(!khusyukMode)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all transform hover:scale-105 active:scale-95 shadow-lg ${
                    khusyukMode 
                    ? "bg-slate-800 text-indigo-400 border border-indigo-500/50" 
                    : "bg-[#1a1a1a] text-[#c29b40] border border-white/10"
                  }`}
                >
                  <Moon size={18} fill={khusyukMode ? "currentColor" : "none"} />
                  {khusyukMode ? "Disable Khusyuk" : "Enable Khusyuk Mode"}
                </button>
                
                {!khusyukMode && (
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:opacity-100 transition-opacity" size={20} />
                    <input 
                      type="text"
                      placeholder="Search Surah..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 pr-6 py-3 bg-white border border-[#e8e4d9] rounded-2xl focus:ring-2 focus:ring-[#c29b40] outline-none w-64 transition-all"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Recommendation in Khusyuk Mode */}
            {khusyukMode && (
              <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8 shadow-2xl">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase tracking-widest text-xs">
                    <Sparkles size={16} /> Recommended Focus
                  </div>
                  <h3 className="text-3xl font-heading font-bold">Surah {recommendedSurah?.englishName}</h3>
                  <p className="text-indigo-200/70">
                    You've mastered several ayahs here. Complete this surah to achieve your next milestone.
                  </p>
                  <button 
                    onClick={() => loadSurah(recommendedSurah.number)}
                    className="px-8 py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-bold transition-all flex items-center gap-2"
                  >
                    Start Memorizing <ChevronRight size={18} />
                  </button>
                </div>
                <div className="w-48 h-48 rounded-full border-8 border-indigo-500/20 flex items-center justify-center relative">
                   <div className="absolute inset-0 border-8 border-indigo-500 border-t-transparent rounded-full animate-spin-slow"></div>
                   <span className="text-4xl font-heading font-black text-indigo-400">
                     {recommendedSurah?.number}
                   </span>
                </div>
              </div>
            )}

            {/* Grid */}
            {!khusyukMode ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredSurahs.map((s) => {
                  const masteredCount = Object.keys(masteredAyahs).filter(k => k.startsWith(`${s.number}_`)).length;
                  const progress = (masteredCount / s.numberOfAyahs) * 100;
                  
                  return (
                    <button 
                      key={s.number}
                      onClick={() => loadSurah(s.number)}
                      className={`group relative p-6 border rounded-3xl transition-all duration-300 text-left overflow-hidden ${cardClasses}`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-heading font-bold ${khusyukMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-[#f5f2e9] text-[#c29b40]'}`}>
                          {s.number}
                        </div>
                        <span className="font-arabic text-2xl opacity-80 group-hover:opacity-100 transition-opacity">{s.name}</span>
                      </div>
                      <h4 className="font-heading font-bold text-lg mb-1">{s.englishName}</h4>
                      <p className="text-xs opacity-50 uppercase tracking-widest mb-6">{s.revelationType} • {s.numberOfAyahs} Ayahs</p>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold uppercase opacity-60">
                          <span>Progress</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${khusyukMode ? 'bg-indigo-900' : 'bg-[#f5f2e9]'}`}>
                          <div 
                            className={`h-full transition-all duration-1000 ${khusyukMode ? 'bg-indigo-400' : 'bg-[#c29b40]'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-4">
                <p className="text-center text-xs font-bold uppercase tracking-[0.4em] opacity-40 mb-8">Select One to Begin Lock-In</p>
                {filteredSurahs.slice(0, 10).map((s) => (
                   <button 
                    key={s.number}
                    onClick={() => loadSurah(s.number)}
                    className="w-full flex items-center justify-between p-5 rounded-2xl border border-indigo-500/20 bg-indigo-900/10 hover:bg-indigo-900/30 transition-all text-left"
                   >
                     <div className="flex items-center gap-4">
                        <span className="font-heading font-bold text-indigo-400">{s.number}</span>
                        <div>
                          <h4 className="font-heading font-bold">{s.englishName}</h4>
                          <p className="text-[10px] opacity-40 uppercase">{s.numberOfAyahs} Ayahs</p>
                        </div>
                     </div>
                     <span className="font-arabic text-xl text-indigo-300">{s.name}</span>
                   </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "recitation" && currentSurah && (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in zoom-in-95 duration-700">
            {/* Recitation Header */}
            <div className="text-center space-y-6">
              <div className="inline-block px-4 py-1 rounded-full border border-current opacity-20 text-[10px] font-bold uppercase tracking-[0.3em]">
                Now Practicing
              </div>
              <h2 className="text-6xl font-heading font-black tracking-tighter">
                {currentSurah.englishName}
              </h2>
              <div className="flex items-center justify-center gap-6 text-sm opacity-60 uppercase tracking-widest">
                <span>{currentSurah.revelationType}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>{currentSurah.numberOfAyahs} Ayahs</span>
              </div>
              
              {/* Phase Selector */}
              <div className={`inline-flex p-1 rounded-2xl border ${khusyukMode ? 'bg-indigo-950/50 border-indigo-500/20' : 'bg-[#f5f2e9] border-[#e8e4d9]'}`}>
                <button 
                  onClick={() => setHifzPhase('tikrah')}
                  className={`px-8 py-2 rounded-xl text-xs font-bold uppercase transition-all ${hifzPhase === 'tikrah' ? accentBtn : 'opacity-40 hover:opacity-100'}`}
                >
                  Phase 1: Tikrah
                </button>
                <button 
                  onClick={() => setHifzPhase('hifz')}
                  className={`px-8 py-2 rounded-xl text-xs font-bold uppercase transition-all ${hifzPhase === 'hifz' ? accentBtn : 'opacity-40 hover:opacity-100'}`}
                >
                  Phase 2: Hifz
                </button>
              </div>
            </div>

            {/* TikrahPro Controls */}
            {hifzPhase === 'tikrah' && (
              <div className={`p-8 rounded-[2rem] border-2 shadow-xl space-y-6 ${khusyukMode ? 'bg-indigo-900/10 border-indigo-500/20' : 'bg-white border-[#c29b40]/20'}`}>
                <div className="flex items-center gap-2 font-heading font-bold text-lg">
                  <RotateCcw size={20} className={khusyukMode ? 'text-indigo-400' : 'text-[#c29b40]'} />
                  TikrahPro <span className="text-[10px] uppercase opacity-40 ml-2">Advanced Iteration</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase opacity-50">Ayah Range</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min="1" 
                        max={currentSurah.numberOfAyahs}
                        value={tikrahSettings.startAyah}
                        onChange={(e) => setTikrahSettings({...tikrahSettings, startAyah: parseInt(e.target.value) || 1})}
                        className={`w-full p-3 rounded-xl border text-center font-bold outline-none transition-all ${khusyukMode ? 'bg-slate-900 border-indigo-500/30' : 'bg-[#fdfcf8] border-[#e8e4d9]'}`}
                      />
                      <span className="opacity-40">to</span>
                      <input 
                        type="number" 
                        min="1" 
                        max={currentSurah.numberOfAyahs}
                        value={tikrahSettings.endAyah}
                        onChange={(e) => setTikrahSettings({...tikrahSettings, endAyah: parseInt(e.target.value) || 1})}
                        className={`w-full p-3 rounded-xl border text-center font-bold outline-none transition-all ${khusyukMode ? 'bg-slate-900 border-indigo-500/30' : 'bg-[#fdfcf8] border-[#e8e4d9]'}`}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase opacity-50">Reiterations</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min="1" 
                        max="150"
                        disabled={tikrahSettings.infinite}
                        value={tikrahSettings.reiterations}
                        onChange={(e) => setTikrahSettings({...tikrahSettings, reiterations: Math.min(150, parseInt(e.target.value) || 1)})}
                        className={`w-full p-3 rounded-xl border text-center font-bold outline-none transition-all ${tikrahSettings.infinite ? 'opacity-20' : ''} ${khusyukMode ? 'bg-slate-900 border-indigo-500/30' : 'bg-[#fdfcf8] border-[#e8e4d9]'}`}
                      />
                      <button 
                        onClick={() => setTikrahSettings({...tikrahSettings, infinite: !tikrahSettings.infinite})}
                        className={`p-3 px-4 rounded-xl border font-bold text-xs transition-all ${tikrahSettings.infinite ? accentBtn : 'opacity-40'}`}
                      >
                        ∞
                      </button>
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button 
                      onClick={() => playAyah(tikrahSettings.startAyah - 1)}
                      className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 ${accentBtn}`}
                    >
                      {audioState.playing ? <Pause size={20} /> : <Play size={20} />}
                      {audioState.playing ? 'Pause Loop' : 'Start Iteration'}
                    </button>
                  </div>
                </div>

                {audioState.playing && (
                  <div className="flex items-center justify-center gap-4 py-2">
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className={`w-1 h-4 rounded-full animate-bounce ${khusyukMode ? 'bg-indigo-400' : 'bg-[#c29b40]'}`} style={{ animationDelay: `${i * 0.1}s` }} />
                      ))}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest opacity-60">
                      Round {tikrahSettings.currentCount + 1} {tikrahSettings.infinite ? '' : `/ ${tikrahSettings.reiterations}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Ayahs Display */}
            <div className="space-y-12">
              {ayahs.map((ayah, index) => {
                const isMastered = masteredAyahs[`${currentSurah.number}_${ayah.numberInSurah}`];
                const isActive = audioState.currentAyah === index;
                const isBlurred = hifzPhase === 'hifz' && !isActive;
                const canProceed = index === 0 || masteredAyahs[`${currentSurah.number}_${ayahs[index-1].numberInSurah}`];

                // In Hifz mode, we only show up to the current needed ayah
                if (hifzPhase === 'hifz' && !canProceed) return null;

                return (
                  <div 
                    key={ayah.number}
                    className={`relative group transition-all duration-500 p-8 rounded-3xl border-2 ${
                      isActive 
                        ? (khusyukMode ? 'bg-indigo-900/20 border-indigo-400 scale-[1.02]' : 'bg-[#c29b40]/5 border-[#c29b40] scale-[1.02]') 
                        : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-8">
                      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-heading font-bold text-sm ${isActive ? (khusyukMode ? 'border-indigo-400 text-indigo-400' : 'border-[#c29b40] text-[#c29b40]') : 'opacity-20'}`}>
                        {ayah.numberInSurah}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => saveMastery(currentSurah.number, ayah.numberInSurah, !isMastered)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${isMastered ? 'bg-green-500 text-white shadow-lg' : 'opacity-20 hover:opacity-100 bg-current/10'}`}
                        >
                          <CheckCircle2 size={14} /> {isMastered ? 'Mastered' : 'Mark Mastered'}
                        </button>
                        <button 
                          onClick={() => playAyah(index)}
                          className={`p-3 rounded-full transition-all ${isActive ? (khusyukMode ? 'bg-indigo-500' : 'bg-[#c29b40]') + ' text-white' : 'opacity-20 hover:opacity-100 hover:bg-current/10'}`}
                        >
                          <Volume2 size={20} />
                        </button>
                      </div>
                    </div>

                    <p 
                      dir="rtl" 
                      className={`font-arabic text-right leading-[3.5] transition-all duration-1000 ${
                        isBlurred ? 'blur-md select-none opacity-20' : ''
                      } ${khusyukMode ? 'text-indigo-100' : 'text-[#1a1a1a]'} ${isActive ? 'text-4xl' : 'text-3xl'}`}
                    >
                      {ayah.text}
                    </p>

                    <div className={`mt-10 space-y-4 transition-opacity duration-700 ${isBlurred ? 'opacity-0' : 'opacity-100'}`}>
                      <p className={`text-lg font-medium italic opacity-70 ${khusyukMode ? 'text-indigo-200' : 'text-[#444]'}`}>
                        {ayah.translation}
                      </p>
                      
                      {showTafsir && (
                        <div className={`p-6 rounded-2xl text-sm leading-relaxed border-l-4 ${khusyukMode ? 'bg-slate-900 border-indigo-500' : 'bg-[#f5f2e9] border-[#c29b40]'}`}>
                           Tafsir loading... (Sahih International Interpretation)
                        </div>
                      )}

                      <button 
                        onClick={() => setShowTafsir(!showTafsir)}
                        className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 flex items-center gap-2"
                      >
                        <Info size={14} /> {showTafsir ? "Hide Interpretation" : "Show Interpretation"}
                      </button>
                    </div>

                    {isActive && hifzPhase === 'hifz' && (
                      <div className="mt-8 flex justify-center">
                        <button 
                          onClick={() => setHifzPhase('tikrah')}
                          className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/50 rounded-xl font-bold transition-all text-xs uppercase"
                        >
                          <X size={16} /> Stop Hifz
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Scroll to top button or similar placeholder */}
            <div className="h-24" />
          </div>
        )}
      </main>

      {/* Global Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
             <Loader2 className="animate-spin text-[#c29b40]" size={32} />
             <p className="font-heading font-bold uppercase tracking-widest text-[10px]">Retrieving Sacred Text</p>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cinzel:wght@400;700;900&display=swap');
        
        .font-arabic { 
          font-family: 'Scheherazade New', serif;
          word-spacing: 0.15em;
          letter-spacing: 0.05em;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
        }
        
        .font-body { 
          font-family: 'Playfair Display', serif; 
        }
        
        .font-heading { 
          font-family: 'Cinzel', serif; 
        }

        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default App;

import { createRoot } from 'react-dom/client';
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
