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
import { motion, useMotionValue, useTransform } from 'motion/react';

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

// --- Carousel Internal Constants ---
const DRAG_BUFFER = 0;
const VELOCITY_THRESHOLD = 500;
const GAP = 16;
const SPRING_OPTIONS = { type: 'spring', stiffness: 300, damping: 30 };

function CarouselItem({ item, index, itemWidth, trackItemOffset, x, transition }) {
  const range = [-(index + 1) * trackItemOffset, -index * trackItemOffset, -(index - 1) * trackItemOffset];
  const outputRange = [90, 0, -90];
  const rotateY = useTransform(x, range, outputRange, { clamp: false });

  return (
    <motion.div
      key={`${item?.id ?? index}-${index}`}
      className="relative shrink-0 w-full cursor-grab active:cursor-grabbing"
      style={{
        width: itemWidth,
        rotateY: rotateY
      }}
      transition={transition}
    >
      <button 
        onClick={item.onClick} 
        className={item.className}
      >
        <div className="text-left">
          <h3 className={item.titleClassName}>{item.title}</h3>
          <p className={item.descClassName}>{item.description}</p>
        </div>
        {item.icon}
      </button>
    </motion.div>
  );
}

function MenuCarousel({ items, baseWidth = 500 }) {
  const containerPadding = 16;
  const itemWidth = baseWidth - containerPadding * 2;
  const trackItemOffset = itemWidth + GAP;
  const itemsForRender = items;

  const [position, setPosition] = useState(0);
  const x = useMotionValue(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setPosition(0);
    x.set(0);
  }, [items.length, trackItemOffset, x]);

  const effectiveTransition = SPRING_OPTIONS;

  const handleAnimationStart = () => {
    setIsAnimating(true);
  };

  const handleAnimationComplete = () => {
    setIsAnimating(false);
  };

  const handleDragEnd = (_, info) => {
    const { offset, velocity } = info;
    const direction =
      offset.x < -DRAG_BUFFER || velocity.x < -VELOCITY_THRESHOLD
        ? 1
        : offset.x > DRAG_BUFFER || velocity.x > VELOCITY_THRESHOLD
          ? -1
          : 0;

    if (direction === 0) return;

    setPosition(prev => {
      const next = prev + direction;
      const max = itemsForRender.length - 1;
      return Math.max(0, Math.min(next, max));
    });
  };

  const dragProps = {
    dragConstraints: {
      left: -trackItemOffset * Math.max(itemsForRender.length - 1, 0),
      right: 0
    }
  };

  const activeIndex = Math.min(position, items.length - 1);

  return (
    <div
      className="relative overflow-hidden p-4 rounded-[24px] w-full max-w-lg"
      style={{ width: `${baseWidth}px` }}
    >
      <motion.div
        className="flex"
        drag={isAnimating ? false : 'x'}
        {...dragProps}
        style={{
          width: itemWidth,
          gap: `${GAP}px`,
          perspective: 1000,
          perspectiveOrigin: `${position * trackItemOffset + itemWidth / 2}px 50%`,
          x
        }}
        onDragEnd={handleDragEnd}
        animate={{ x: -(position * trackItemOffset) }}
        transition={effectiveTransition}
        onAnimationStart={handleAnimationStart}
        onAnimationComplete={handleAnimationComplete}
      >
        {itemsForRender.map((item, index) => (
          <CarouselItem
            key={`${item?.id ?? index}-${index}`}
            item={item}
            index={index}
            itemWidth={itemWidth}
            trackItemOffset={trackItemOffset}
            x={x}
            transition={effectiveTransition}
          />
        ))}
      </motion.div>
      <div className="flex w-full justify-center">
        <div className="mt-6 flex w-[100px] justify-between px-4">
          {items.map((_, index) => (
            <motion.button
              type="button"
              key={index}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={activeIndex === index}
              className={`h-2 w-2 rounded-full cursor-pointer border-0 p-0 appearance-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                activeIndex === index ? 'bg-[#c29b40]' : 'bg-[#e8dfca]'
              }`}
              animate={{
                scale: activeIndex === index ? 1.3 : 1
              }}
              onClick={() => setPosition(index)}
              transition={{ duration: 0.15 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

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
        // We removed the logic that increments activeAyahIndex
        setCurrentLoop(1);
        setIsPlaying(false);
      }
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [currentLoop, loopCount]); // Removed activeAyahIndex and ayahs from dependencies
  
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

  // Logic to find the surah closest to being finished
  const resumeSurah = useMemo(() => {
    if (surahs.length === 0) return null;
    
    const candidates = surahs.map(s => {
      const masteredCount = Object.keys(memorizedAyahs).filter(key => key.startsWith(`${s.number}:`)).length;
      const percentage = (masteredCount / s.numberOfAyahs) * 100;
      return { ...s, mastery: percentage, remaining: s.numberOfAyahs - masteredCount };
    });

    // Filter for surahs that have progress but aren't 100% complete
    const inProgress = candidates.filter(c => c.mastery > 0 && c.mastery < 100);
    
    if (inProgress.length === 0) return null;

    // Sort by highest mastery first, then by least remaining ayahs
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

  const menuItems = useMemo(() => [
    {
      id: 1,
      title: 'Begin Journey',
      description: 'Browse through the Sacred Verses',
      onClick: () => setView('browser'),
      className: "w-full group p-8 tz-hero-gradient rounded-[2rem] text-white flex items-center justify-between tz-card-hover shadow-xl shadow-emerald-900/30 tz-animate-in tz-stagger-1 tz-btn-glow text-left",
      titleClassName: "text-2xl font-heading mb-1 group-hover:translate-x-1 transition-transform",
      descClassName: "text-emerald-100/60 text-sm font-light",
      icon: (
        <div className="p-4 bg-[#c29b40] rounded-full text-[#1e3a31] group-hover:scale-110 transition-transform shadow-lg">
          <PlayCircle size={32} />
        </div>
      )
    },
    {
      id: 2,
      title: 'Manual',
      description: 'Guidelines for memorization',
      onClick: () => setView('how-to'),
      className: "w-full group p-8 tz-glass border border-[#e8dfca] rounded-[2rem] text-[#1e3a31] flex items-center justify-between tz-card-hover tz-animate-in tz-stagger-2 text-left",
      titleClassName: "text-2xl font-heading mb-1 group-hover:translate-x-1 transition-transform",
      descClassName: "text-[#8b7d6b] text-sm font-light",
      icon: <HelpCircle size={32} className="text-[#c29b40]" />
    }
  ], []);

  if (view === 'loading') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] pattern-bg">
        <div className="relative tz-animate-float">
            <div className="absolute inset-0 rounded-full" style={{animation:'tz-pulse-ring 2s ease-out infinite'}}><div className="w-full h-full rounded-full border-2 border-[#c29b40]/30"></div></div>
            <div className="absolute inset-[-12px] rounded-full" style={{animation:'tz-pulse-ring 2s ease-out 0.5s infinite'}}><div className="w-full h-full rounded-full border border-[#c29b40]/15"></div></div>
            <Loader2 className="text-[#1e3a31]" size={64} strokeWidth={1} style={{animation:'tz-spin-slow 3s linear infinite'}} />
            <BookOpen className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#c29b40]" size={24} />
        </div>
        <p className="text-[#1e3a31] font-heading mt-6 tracking-[0.3em] uppercase text-xs tz-animate-in tz-stagger-2">TanzeelLite</p>
        <div className="h-px w-16 tz-shimmer-bar mt-3 rounded-full"></div>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6 pattern-bg relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-[#c29b40]/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-[#1e3a31]/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="w-full max-w-md tz-glass rounded-[2.5rem] border border-[#e8dfca] shadow-2xl p-10 text-center space-y-8 tz-animate-scale relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-1 bg-gradient-to-r from-transparent via-[#c29b40] to-transparent rounded-full"></div>
          <div className="w-24 h-24 tz-hero-gradient rounded-full flex items-center justify-center mx-auto tz-animate-glow tz-animate-in">
            <BookOpen size={44} className="text-[#c29b40]" />
          </div>
          <div className="space-y-3 tz-animate-in tz-stagger-1">
            <h1 className="text-4xl font-heading text-[#1e3a31]">TanzeelLite</h1>
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-[#c29b40] to-transparent mx-auto"></div>
            <p className="text-[#8b7d6b] font-light font-body italic">Your modern path to traditional mastery</p>
          </div>
          <div className="space-y-4 pt-4 tz-animate-in tz-stagger-3">
            <button 
              onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} 
              className="w-full py-4 tz-hero-gradient text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:brightness-110 transition-all shadow-lg shadow-emerald-900/20 tz-btn-glow"
            >
              <LogIn size={20} className="text-[#c29b40]" /> Continue with Google
            </button>
            <button 
              onClick={() => setView('menu')} 
              className="w-full py-4 bg-transparent border-2 border-[#e8dfca] text-[#8b7d6b] rounded-2xl font-bold hover:bg-[#faf7f0] hover:border-[#c29b40]/40 transition-all"
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
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdfaf3] p-6 pattern-bg relative overflow-hidden">
        <div className="absolute top-[10%] left-[5%] w-[300px] h-[300px] bg-[#c29b40]/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-[10%] right-[5%] w-[250px] h-[250px] bg-[#1e3a31]/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="w-full max-w-lg space-y-12 relative z-10 flex flex-col items-center">
          <div className="text-center space-y-4 tz-animate-in w-full">
            <div className="flex justify-center mb-4">
                <div className="h-1 w-16 bg-gradient-to-r from-transparent via-[#c29b40] to-transparent rounded-full"></div>
            </div>
            <h1 className="text-5xl font-heading text-[#1e3a31] tracking-tight">Assalamualaikum</h1>
            <p className="text-[#8b7d6b] italic font-light text-lg font-body">"If Allah permits it, you will one day memorise the Quran!"</p>
          </div>
          
          <MenuCarousel items={menuItems} baseWidth={500} />
          
          {user && (
            <button onClick={() => signOut(auth)} className="w-full py-2 text-[#c29b40] text-xs font-bold hover:underline tracking-[0.3em] uppercase tz-animate-in tz-stagger-4">
              Sign Out
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === 'how-to') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center bg-[#fdfaf3] p-6 pt-20 pattern-bg relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#c29b40]/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="w-full max-w-2xl tz-glass rounded-[3rem] p-10 shadow-2xl relative border border-[#e8dfca] tz-animate-scale">
          <button onClick={() => setView('menu')} className="absolute top-8 right-8 p-2.5 bg-[#fdfaf3] rounded-full text-[#1e3a31] hover:text-[#c29b40] hover:rotate-90 transition-all duration-300">
            <X size={20} />
          </button>
          <h2 className="text-3xl font-heading text-[#1e3a31] mb-8 border-b border-[#e8dfca] pb-4">Manual</h2>
          <div className="space-y-8 text-[#5c5346] leading-relaxed">
            <section className="flex gap-4 tz-animate-slide-up tz-stagger-1">
                <div className="h-9 w-9 rounded-full tz-hero-gradient text-[#c29b40] flex items-center justify-center shrink-0 font-bold text-sm shadow-md">1</div>
                <div>
                    <h4 className="font-bold text-[#1e3a31] mb-1">Repetition (Tikrar)</h4>
                    <p className="font-light">Use the 3x, 5x, or 10x loop modes. Listen until the rhythm of the verse feels natural to your tongue.</p>
                </div>
            </section>
            <section className="flex gap-4 tz-animate-slide-up tz-stagger-2">
                <div className="h-9 w-9 rounded-full tz-hero-gradient text-[#c29b40] flex items-center justify-center shrink-0 font-bold text-sm shadow-md">2</div>
                <div>
                    <h4 className="font-bold text-[#1e3a31] mb-1">Visualization</h4>
                    <p className="font-light">Hide the text and try to recite. If you stumble, reveal the text for a second, then hide it again.</p>
                </div>
            </section>
          </div>
          <button onClick={() => setView('browser')} className="w-full mt-10 py-4 tz-hero-gradient text-white rounded-2xl font-bold shadow-lg shadow-emerald-900/20 hover:brightness-110 transition-all tz-btn-glow">Understood</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#fdfaf3] text-[#1e3a31] font-sans flex flex-col items-center">
      <header className="w-full tz-glass border-b border-[#e8dfca] p-6 flex flex-col md:flex-row justify-between items-center px-8 shadow-sm gap-4 sticky top-0 z-30">
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
                className="w-full bg-[#fdfaf3]/80 border border-[#e8dfca] rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#c29b40]/30 focus:border-[#c29b40]/40 transition-all duration-300" 
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
            {/* CONTINUE JOURNEY SECTION */}
            {resumeSurah && !searchQuery && (
              <div className="w-full mb-12 text-left animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={16} className="text-[#c29b40]" />
                  <span className="text-[10px] font-black text-[#c29b40] uppercase tracking-[0.3em]">Continue Journey</span>
                </div>
                <button 
                  onClick={() => setSelectedSurah(resumeSurah)}
                  className="w-full tz-hero-gradient rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between group relative overflow-hidden shadow-2xl shadow-emerald-900/40 border border-[#c29b40]/30 tz-animate-glow"
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
                        className={`p-6 border-b-4 text-left flex justify-between items-center group relative overflow-hidden rounded-2xl tz-card-hover ${
                          isFullyMastered 
                          ? 'tz-hero-gradient border-[#c29b40] text-white shadow-lg shadow-emerald-900/20' 
                          : 'bg-white border-[#e8dfca] hover:border-[#c29b40] text-[#1e3a31] shadow-sm'
                        }`}
                      >
                        <div className="flex flex-col relative z-10">
                           <p className={`text-[10px] font-black mb-1 ${isFullyMastered ? 'text-[#c29b40]' : 'text-[#8b7d6b]'}`}>SURAH {s.number}</p>
                           <h3 className="text-xl font-heading font-bold group-hover:translate-x-1 transition-transform">{s.englishName}</h3>
                           <p className={`text-[10px] mt-2 font-bold uppercase ${isFullyMastered ? 'text-emerald-100/60' : 'opacity-60'}`}>
                             {s.numberOfAyahs} VERSES • {s.
