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

  const audioRef = useRef(new Audio());

  // Handle Auth & Account Persistence
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (view === 'loading') setView(u ? 'menu' : 'auth');
    });
    return () => unsubscribe();
  }, []);

  // Fetch Progress from Firestore
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'data', 'progress');
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) setMemorizedAyahs(docSnap.data().ayahs || {});
    });
    return () => unsub();
  }, [user]);

  const toggleMastery = async (surahNum, ayahNum) => {
    const key = `${surahNum}:${ayahNum}`;
    const newMastery = { ...memorizedAyahs };
    if (newMastery[key]) delete newMastery[key];
    else newMastery[key] = true;
    
    setMemorizedAyahs(newMastery);
    if (user) {
      await setDoc(doc(db, 'users', user.uid, 'data', 'progress'), { ayahs: newMastery }, { merge: true });
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
      setView('menu');
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/surah`)
      .then(res => res.json())
      .then(data => { setSurahs(data.data); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedSurah) return;
    setLoading(true);
    fetch(`${API_BASE}/surah/${selectedSurah.number}/editions/quran-uthmani,en.sahih,${reciter}`)
      .then(res => res.json())
      .then(data => {
        setAyahs(data.data[0].ayahs.map((ayah, i) => ({
          number: ayah.numberInSurah,
          text: ayah.text,
          translation: data.data[1].ayahs[i].text,
          audio: data.data[2].ayahs[i].audio
        })));
        setActiveAyahIndex(0);
        setLoading(false);
      });
  }, [selectedSurah, reciter]);

  if (view === 'loading') return <div className="min-h-screen flex items-center justify-center bg-[#fdfaf3]"><Loader2 className="animate-spin text-[#1e3a31]" size={40} /></div>;

  if (view === 'auth') return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfaf3] p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl text-center space-y-6">
        <BookOpen size={48} className="mx-auto text-[#c29b40]" />
        <h1 className="text-3xl font-bold text-[#1e3a31]">TanzeelLite</h1>
        <button onClick={handleLogin} className="w-full py-4 bg-[#1e3a31] text-white rounded-xl font-bold flex items-center justify-center gap-2">
          <LogIn size={20} /> Sign in with Google
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fdfaf3] text-[#1e3a31] flex flex-col">
      <header className="p-4 md:p-6 bg-white border-b flex justify-between items-center shadow-sm">
        <button onClick={() => selectedSurah ? setSelectedSurah(null) : setView('menu')} className="p-2 bg-slate-50 rounded-full">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-xl md:text-2xl font-bold">TanzeelLite</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
        {!selectedSurah ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
              <input 
                className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border shadow-sm" 
                placeholder="Search surah..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {surahs.filter(s => s.englishName.toLowerCase().includes(searchQuery.toLowerCase())).map(s => (
                <button key={s.number} onClick={() => setSelectedSurah(s)} className="p-5 bg-white rounded-2xl border hover:border-[#c29b40] flex justify-between items-center transition-all">
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-400">SURAH {s.number}</p>
                    <h3 className="font-bold">{s.englishName}</h3>
                  </div>
                  <p className="text-2xl opacity-50">{s.name}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-white p-6 md:p-10 rounded-[2rem] shadow-sm border border-[#e8dfca]">
              <p className={`text-3xl md:text-4xl text-right leading-[2.5] mb-6 ${isTextHidden ? 'blur-lg' : ''}`} style={{ direction: 'rtl' }}>
                {ayahs[activeAyahIndex]?.text}
              </p>
              <p className="text-slate-500 italic text-lg">"{ayahs[activeAyahIndex]?.translation}"</p>
            </div>

            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-4">
                <button onClick={() => toggleMastery(selectedSurah.number, ayahs[activeAyahIndex].number)} className={`p-4 rounded-full ${memorizedAyahs[`${selectedSurah.number}:${ayahs[activeAyahIndex]?.number}`] ? 'bg-green-100 text-green-600' : 'bg-slate-100'}`}>
                  <CheckCircle2 size={24} />
                </button>
                <div className="flex items-center bg-[#1e3a31] rounded-full p-2 gap-2">
                  <button onClick={() => setActiveAyahIndex(p => Math.max(0, p - 1))} className="p-3 text-white"><ChevronLeft /></button>
                  <button onClick={() => setIsPlaying(!isPlaying)} className="w-16 h-16 bg-[#c29b40] rounded-full flex items-center justify-center text-white shadow-lg">
                    {isPlaying ? <Pause /> : <Play className="ml-1" />}
                  </button>
                  <button onClick={() => setActiveAyahIndex(p => Math.min(ayahs.length - 1, p + 1))} className="p-3 text-white"><ChevronRight /></button>
                </div>
                <button onClick={() => setIsTextHidden(!isTextHidden)} className="p-4 bg-slate-100 rounded-full">
                  {isTextHidden ? <Eye /> : <EyeOff />}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {user && view === 'menu' && (
        <footer className="p-4 text-center">
          <button onClick={() => signOut(auth)} className="text-slate-400 text-xs uppercase tracking-widest font-bold">Sign Out</button>
        </footer>
      )}
    </div>
  );
};

export default App;

// ROOT RENDER BLOCK
import { createRoot } from 'react-dom/client';
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
