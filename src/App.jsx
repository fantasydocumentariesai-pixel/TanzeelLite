import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Search, BookOpen, 
  ChevronRight, ChevronLeft, EyeOff, 
  Eye, Volume2, Info, CheckCircle2, List,
  Trophy, LogIn, PlayCircle, HelpCircle, X,
  Loader2, Sparkles
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot 
} from 'firebase/firestore';

// --- Configuration ---
const API_BASE = "https://api.alquran.cloud/v1";
const RECITERS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq El-Minshawi' },
  { id: 'ar.abdulsamad', name: 'Abdul Basit Abdus Samad' }
];

const BISMILLAH_ARABIC = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

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

const stripBismillah = (text, surahNumber) => {
  if (surahNumber === 1 || surahNumber === 9) return text;
  if (text.startsWith(BISMILLAH_ARABIC)) return text.replace(BISMILLAH_ARABIC, "").trim();
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

  const audioRef = useRef(new Audio());
  const abortControllerRef = useRef(null);

  // STABILITY FIX: Forced Persistence and Intelligent Auth
  useEffect(() => {
    // Tells the browser to never forget the user
    setPersistence(auth, browserLocalPersistence);

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // Only jump to a new screen if we are currently stuck on 'loading'
      setView(currentView => {
        if (currentView === 'loading') return u ? 'menu' : 'auth';
        return currentView;
      });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', 'memorization');
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) setMemorizedAyahs(docSnap.data().ayahs || {});
    });
  }, [user]);

  const updateMemorizedData = async (newData) => {
    setMemorizedAyahs(newData);
    if (user) {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', 'memorization');
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
        setAyahs(data.data[0].ayahs.map((ayah, i) => ({
          number: ayah.numberInSurah,
          text: i === 0 ? stripBismillah(ayah.text, selectedSurah.number) : ayah.text,
          translation: data.data[1].ayahs[i].text,
          audio: data.data[2].ayahs[i].audio
        })));
        setActiveAyahIndex(0);
        setLoading(false);
      })
      .catch(err => { if (err.name !== 'AbortError') setLoading(false); });
  }, [selectedSurah, reciter]);

  useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => {
      if (currentLoop < loopCount) {
        setCurrentLoop(prev => prev + 1);
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        setCurrentLoop(1);
        setIsPlaying(false);
      }
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [currentLoop, loopCount]);
  
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
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
    setIsPlaying(!isPlaying);
  };

  const filteredSurahs = useMemo(() => 
    surahs.filter(s => 
      s.englishName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.number.toString() === searchQuery
    ), [surahs, searchQuery]
  );

  const resumeSurah = useMemo(() => {
    if (surahs.length === 0) return null;
    const inProgress = surahs.map(s => {
      const mastered = Object.keys(memorizedAyahs).filter(k => k.startsWith(`${s.number}:`)).length;
      return { ...s, mastery: (mastered / s.numberOfAyahs) * 100, remaining: s.numberOfAyahs - mastered };
    }).filter(c => c.mastery > 0 && c.mastery < 100);
    return inProgress.sort((a, b) => b.mastery - a.mastery)[0];
  }, [surahs, memorizedAyahs]);

  const masteryPercentage = useMemo(() => {
    if (!selectedSurah || ayahs.length === 0) return 0;
    const count = ayahs.filter(a => memorizedAyahs[`${selectedSurah.number}:${a.number}`]).length;
    return Math.round((count / ayahs.length) * 100);
  }, [selectedSurah, ayahs, memorizedAyahs]);

  if (view === 'loading') return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3]">
      <Loader2 className="animate-spin text-[#1e3a31]" size={48} />
      <p className="text-[#1e3a31] font-heading mt-4 text-xs uppercase tracking-widest">Loading TanzeelLite...</p>
    </div>
  );

  if (view === 'auth') return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6">
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-10 text-center space-y-8 border-t-8 border-[#c29b40]">
        <BookOpen size={64} className="mx-auto text-[#c29b40]" />
        <h1 className="text-4xl font-heading text-[#1e3a31]">TanzeelLite</h1>
        <button 
          onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} 
          className="w-full py-4 bg-[#1e3a31] text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-[#2a4e42] transition-all"
        >
          <LogIn size={20} /> Continue with Google
        </button>
        <button onClick={() => setView('menu')} className="text-slate-400 text-sm hover:underline">Continue as Guest</button>
      </div>
    </div>
  );

  if (view === 'menu') return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6">
      <div className="w-full max-w-lg space-y-8 text-center">
        <h1 className="text-5xl font-heading text-[#1e3a31]">Assalamualaikum</h1>
        <button onClick={() => setView('browser')} className="w-full p-8 bg-[#1e3a31] rounded-[2rem] text-white flex items-center justify-between shadow-xl">
          <div className="text-left"><h3 className="text-2xl font-heading">Begin Journey</h3></div>
          <PlayCircle size={32} className="text-[#c29b40]" />
        </button>
        {user && <button onClick={() => signOut(auth)} className="text-[#c29b40] text-xs font-bold uppercase tracking-widest">Sign Out</button>}
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen bg-[#fdfaf3] text-[#1e3a31] font-sans flex flex-col items-center">
      <header className="w-full bg-white border-b border-[#e8dfca] p-6 flex justify-between items-center px-8 shadow-sm">
        <button onClick={() => { if(selectedSurah) setSelectedSurah(null); else setView('menu'); }} className="p-2 hover:bg-[#faf7f0] rounded-full text-[#c29b40]">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-heading">TanzeelLite</h1>
        <div className="w-10"></div>
      </header>

      {selectedSurah && (
        <div className="w-full max-w-5xl px-8 pt-6">
          <div className="w-full h-1 bg-[#e8dfca] rounded-full overflow-hidden">
            <div className="h-full bg-[#c29b40] transition-all" style={{ width: `${masteryPercentage}%` }} />
          </div>
        </div>
      )}

      <main className="w-full max-w-6xl flex-1 flex flex-col items-center p-6 text-center">
        {!selectedSurah ? (
          <div className="w-full py-8 space-y-6">
            <input 
              type="text" 
              placeholder="Search Surah..." 
              className="w-full max-w-md bg-white border border-[#e8dfca] rounded-2xl py-3 px-6 shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="grid grid-cols-1 gap-4 max-w-2xl mx-auto">
              {filteredSurahs.map(s => (
                <button key={s.number} onClick={() => setSelectedSurah(s)} className="p-6 bg-white border border-[#e8dfca] rounded-2xl flex justify-between items-center hover:border-[#c29b40] transition-all">
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-[#8b7d6b]">SURAH {s.number}</p>
                    <h3 className="text-xl font-heading">{s.englishName}</h3>
                  </div>
                  <p className="font-arabic text-3xl">{s.name}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full space-y-12 py-10">
            <div className="p-10 bg-[#fffcf5] rounded-[3rem] border border-[#e8dfca] shadow-inner max-w-4xl mx-auto">
              <p className="font-arabic text-3xl md:text-4xl leading-[2.5] text-[#1e3a31] mb-8" style={{ direction: 'rtl' }}>
                {ayahs[activeAyahIndex]?.text}
              </p>
              <p className="text-[#5c5346] text-xl font-body italic">"{ayahs[activeAyahIndex]?.translation}"</p>
            </div>

            <div className="flex flex-col items-center gap-8">
              <div className="flex items-center gap-6">
                <button onClick={() => setIsTextHidden(!isTextHidden)} className={`w-14 h-14 rounded-full flex items-center justify-center ${isTextHidden ? 'bg-[#c29b40] text-white' : 'bg-white border'}`}>
                  {isTextHidden ? <Eye size={24} /> : <EyeOff size={24} />}
                </button>
                <div className="flex items-center bg-[#1e3a31] rounded-full p-2 gap-4 border-4 border-[#c29b40]/20">
                  <button onClick={() => setActiveAyahIndex(p => Math.max(0, p - 1))} className="p-2 text-white/40 hover:text-white"><ChevronLeft size={32}/></button>
                  <button onClick={togglePlay} className="w-20 h-20 bg-[#c29b40] rounded-full flex items-center justify-center shadow-lg">
                    {isPlaying ? <Pause size={32} /> : <Play size={32} className="ml-1" />}
                  </button>
                  <button onClick={() => setActiveAyahIndex(p => Math.min(ayahs.length - 1, p + 1))} className="p-2 text-white/40 hover:text-white"><ChevronRight size={32}/></button>
                </div>
                <button onClick={() => { audioRef.current.currentTime = 0; audioRef.current.play(); }} className="w-14 h-14 rounded-full bg-white border flex items-center justify-center"><RotateCcw size={24} /></button>
              </div>

              <div className="flex gap-2 bg-[#1e3a31]/5 p-2 rounded-2xl">
                {[1, 3, 5, 10].map(count => (
                  <button key={count} onClick={() => setLoopCount(count)} className={`px-6 py-2 rounded-xl text-sm font-bold ${loopCount === count ? 'bg-[#1e3a31] text-white' : 'text-[#1e3a31]/40'}`}>{count}x</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Playfair+Display:ital,wght@0,400;1,400&family=Cinzel:wght@400;700&display=swap');
        .font-arabic { font-family: 'Scheherazade New', serif; }
        .font-body { font-family: 'Playfair Display', serif; }
        .font-heading { font-family: 'Cinzel', serif; }
      `}</style>
    </div>
  );
};

export default App;

// ROOT RENDER BLOCK (MANDATORY)
import { createRoot } from 'react-dom/client';
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
