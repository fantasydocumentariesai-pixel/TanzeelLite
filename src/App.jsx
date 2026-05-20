import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Search, BookOpen, 
  ChevronRight, ChevronLeft, EyeOff, 
  Eye, Volume2, Info, CheckCircle2, List,
  Trophy, LogIn, PlayCircle, HelpCircle, X,
  Loader2, Sparkles, Volume1, VolumeX, FastForward,
  Check, Headphones, Hash
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot 
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

const toArabicNumerals = (num) => {
  return num.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
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
  const [verseSearch, setVerseSearch] = useState(""); 
  const [activeAyahIndex, setActiveAyahIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopCount, setLoopCount] = useState(1);
  const [currentLoop, setCurrentLoop] = useState(1);
  const [isTextHidden, setIsTextHidden] = useState(false);
  const [reciter, setReciter] = useState(RECITERS[0].id);
  const [tafsir, setTafsir] = useState(null);
  const [showTafsir, setShowTafsir] = useState(false);
  const [mode, setMode] = useState('manual'); 
  const [isBookView, setIsBookView] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const [isQuickMasterModalOpen, setIsQuickMasterModalOpen] = useState(false);
  const [selectedQuickMasterIds, setSelectedQuickMasterIds] = useState([]);

  const audioRef = useRef(new Audio());
  const abortControllerRef = useRef(null);

  // Unified Authentic Auth Monitoring System
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setView('menu');
      } else {
        setUser(null);
        setView('auth');
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
      console.error("Firestore progress sync error:", error);
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
      })
      .catch(() => setLoading(false));
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

  useEffect(() => {
    const audio = audioRef.current;
    
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);

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
              audio.play().catch(e => console.log("Audio continuous playback error:", e));
            }, 50);
            return prevLoop + 1;
          } else {
            setIsPlaying(false);
            return 1;
          }
        });
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
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
      if (isPlaying) {
        audio.play().catch(() => {});
      }
      
      if (isBookView && mode === 'listen') {
        const activeElement = document.getElementById(`book-verse-${activeAyahIndex}`);
        if (activeElement) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [activeAyahIndex, ayahs, isBookView, mode]);

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
                const provider =
