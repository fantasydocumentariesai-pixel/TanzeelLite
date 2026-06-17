import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Search, BookOpen, 
  ChevronRight, ChevronLeft, EyeOff, 
  Eye, Volume2, CheckCircle2, List,
  PlayCircle, HelpCircle, X, Loader2, Sparkles, LogIn
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
  onSnapshot
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
 * Utility to strip Bismillah from the start of an Ayah except for Surah Fatiha and Tawbah
 */
const stripBismillah = (text, surahNumber) => {
  if (surahNumber === 1 || surahNumber === 9) return text;
  if (text.startsWith(BISMILLAH_ARABIC)) return text.replace(BISMILLAH_ARABIC, "").trim();
  const normalized = "بِسْم. اللَّهِ الرَّحْمَنِ الرَّحِيمِ";
  if (text.startsWith(normalized)) return text.replace(normalized, "").trim();
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

  // Authentication Setup
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

  // Firestore Sync
  useEffect(() => {
    if (!user) return;
    
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', 'memorization');
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
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', 'memorization');
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

  const filteredSurahs = useMemo(() => 
    surahs.filter(s => 
      s.englishName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.number.toString() === searchQuery ||
      s.englishNameTranslation.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [surahs, searchQuery]
  );

  const resumeSurah = useMemo(() => {
    if (surahs.length === 0) return null;
    
    const candidates = surahs.map(s => {
      const masteredCount = Object.keys(memorizedAyahs).filter(key => key.startsWith(`${s.number}:`)).length;
      const percentage = (masteredCount / s.numberOfAyahs) * 10
