
import React, { useState, useEffect, useRef } from 'react';
import { WordEntry, ReviewMode } from '../types';
import { generateCardImage } from '../services/geminiService';
import { updateWord, calculateNextReview } from '../services/storageService';
import { Play, Pause, Check, X, RotateCw, Shuffle } from 'lucide-react';

interface ReviewSessionProps {
  words: WordEntry[];
  mode: ReviewMode;
  onComplete: (xpEarned: number) => void;
}

const ReviewSession: React.FC<ReviewSessionProps> = ({ words, mode, onComplete }) => {
  // Use local state for words to support shuffling
  const [sessionWords, setSessionWords] = useState<WordEntry[]>(words);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);

  const currentWord = sessionWords[currentIndex];
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false); 
  const mountedRef = useRef(true);

  useEffect(() => {
      // If original props change (unlikely during session, but good practice), sync
      setSessionWords(words);
  }, [words]);

  useEffect(() => {
      return () => { mountedRef.current = false; };
  }, []);

  // --- Helpers ---
  const loadImage = (url: string): Promise<void> => {
      return new Promise((resolve) => {
          const img = new Image();
          img.src = url;
          img.onload = () => resolve();
          img.onerror = () => resolve();
      });
  };

  const speak = (text: string, rate = 0.9): Promise<void> => {
    return new Promise((resolve) => {
      if (!mountedRef.current) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.lang = 'en-US';
      u.onend = () => resolve();
      u.onerror = () => resolve(); 
      window.speechSynthesis.speak(u);
    });
  };

  const wait = (ms: number) => new Promise(resolve => {
      timeoutRef.current = setTimeout(resolve, ms);
  });

  const shuffleQueue = () => {
    // Only shuffle from the current index + 1 onwards
    // or if at start, shuffle everything
    if (currentIndex >= sessionWords.length - 1) return; // Nothing to shuffle

    const done = sessionWords.slice(0, currentIndex + 1);
    const upcoming = sessionWords.slice(currentIndex + 1);
    
    // Fisher-Yates shuffle for upcoming
    for (let i = upcoming.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
    }
    
    setSessionWords([...done, ...upcoming]);
    
    // Feedback effect could go here
    setIsPlaying(false); // Pause if shuffling
  };

  // --- Main Sequence Logic ---
  const runPassiveSequence = async (word: WordEntry) => {
    if (!isPlayingRef.current) return;
    
    // 0. Reset UI state for new card
    setShowImage(false);
    setLoadingImage(true);
    setCurrentImage(null);

    // 1. Start fetching image in background
    let imgUrl = word.todayImage;
    const today = new Date().toISOString().split('T')[0];
    if (!imgUrl || word.todayImageDate !== today) {
        // Use visualDescription if available for better relevance
        generateCardImage(word.word, word.context, word.visualDescription).then(url => {
            updateWord(word.id, { todayImage: url, todayImageDate: today });
        });
        // Strategy: Wait for image before 2nd read.
        imgUrl = await generateCardImage(word.word, word.context, word.visualDescription);
    }

    // 2. Speak First time (Image Hidden, Word Visible)
    await speak(word.word);
    if (!mountedRef.current || !isPlayingRef.current) return;
    
    await wait(500);
    if (!mountedRef.current || !isPlayingRef.current) return;

    // 3. Show Image
    setLoadingImage(false);
    setCurrentImage(imgUrl);
    setShowImage(true);
    await loadImage(imgUrl); // Ensure visual load

    // 4. Speak Second time
    await speak(word.word);
    if (!mountedRef.current || !isPlayingRef.current) return;

    // 5. Wait for viewing
    await wait(2500);
    if (!mountedRef.current || !isPlayingRef.current) return;

    // 6. Auto Next
    handleNext();
  };

  const startSequence = () => {
      if (!currentWord) return;
      
      if (mode === 'passive') {
          runPassiveSequence(currentWord);
      } else {
          // Active mode logic
          const load = async () => {
            setLoadingImage(true);
            setShowImage(false); 
            let imgUrl = currentWord.todayImage;
            if (!imgUrl) {
                imgUrl = await generateCardImage(currentWord.word, currentWord.context, currentWord.visualDescription);
                updateWord(currentWord.id, { todayImage: imgUrl, todayImageDate: new Date().toISOString().split('T')[0] });
            }
            if (mountedRef.current) {
                setCurrentImage(imgUrl);
                setLoadingImage(false);
                speak(currentWord.word);
            }
          }
          load();
      }
  };

  useEffect(() => {
    if (isPlaying) {
        isPlayingRef.current = true;
        startSequence();
    } else {
        isPlayingRef.current = false;
        window.speechSynthesis.cancel();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        window.speechSynthesis.cancel();
    }
  }, [isPlaying, currentIndex]);


  const handleNext = () => {
    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      finishSession();
    }
  };

  const handleRate = (correct: boolean) => {
    const { level, date } = calculateNextReview(currentWord.reviewLevel, correct);
    updateWord(currentWord.id, { 
        reviewLevel: level, 
        nextReviewDate: date, 
        lastReviewedAt: Date.now() 
    });
    handleNext();
  };

  const finishSession = () => {
      setIsPlaying(false);
      onComplete(50);
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  if (!currentWord) return <div className="h-full flex items-center justify-center font-bold text-gray-400">All done!</div>;

  return (
    <div className="flex flex-col h-full p-6 relative">
      {/* Progress */}
      <div className="flex justify-between items-center mb-4">
          <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">
              {mode === 'passive' ? 'Daily Listen' : 'Active Recall'} • {currentIndex + 1}/{sessionWords.length}
          </span>
          
          <div className="flex gap-4">
             {/* Shuffle Button */}
             {currentIndex < sessionWords.length - 1 && (
                <button 
                    onClick={shuffleQueue}
                    className="text-gray-400 hover:text-brand-500 transition-colors"
                    title="Shuffle Remaining"
                >
                    <Shuffle size={16} />
                </button>
             )}
             <span onClick={() => onComplete(0)} className="text-xs font-bold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-red-400">Exit</span>
          </div>
      </div>
      
      <div className="w-full bg-gray-100 h-3 rounded-full mb-6 overflow-hidden">
        <div 
            className="bg-brand-400 h-full rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${((currentIndex) / sessionWords.length) * 100}%` }}
        />
      </div>

      {/* Flashcard Container */}
      <div className="flex-1 relative perspective-1000">
        <div className="w-full h-full bg-white rounded-[2rem] shadow-xl border border-gray-100 flex flex-col overflow-hidden relative">
            
            {/* Image Half - Only show if showImage is true or active mode */}
            <div className={`h-3/5 relative bg-gray-50 transition-opacity duration-700 ${showImage || mode === 'active' ? 'opacity-100' : 'opacity-0'}`}>
                {loadingImage ? (
                    <div className="absolute inset-0 flex items-center justify-center text-brand-300">
                        <RotateCw className="animate-spin" />
                    </div>
                ) : (
                    currentImage && <img src={currentImage} alt="Visual" className="w-full h-full object-contain p-4" />
                )}
            </div>

            {/* Text Half - Always Visible */}
            <div className="h-2/5 p-4 flex flex-col items-center justify-start text-center relative z-10 bg-white">
                <h2 className="text-4xl font-black text-gray-800 mb-2 drop-shadow-sm">{currentWord.word}</h2>
                
                {/* Definition / Context */}
                <div className={`transition-all duration-500 ${(showImage || mode === 'active') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                   {(showImage || mode === 'active') && (
                     <>
                        <p className="text-lg font-medium text-gray-600 leading-snug mb-1">{currentWord.definition}</p>
                        <p className="text-xs text-gray-400 italic">"{currentWord.context}"</p>
                     </>
                   )}
                </div>
            </div>
        </div>
      </div>

      {/* Controls Area */}
      <div className="h-24 flex items-center justify-center gap-8 mt-4">
         
         {mode === 'passive' && (
             <button 
                onClick={togglePlay}
                className={`w-20 h-20 rounded-full shadow-2xl border-4 border-white flex items-center justify-center transition-transform active:scale-95 ${isPlaying ? 'bg-brand-300 text-white' : 'bg-brand-500 text-white hover:bg-brand-600 hover:scale-105'}`}
             >
                {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
             </button>
         )}

         {/* Active Mode Controls */}
         {mode === 'active' && (
            <div className="w-full px-8 flex justify-between items-center">
                 <button 
                    onClick={() => handleRate(false)}
                    className="w-16 h-16 rounded-full bg-white shadow-lg text-red-400 hover:bg-red-50 hover:scale-110 transition-all flex items-center justify-center border border-red-100"
                 >
                     <X size={32} strokeWidth={3} />
                 </button>

                 <button onClick={() => speak(currentWord.word)} className="w-12 h-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                    <Play size={20} fill="currentColor" />
                 </button>

                 <button 
                    onClick={() => handleRate(true)}
                    className="w-16 h-16 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 hover:scale-110 transition-all flex items-center justify-center"
                 >
                     <Check size={32} strokeWidth={3} />
                 </button>
            </div>
         )}
      </div>
    </div>
  );
};

export default ReviewSession;
