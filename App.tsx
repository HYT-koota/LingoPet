
import React, { useState, useEffect } from 'react';
import { AppMode, PetState, PetStage, DailyStats, WordEntry, ReviewMode } from './types';
import Dictionary from './components/Dictionary';
import ReviewSession from './components/ReviewSession';
import PetNode from './components/PetNode';
import PetProfile from './components/PetProfile';
import { 
  getWords, 
  getPetState, 
  savePetState, 
  getDailyStats, 
  updateDailyStats 
} from './services/storageService';
import { generatePetReaction, generatePostcard, generatePetSprite } from './services/geminiService';
import { Book, Search, Home, Trophy, Image as ImageIcon, User, Plane, Egg } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [pet, setPet] = useState<PetState>(getPetState());
  const [stats, setStats] = useState<DailyStats>(getDailyStats());
  const [reviewWords, setReviewWords] = useState<WordEntry[]>([]);
  const [reviewMode, setReviewMode] = useState<ReviewMode>('active');
  const [showPostcard, setShowPostcard] = useState<string | null>(null);
  const [showFarewell, setShowFarewell] = useState(false);

  // --- Initialization ---
  useEffect(() => {
    const currentStats = getDailyStats();
    setStats(currentStats);
    
    if (pet.isTraveling && pet.travelReturnTime && Date.now() > pet.travelReturnTime) {
      handlePetReturn();
    }

    // Check if current pet stage has an image, if not, generate it
    if (!pet.imageUrls?.[pet.stage] && pet.stage !== PetStage.DEPARTED) {
        generatePetSprite(pet.stage).then(url => {
            if (url) {
                const newUrls = { ...pet.imageUrls, [pet.stage]: url };
                updatePet({ ...pet, imageUrls: newUrls });
            }
        });
    }
  }, [pet.stage, pet.isTraveling, pet.cycle]);

  // --- Logic: Prepare Reviews ---
  const startReview = (type: 'new' | 'due') => {
    const allWords = getWords();
    const today = new Date().toISOString().split('T')[0];
    
    let selection: WordEntry[] = [];
    
    if (type === 'new') {
        selection = allWords.filter(w => {
            const d = new Date(w.addedAt).toISOString().split('T')[0];
            return d === today;
        });
        setReviewMode('passive'); 
    } else {
        // Brain Gym: Due words or random if none due
        selection = allWords.filter(w => w.nextReviewDate <= Date.now() && w.reviewLevel > 0);
        if (selection.length === 0) {
             // Fallback for demo: Grab random existing words
             selection = allWords.filter(w => w.reviewLevel > 0).sort(() => 0.5 - Math.random()).slice(0, 5);
        }
        setReviewMode('active');
    }

    if (selection.length === 0 && type === 'new') {
        alert("No new words added today to review. Go add some!");
        return;
    }
    
    if (selection.length === 0 && type === 'due') {
        alert("No words available for Brain Gym. Search words in Dictionary first!");
        return;
    }

    setReviewWords(selection);
    setMode(AppMode.REVIEW);
  };

  // --- Logic: Pet Updates ---
  const updatePet = (newPet: PetState) => {
    setPet(newPet);
    savePetState(newPet);
  };

  const handlePetReturn = async () => {
      const postcardUrl = await generatePostcard(pet.name);
      const newCollection = [...pet.postcardCollection, postcardUrl];
      
      updatePet({
          ...pet,
          isTraveling: false,
          mood: 'excited',
          dailyQuote: "I'm back! Look what I found!",
          postcardCollection: newCollection,
          xp: pet.xp + 100
      });
      setShowPostcard(postcardUrl);
  };

  const startTravel = () => {
      if (pet.stage < PetStage.TEEN) return;
      
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
          name: 'Egg #' + (pet.cycle + 1),
          stage: PetStage.EGG,
          xp: 0,
          cycle: pet.cycle + 1,
          mood: 'sleepy',
          lastInteraction: Date.now(),
          dailyQuote: "Zzz...",
          dailyQuoteDate: "",
          isTraveling: false,
          postcardCollection: pet.postcardCollection, // Keep collection
          imageUrls: {} 
      });
  };

  const checkPetEvolution = async () => {
      let newStage = pet.stage;
      if (pet.stage === PetStage.EGG && pet.xp > 100) newStage = PetStage.BABY;
      else if (pet.stage === PetStage.BABY && pet.xp > 500) newStage = PetStage.TEEN;
      else if (pet.stage === PetStage.TEEN && pet.xp > 1500) newStage = PetStage.ADULT;
      
      if (newStage !== pet.stage) {
          const newImg = await generatePetSprite(newStage);
          const newUrls = { ...pet.imageUrls, [newStage]: newImg };
          const reaction = await generatePetReaction({ ...pet, stage: newStage }, stats, 'evolving');
          updatePet({ ...pet, stage: newStage, dailyQuote: reaction.text, mood: reaction.mood as any, imageUrls: newUrls });
      }
  };

  const handleWordAdded = async () => {
      const newXp = pet.xp + 10;
      updatePet({ ...pet, xp: newXp });
      checkPetEvolution();
      setStats(getDailyStats());
  };

  const handleReviewComplete = async (xp: number) => {
      const newXp = pet.xp + xp;
      updatePet({ ...pet, xp: newXp });
      updateDailyStats({ reviewSessionDone: true });
      setStats(getDailyStats());
      checkPetEvolution();
      setMode(AppMode.HOME);

      const reaction = await generatePetReaction(pet, stats, 'completed_task');
      updatePet({ ...pet, dailyQuote: reaction.text, mood: reaction.mood as any });
  };

  // --- Render ---
  return (
    <div className="h-full w-full flex flex-col bg-brand-50 text-gray-800 font-sans">
        
        {/* Top Bar */}
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
                        <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wide">Cycle {pet.cycle} • v3.2</p>
                    </div>
                )}
             </div>
             <div className="flex items-center bg-white rounded-full shadow-sm border border-brand-100 px-3 py-1 gap-2">
                 <Trophy size={14} className="text-brand-500 fill-current" />
                 <span className="text-sm font-bold text-gray-700">{pet.xp} XP</span>
             </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 overflow-hidden relative flex flex-col">
            {mode === AppMode.HOME && (
                <div className="flex flex-col h-full p-6 overflow-y-auto animate-pop z-10">
                     
                     {/* Pet Area - Now using the horizontal PetNode */}
                     <div className="mb-6 relative z-10">
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-100 to-brand-50 rounded-3xl opacity-50"></div>
                        <PetNode pet={pet} onClick={() => {}} />
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
                            onClick={() => startReview('new')}
                            className="bg-white p-4 rounded-3xl shadow-sm hover:shadow-md transition-all border border-brand-100 cursor-pointer group text-left"
                        >
                            <div className="bg-teal-100 w-10 h-10 rounded-2xl flex items-center justify-center mb-3 text-teal-600 group-hover:scale-110 transition-transform">
                                <Book size={20} />
                            </div>
                            <h3 className="font-bold text-gray-800">Daily Review</h3>
                            <p className="text-xs text-gray-400 mt-1">Listen to {stats.wordsAdded} new words</p>
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
                                     <ImageIcon size={18} className="text-brand-400"/> Recent Trip
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
                <div className="h-full flex flex-col animate-pop">
                    <PetProfile pet={pet} />
                </div>
            )}

            {mode === AppMode.DICTIONARY && (
                <div className="h-full flex flex-col animate-pop">
                     <Dictionary onWordAdded={handleWordAdded} />
                </div>
            )}

            {mode === AppMode.REVIEW && (
                <div className="h-full flex flex-col animate-pop">
                     <ReviewSession words={reviewWords} mode={reviewMode} onComplete={handleReviewComplete} />
                </div>
            )}
        </main>

        {/* Bottom Navigation Dock */}
        <nav className="bg-white border-t border-gray-100 px-6 py-3 flex justify-around items-center pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-30">
            <button 
                onClick={() => setMode(AppMode.HOME)}
                className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${mode === AppMode.HOME ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-brand-400'}`}
            >
                <Home size={24} strokeWidth={mode === AppMode.HOME ? 2.5 : 2} />
                <span className="text-[10px] font-bold">Home</span>
            </button>

            {/* Floating Main Action Button */}
            <button 
                onClick={() => setMode(AppMode.DICTIONARY)}
                className="relative -top-6 bg-brand-500 text-white p-4 rounded-full shadow-lg hover:bg-brand-600 hover:scale-105 transition-all border-4 border-brand-50"
            >
                <Search size={28} strokeWidth={2.5} />
            </button>

            <button 
                onClick={() => setMode(AppMode.PET_PROFILE)}
                className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${mode === AppMode.PET_PROFILE ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-brand-400'}`}
            >
                <User size={24} strokeWidth={mode === AppMode.PET_PROFILE ? 2.5 : 2} />
                <span className="text-[10px] font-bold">Profile</span>
            </button>
        </nav>

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
