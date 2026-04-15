import React, { useState, useEffect, useRef } from 'react';
import { AppMode, PetState, PetStage, DailyStats, WordEntry, ReviewMode } from './types';
import Login from './components/Login';
import Dictionary from './components/Dictionary';
import ReviewSession from './components/ReviewSession';
import PetNode from './components/PetNode';
import PetProfile from './components/PetProfile';
import Notebook from './components/Notebook';
import {
  getWords,
  getPetState,
  savePetState,
  getDailyStats,
  updateDailyStats
} from './services/supabaseDataService';
import { generatePetReaction, generatePostcard, generatePetSprite } from './services/apiService';
import { supabase, SUPABASE_CONFIG } from './services/supabaseClient';
import { Book, Search, Home, Trophy, Image as ImageIcon, User, Plane, Egg, LogOut, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [pet, setPet] = useState<PetState | null>(null);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [dailyNewWordsCount, setDailyNewWordsCount] = useState(0);
  const [reviewWords, setReviewWords] = useState<WordEntry[]>([]);
  const [reviewMode, setReviewMode] = useState<ReviewMode>('active');
  const [showPostcard, setShowPostcard] = useState<string | null>(null);
  const [showFarewell, setShowFarewell] = useState(false);

  // 图片生成状态跟踪
  const generatingRef = useRef<{[stage: number]: boolean}>({});
  const petImageRecoveryRef = useRef<{[stage: number]: boolean}>({});
  const petImageRecoveryAttemptsRef = useRef<{[stage: number]: number}>({});

  // 渲染日志 - 在主要逻辑之前
  useEffect(() => {
    console.log('[App] Component rendering, mode:', AppMode[mode] || mode, 'pet exists:', !!pet, 'stats exists:', !!stats);
  });

  // --- 认证状态检查 ---
  useEffect(() => {
    console.log('[App] Starting auth check...');
    if (!SUPABASE_CONFIG.isConfigured) {
      console.error('[App] Supabase env vars missing. Skip auth bootstrap.');
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }

    let isDisposed = false;

    const applySessionState = (session: any) => {
      if (isDisposed) return;

      const hasSession = !!session;
      setIsLoggedIn(hasSession);

      if (!hasSession) {
        console.log('[App] No session, user logged out');
        setPet(null);
        setStats(null);
        setDailyNewWordsCount(0);
        return;
      }

      // Keep auth callback synchronous to avoid Supabase auth deadlocks.
      setTimeout(() => {
        if (isDisposed) return;
        console.log('[App] Session detected, loading data');
        void loadData();
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[App] Auth state changed:', event, 'session:', !!session);
      applySessionState(session);
    });

    const bootstrapAuth = async () => {
      try {
        console.log('[App] Performing auth health check...');
        const healthStart = Date.now();
        const { data: { session } } = await supabase.auth.getSession();
        const healthElapsed = Date.now() - healthStart;
        console.log(`[App] Auth health check completed in ${healthElapsed}ms, session:`, !!session);
        applySessionState(session);
      } catch (healthError) {
        console.error('[App] Auth health check failed:', healthError);
        if (!isDisposed) {
          setIsLoggedIn(false);
          setPet(null);
          setStats(null);
        }
      } finally {
        if (!isDisposed) {
          setLoading(false);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      isDisposed = true;
      subscription?.unsubscribe();
    };
  }, []);

  // --- 加载数据 ---
  const loadData = async () => {
    console.log('[App] loadData called');
    const [loadedPet, loadedStats, loadedWords] = await Promise.all([getPetState(), getDailyStats(), getWords()]);
    console.log('[App] Pet loaded:', { name: loadedPet.name, stage: loadedPet.stage, xp: loadedPet.xp, imageUrls: loadedPet.imageUrls });
    console.log('[App] Stats loaded:', loadedStats);
    setPet(loadedPet);
    setStats(loadedStats);
    setDailyNewWordsCount(getTodayNewWords(loadedWords).length);
  };

  // --- Initialization ---
  useEffect(() => {
    if (!pet) return;

    if (pet.isTraveling && pet.travelReturnTime && Date.now() > pet.travelReturnTime) {
      handlePetReturn();
    }

    // Check if current pet stage has an image, if not, generate it
    // Skip if departed stage or already generating
    if (pet.stage === PetStage.DEPARTED) return;

    const currentStage = pet.stage;
    const currentImageUrl = pet.imageUrls?.[currentStage];

    // Check if we're already generating for this stage
    if (generatingRef.current[currentStage]) {
      console.log(`[Pet] Already generating sprite for stage ${currentStage}, skipping`);
      return;
    }

    // Helper function to check if URL is a placeholder (base64 SVG)
    const isPlaceholderUrl = (url: string | undefined): boolean => {
      if (!url) return false;
      return url.startsWith('data:image/svg+xml;base64,');
    };

    // Only generate if no image or it's a placeholder
    if (!currentImageUrl || isPlaceholderUrl(currentImageUrl)) {
      console.log(`[Pet] Generating sprite for stage ${currentStage}, current imageUrls:`, pet.imageUrls);

      // Mark as generating
      generatingRef.current[currentStage] = true;

      generatePetSprite(currentStage).then(url => {
        console.log(`[Pet] Generated sprite URL for stage ${currentStage}:`, url ? 'Success' : 'Failed', url?.substring(0, 50) + '...');

        // Clear generating flag
        generatingRef.current[currentStage] = false;

        if (url) {
          // Check if pet state hasn't changed since we started generating
          if (pet && pet.stage === currentStage) {
            const newUrls = { ...pet.imageUrls, [currentStage]: url };
            updatePet({ ...pet, imageUrls: newUrls });
            console.log(`[Pet] Updated image for stage ${currentStage}`);
          } else {
            console.warn(`[Pet] Pet stage changed from ${currentStage} to ${pet?.stage} while generating, skipping update`);
          }
        }
      }).catch(err => {
        console.error(`[Pet] Failed to generate sprite for stage ${currentStage}:`, err);
        // Clear generating flag on error too
        generatingRef.current[currentStage] = false;
      });
    } else {
      console.log(`[Pet] Stage ${currentStage} already has image, skipping generation`);
    }
  }, [pet?.stage, pet?.isTraveling, pet?.cycle]);

  // --- 登出处理 ---
  const handleLogout = async () => {
    console.log('[App] Logout button clicked');
    try {
      console.log('[App] Calling supabase.auth.signOut()');
      const result = await supabase.auth.signOut();
      console.log('[App] signOut() result:', result);

      if (result.error) {
        console.error('[App] SignOut error:', result.error);
        alert(`登出失败: ${result.error.message}`);
      } else {
        console.log('[App] SignOut successful, result:', result);
      }
    } catch (error) {
      console.error('[App] Unexpected error during signOut:', error);
      alert(`登出异常: ${error}`);
    }
    console.log('[App] Setting isLoggedIn to false, clearing state');
    setIsLoggedIn(false);
    setPet(null);
    setStats(null);
    setDailyNewWordsCount(0);
  };

  const getTodayNewWords = (allWords: WordEntry[]): WordEntry[] => {
    const todayLocal = new Date().toLocaleDateString('en-CA');
    return allWords.filter((word) => {
      const localDate = new Date(word.addedAt).toLocaleDateString('en-CA');
      const utcDate = new Date(word.addedAt).toISOString().split('T')[0];
      return localDate === todayLocal || utcDate === todayLocal;
    });
  };

  const refreshDailyNewWordCount = async () => {
    try {
      const allWords = await getWords();
      setDailyNewWordsCount(getTodayNewWords(allWords).length);
    } catch (error) {
      console.error('[App] Failed to refresh daily new word count:', error);
      setDailyNewWordsCount(0);
    }
  };

  // --- Logic: Prepare Reviews ---
  const startReview = async (type: 'new' | 'due') => {
    console.log(`[Review] Starting ${type} review`);
    try {
      console.log('[Review] Calling getWords with timeout...');
      const allWords = await Promise.race([
        getWords(),
        new Promise<WordEntry[]>((_, reject) => setTimeout(() => reject(new Error('getWords timeout after 5000ms')), 5000))
      ]);
      console.log(`[Review] Total words: ${allWords.length}`);
      setDailyNewWordsCount(getTodayNewWords(allWords).length);
    const today = new Date().toLocaleDateString('en-CA');
    console.log(`[Review] Today (local): ${today}`);
    console.log(`[Review] Today (UTC): ${new Date().toISOString().split('T')[0]}`);

    let selection: WordEntry[] = [];

    if (type === 'new') {
      console.log('[Review] Filtering for new words added today (local):', today);
      console.log('[Review] All words with their dates (local/UTC):', allWords.map(w => {
        const localDate = new Date(w.addedAt).toLocaleDateString('en-CA');
        const utcDate = new Date(w.addedAt).toISOString().split('T')[0];
        return {
          word: w.word,
          addedAt: w.addedAt,
          localDate: localDate,
          utcDate: utcDate,
          isTodayLocal: localDate === today,
          isTodayUTC: utcDate === today
        };
      }));
      selection = getTodayNewWords(allWords);
      setReviewMode('passive');
    } else {
      // Brain Gym: Due words (nextReviewDate <= today) regardless of reviewLevel
      selection = allWords.filter(w => w.nextReviewDate <= Date.now());
      if (selection.length === 0) {
        // Fallback for demo: Grab random words (including level 0)
        selection = allWords.sort(() => 0.5 - Math.random()).slice(0, 5);
      }
      setReviewMode('active');
    }

    if (selection.length === 0 && type === 'new') {
      console.warn(`[Review] No new words found for today. Total words: ${allWords.length}, Today: ${today}`);
      console.warn('[Review] All words dates (local/UTC):', allWords.map(w => ({
        word: w.word,
        localDate: new Date(w.addedAt).toLocaleDateString('en-CA'),
        utcDate: new Date(w.addedAt).toISOString().split('T')[0]
      })));
      alert("No new words added today to review. Go add some!");
      return;
    }

    if (selection.length === 0 && type === 'due') {
      console.warn(`[Review] No due words for Brain Gym. Total words: ${allWords.length}`);
      console.warn('[Review] All words review levels:', allWords.map(w => ({ word: w.word, reviewLevel: w.reviewLevel, nextReviewDate: new Date(w.nextReviewDate).toISOString() })));

      // More helpful message
      if (allWords.length === 0) {
        alert("No words in your notebook yet! Add words in Dictionary first.");
      } else {
        const dueCount = allWords.filter(w => w.nextReviewDate <= Date.now()).length;
        const totalCount = allWords.length;
        alert(`No words due for review yet! You have ${totalCount} words total, ${dueCount} due now. Try Daily Review first to start learning your words!`);
      }
      return;
    }

    console.log(`[Review] Selected ${selection.length} words for ${type} review`);
    console.log(`[Review] Words details:`, selection.map(w => ({
      word: w.word,
      addedAtLocal: new Date(w.addedAt).toLocaleDateString('en-CA'),
      addedAtUTC: new Date(w.addedAt).toISOString().split('T')[0],
      reviewLevel: w.reviewLevel,
      nextReviewDate: new Date(w.nextReviewDate).toISOString()
    })));

    console.log('[Review] Setting reviewWords and switching to REVIEW mode');
    setReviewWords(selection);
    console.log('[Review] reviewWords set, now setting mode to REVIEW');
    setMode(AppMode.REVIEW);
    console.log('[Review] Mode set to REVIEW, component should re-render');
    } catch (error) {
      console.error('[Review] Error in startReview:', error);
      alert(`Review failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // --- Logic: Pet Updates ---
  const updatePet = async (newPet: PetState) => {
    setPet(newPet);
    await savePetState(newPet);
  };

  const handlePetReturn = async () => {
    const postcardUrl = await generatePostcard(pet!.name);
    const newCollection = [...pet!.postcardCollection, postcardUrl];

    updatePet({
      ...pet!,
      isTraveling: false,
      mood: 'excited',
      dailyQuote: "I'm back! Look what I found!",
      postcardCollection: newCollection,
      xp: pet!.xp + 100
    });
    setShowPostcard(postcardUrl);
  };

  const startTravel = () => {
    if (!pet || pet.stage < PetStage.TEEN) return;

    updatePet({
      ...pet,
      isTraveling: true,
      dailyQuote: "Off to see the world!",
      travelReturnTime: Date.now() + 1000 * 60 // 1 minute demo travel
    });
    alert(`${pet.name} has gone on a trip! Check back later.`);
  };

  const handleFarewell = () => {
    setShowFarewell(true);
  };

  const confirmFarewell = () => {
    setShowFarewell(false);
    updatePet({
      name: 'Egg #' + (pet!.cycle + 1),
      stage: PetStage.EGG,
      xp: 0,
      cycle: pet!.cycle + 1,
      mood: 'sleepy',
      lastInteraction: Date.now(),
      dailyQuote: "Zzz...",
      dailyQuoteDate: "",
      isTraveling: false,
      postcardCollection: pet!.postcardCollection, // Keep collection
      imageUrls: {}
    });
  };

  const checkPetEvolution = async () => {
    if (!pet) return;

    let newStage = pet.stage;
    if (pet.stage === PetStage.EGG && pet.xp > 100) newStage = PetStage.BABY;
    else if (pet.stage === PetStage.BABY && pet.xp > 500) newStage = PetStage.TEEN;
    else if (pet.stage === PetStage.TEEN && pet.xp > 1500) newStage = PetStage.ADULT;

    if (newStage !== pet.stage) {
      const newImg = await generatePetSprite(newStage);
      const newUrls = { ...pet.imageUrls, [newStage]: newImg };
      const reaction = await generatePetReaction({ ...pet, stage: newStage }, stats!, 'evolving');
      updatePet({ ...pet, stage: newStage, dailyQuote: reaction.text, mood: reaction.mood as any, imageUrls: newUrls });
    }
  };

  const handleWordAdded = async () => {
    console.log('[App] handleWordAdded called, pet exists:', !!pet);
    if (!pet) {
      console.log('[App] No pet, skipping handleWordAdded');
      return;
    }
    const newXp = pet.xp + 10;
    console.log('[App] Adding XP to pet:', pet.xp, '->', newXp);
    updatePet({ ...pet, xp: newXp });
    await checkPetEvolution();
    const newStats = await getDailyStats();
    console.log('[App] Refreshing stats:', newStats);
    setStats(newStats);
    await refreshDailyNewWordCount();
  };

  const handleReviewComplete = async (xp: number) => {
    if (!pet) return;
    const newXp = pet.xp + xp;
    updatePet({ ...pet, xp: newXp });
    await updateDailyStats({ reviewSessionDone: true });
    setStats(await getDailyStats());
    await refreshDailyNewWordCount();
    await checkPetEvolution();
    setMode(AppMode.HOME);

    const reaction = await generatePetReaction(pet, stats!, 'completed_task');
    updatePet({ ...pet, dailyQuote: reaction.text, mood: reaction.mood as any });
  };

  const handlePetImageError = async (stage: number, imageUrl?: string) => {
    if (!pet || stage === PetStage.DEPARTED) return;
    if (imageUrl?.startsWith('data:image/svg+xml;base64,')) return;

    const recoveryAttempts = petImageRecoveryAttemptsRef.current[stage] || 0;
    if (recoveryAttempts >= 2) {
      console.warn(`[Pet] Stage ${stage} image failed more than 2 times, skipping auto-recovery`);
      return;
    }

    if (petImageRecoveryRef.current[stage]) {
      console.log(`[Pet] Stage ${stage} image recovery already in progress`);
      return;
    }

    petImageRecoveryRef.current[stage] = true;
    petImageRecoveryAttemptsRef.current[stage] = recoveryAttempts + 1;

    try {
      const refreshedUrl = await generatePetSprite(stage);
      if (!refreshedUrl) return;

      const currentStageImage = pet.imageUrls?.[stage];
      if (imageUrl && currentStageImage && currentStageImage !== imageUrl) return;

      await updatePet({
        ...pet,
        imageUrls: {
          ...pet.imageUrls,
          [stage]: refreshedUrl
        }
      });
    } catch (error) {
      console.error(`[Pet] Failed to recover image for stage ${stage}:`, error);
    } finally {
      petImageRecoveryRef.current[stage] = false;
    }
  };

  // --- 加载中状态 ---
  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-brand-50">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-100 rounded-full flex items-center justify-center animate-pulse">
            <Sparkles size={32} className="text-brand-500" />
          </div>
          <p className="text-brand-600 font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  // --- 登录页面 ---
  if (!SUPABASE_CONFIG.isConfigured) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-brand-50 px-6">
        <div className="max-w-lg w-full bg-white border border-brand-100 rounded-3xl shadow-sm p-6">
          <h2 className="text-xl font-extrabold text-brand-700 mb-3">Missing Supabase Config</h2>
          <p className="text-sm text-gray-700 mb-3">
            This deployment is missing required environment variables.
          </p>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>`VITE_SUPABASE_URL`</li>
            <li>`VITE_SUPABASE_ANON_KEY`</li>
          </ul>
          <p className="text-xs text-gray-500 mt-4">
            In Vercel, add these for both Preview and Production, then redeploy.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLoginSuccess={() => setIsLoggedIn(true)} />;
  }

  if (!pet || !stats) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-brand-50">
        <div className="text-center">
          <p className="text-brand-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  // --- 主应用 ---
  return (
    <div className="app-shell w-full flex flex-col bg-brand-50 text-gray-800 font-sans">

      {/* Top Bar (Hidden in Notebook mode for cleaner look) */}
      {mode !== AppMode.NOTEBOOK && (
        <header className="pt-4 pb-2 px-6 flex justify-between items-center z-20 relative">
          <div className="flex items-center gap-2">
            {pet.stage === PetStage.ADULT ? (
              <button onClick={handleFarewell} className="bg-brand-600 text-white text-xs px-3 py-1 rounded-full shadow-lg animate-pulse font-bold flex items-center gap-1">
                <Egg size={12} /> New Generation
              </button>
            ) : (
              <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-xl border border-brand-100">
                {pet.cycle > 1 ? '🦉' : '🐣'}
              </div>
            )}

            {pet.stage !== PetStage.ADULT && (
              <div>
                <h1 className="font-extrabold text-brand-800 leading-tight">LingoPet</h1>
                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wide">Cycle {pet.cycle} • v4.0</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button data-testid="logout-button" onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors p-2" title="登出">
              <LogOut size={18} />
            </button>
            <div className="flex items-center bg-white rounded-full shadow-sm border border-brand-100 px-3 py-1 gap-2">
              <Trophy size={14} className="text-brand-500 fill-current" />
              <span className="text-sm font-bold text-gray-700">{pet.xp} XP</span>
            </div>
          </div>
        </header>
      )}

      {/* Main Viewport */}
      <main className="flex-1 min-h-0 overflow-x-hidden relative flex flex-col">
        {mode === AppMode.HOME && (
          <div className="flex flex-col h-full min-h-0 p-6 overflow-y-auto app-main-scroll animate-pop z-10">

            {/* Pet Area - Now using the horizontal PetNode */}
            <div className="mb-6 relative z-10">
              <div className="absolute inset-0 bg-gradient-to-r from-brand-100 to-brand-50 rounded-3xl opacity-50"></div>
              <PetNode pet={pet} onClick={() => { }} onImageError={handlePetImageError} />
            </div>

            {/* Travel Button for Teens/Adults */}
            {(pet.stage >= PetStage.TEEN && !pet.isTraveling) && (
              <button onClick={startTravel} className="mb-6 w-full bg-white border border-brand-200 rounded-xl p-3 flex items-center justify-center gap-2 text-brand-600 font-bold shadow-sm hover:bg-brand-50">
                <Plane size={18} /> Send on Trip
              </button>
            )}

            {/* Action Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6 relative z-20">
              <button
                data-testid="start-daily-review"
                onClick={() => startReview('new')}
                className="bg-white p-4 rounded-3xl shadow-sm hover:shadow-md transition-all border border-brand-100 cursor-pointer group text-left"
              >
                <div className="bg-teal-100 w-10 h-10 rounded-2xl flex items-center justify-center mb-3 text-teal-600 group-hover:scale-110 transition-transform">
                  <Book size={20} />
                </div>
                <h3 className="font-bold text-gray-800">Daily Review</h3>
                <p className="text-xs text-gray-400 mt-1">Listen to {dailyNewWordsCount} new words</p>
              </button>

              <button
                onClick={() => startReview('due')}
                className="bg-white p-4 rounded-3xl shadow-sm hover:shadow-md transition-all border border-brand-100 cursor-pointer group text-left"
              >
                <div className="bg-coral-100 w-10 h-10 rounded-2xl flex items-center justify-center mb-3 text-coral-500 group-hover:scale-110 transition-transform">
                  <Trophy size={20} />
                </div>
                <h3 className="font-bold text-gray-800">Brain Gym</h3>
                <p className="text-xs text-gray-400 mt-1">Review words due from notebook</p>
              </button>
            </div>

            {/* Travel Memories Mini View */}
            {pet.postcardCollection.length > 0 && (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-brand-50 mt-auto">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2">
                    <ImageIcon size={18} className="text-brand-400" /> Recent Trip
                  </h3>
                </div>
                <img
                  src={pet.postcardCollection[pet.postcardCollection.length - 1]}
                  className="w-full h-32 object-cover rounded-xl shadow-sm"
                  alt="Memory"
                  onClick={() => setShowPostcard(pet.postcardCollection[pet.postcardCollection.length - 1])}
                />
              </div>
            )}
          </div>
        )}

        {mode === AppMode.PET_PROFILE && (
          <div className="h-full min-h-0 flex flex-col animate-pop">
            <PetProfile pet={pet} onOpenNotebook={() => setMode(AppMode.NOTEBOOK)} />
          </div>
        )}

        {mode === AppMode.NOTEBOOK && (
          <div className="h-full min-h-0 flex flex-col animate-pop">
            <Notebook onBack={() => setMode(AppMode.PET_PROFILE)} />
          </div>
        )}

        {mode === AppMode.DICTIONARY && (
          <div className="h-full min-h-0 flex flex-col animate-pop">
            <Dictionary onWordAdded={handleWordAdded} />
          </div>
        )}

        {mode === AppMode.REVIEW && (
          <div className="h-full min-h-0 flex flex-col animate-pop">
            <ReviewSession words={reviewWords} mode={reviewMode} onComplete={handleReviewComplete} />
          </div>
        )}
      </main>

      {/* Bottom Navigation Dock (Hidden in Notebook/Review for immersion) */}
      {mode !== AppMode.NOTEBOOK && mode !== AppMode.REVIEW && (
        <nav className="bg-white border-t border-gray-100 px-6 py-3 flex justify-around items-center pb-nav-safe shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-30">
          <button
            data-testid="nav-home"
            onClick={() => setMode(AppMode.HOME)}
            className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${mode === AppMode.HOME ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-brand-400'}`}
          >
            <Home size={24} strokeWidth={mode === AppMode.HOME ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Home</span>
          </button>

          {/* Floating Main Action Button */}
          <button
            data-testid="nav-dictionary"
            onClick={() => setMode(AppMode.DICTIONARY)}
            className="relative -top-6 bg-brand-500 text-white p-4 rounded-full shadow-lg hover:bg-brand-600 hover:scale-105 transition-all border-4 border-brand-50"
          >
            <Search size={28} strokeWidth={2.5} />
          </button>

          <button
            data-testid="nav-profile"
            onClick={() => setMode(AppMode.PET_PROFILE)}
            className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${mode === AppMode.PET_PROFILE ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-brand-400'}`}
          >
            <User size={24} strokeWidth={mode === AppMode.PET_PROFILE ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Profile</span>
          </button>
        </nav>
      )}

      {/* Postcard Modal */}
      {showPostcard && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-pop" onClick={() => setShowPostcard(null)}>
          <div className="bg-white p-3 rounded-3xl shadow-2xl transform rotate-1 max-w-md w-full">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-gray-100 mb-4 relative">
              <img src={showPostcard} alt="Postcard" className="w-full h-full object-cover" />
              <div className="absolute bottom-2 right-2 bg-white/80 px-2 py-1 rounded text-[10px] font-bold tracking-widest uppercase">LingoPet Travel</div>
            </div>
            <div className="text-center px-4 pb-4">
              <p className="font-handwriting text-2xl text-brand-700 mb-2">"Greetings!"</p>
              <p className="text-gray-500 text-sm">Your pet sent you a memory from their journey.</p>
            </div>
          </div>
        </div>
      )}

      {/* Farewell Modal */}
      {showFarewell && (
        <div className="absolute inset-0 z-50 bg-brand-800/90 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-pop text-center">
          <div className="w-32 h-32 rounded-full bg-white border-4 border-brand-300 mb-6 overflow-hidden">
            {pet.imageUrls[pet.stage] && <img src={pet.imageUrls[pet.stage]} className="w-full h-full object-cover" />}
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Goodbye, {pet.name}!</h2>
          <p className="text-brand-100 mb-8">"I have grown up and it is time for me to see the world. Thank you for raising me with your knowledge. A new friend is waiting for you!"</p>

          <button
            onClick={confirmFarewell}
            className="bg-white text-brand-600 font-extrabold px-8 py-4 rounded-full shadow-xl hover:scale-105 transition-transform"
          >
            Start New Generation
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
