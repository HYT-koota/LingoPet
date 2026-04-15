
import React, { useState, useEffect, useRef } from 'react';
import { WordEntry, ReviewMode } from '../types';
import { generateCardImage } from '../services/apiService';
import { updateWord, calculateNextReview } from '../services/supabaseDataService';
import { Play, Pause, Check, X, RotateCw, Shuffle } from 'lucide-react';

interface ReviewSessionProps {
  words: WordEntry[];
  mode: ReviewMode;
  onComplete: (xpEarned: number) => void;
}

const ReviewSession: React.FC<ReviewSessionProps> = ({ words, mode, onComplete }) => {
  const [sessionWords, setSessionWords] = useState<WordEntry[]>(words);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState<boolean>(true);

  const currentWord = sessionWords[currentIndex];
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);
  const mountedRef = useRef(true);
  const cleanupRef = useRef<(() => void) | null>(null);
  const currentWordIdRef = useRef<string | null>(currentWord?.id || null);

  useEffect(() => {
      setSessionWords(words);
  }, [words]);

  useEffect(() => {
    currentWordIdRef.current = currentWord?.id || null;
  }, [currentWord?.id]);

  useEffect(() => {
      // 组件挂载时设置mountedRef
      mountedRef.current = true;

      // 组件卸载时的清理函数
      const unmountCleanup = () => {
          mountedRef.current = false;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          window.speechSynthesis.cancel();
      };

      cleanupRef.current = unmountCleanup;

      return () => {
          unmountCleanup();
          cleanupRef.current = null;
      };
  }, []);

  // 检查语音合成可用性
  useEffect(() => {
    if (!window.speechSynthesis) {
      setSpeechAvailable(false);
      console.warn('Speech synthesis API not available');
      return;
    }

    // 检查是否有语音可用
    const checkVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setSpeechAvailable(true);
      } else {
        setSpeechAvailable(false);
        console.warn('No speech synthesis voices available');
      }
    };

    // 初始检查
    checkVoices();

    // 监听voiceschanged事件
    window.speechSynthesis.onvoiceschanged = checkVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const loadImage = (url: string): Promise<boolean> => {
      return new Promise((resolve) => {
          console.log(`[loadImage] Loading image: ${url.substring(0, 80)}${url.length > 80 ? '...' : ''}`);
          const img = new Image();
          img.src = url;
          img.onload = () => {
            console.log('[loadImage] Image loaded successfully');
            resolve(true);
          };
          img.onerror = (err) => {
            console.error('[loadImage] Image failed to load:', err, 'URL:', url.substring(0, 100));
            console.error('[loadImage] Full URL:', url);
            resolve(false);
          };
      });
  };

  const getPlaceholderImage = (text: string): string => {
    const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#F9FAFB"/><rect x="156" y="156" width="200" height="200" rx="40" fill="#FBBF24" opacity="0.2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#FBBF24">${text}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  const isPlaceholderImage = (url: string | null | undefined): boolean => {
    return !!url && url.startsWith('data:image/svg+xml;base64,');
  };

  const speak = (text: string, rate = 0.9): Promise<void> => {
    return new Promise((resolve) => {
      if (!mountedRef.current || !window.speechSynthesis) {
        return resolve();
      }

      const voices = window.speechSynthesis.getVoices();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.lang = 'en-US';

      const englishVoice = voices.find(v => v.lang.startsWith('en-'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      const speechTimeoutMs = 3000;
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      try {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('[speak] Exception:', error);
        finish();
        return;
      }

      // Some browsers/headless environments may never fire onend/onerror.
      timeoutId = setTimeout(() => {
        console.warn(`[speak] Fallback timeout (${speechTimeoutMs}ms), continuing sequence`);
        finish();
      }, speechTimeoutMs);
    });
  };

  const wait = (ms: number) => new Promise(resolve => {
      timeoutRef.current = setTimeout(resolve, ms);
  });

  const shuffleQueue = () => {
    if (currentIndex >= sessionWords.length - 1) return;
    const done = sessionWords.slice(0, currentIndex + 1);
    const upcoming = sessionWords.slice(currentIndex + 1);
    for (let i = upcoming.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
    }
    setSessionWords([...done, ...upcoming]);
    setIsPlaying(false);
  };

  const runPassiveSequence = async (word: WordEntry) => {
    console.log(`[runPassiveSequence] Starting for word: ${word.word}`);
    if (!mountedRef.current) {
      console.log('[runPassiveSequence] Component not mounted, returning');
      return;
    }
    if (!isPlayingRef.current) {
      console.log('[runPassiveSequence] Not playing, returning');
      return;
    }

    setShowImage(false);
    setLoadingImage(true);
    setCurrentImage(null);

    let cachedImage = word.todayImage;
    let imageTask: Promise<string> | null = null;
    const needsFreshImage = !cachedImage || isPlaceholderImage(cachedImage);

    if (needsFreshImage) {
      console.log(`[runPassiveSequence] Start async image generation for word: ${word.word}`);
      imageTask = generateCardImage(word.word, word.context, word.visualDescription)
        .then((url) => {
          if (!isPlaceholderImage(url)) {
            updateWord(word.id, { todayImage: url }).catch((error) => {
              console.warn('[runPassiveSequence] Failed to persist generated image:', error);
            });
          }
          return url;
        })
        .catch((error) => {
          console.error('[runPassiveSequence] Error generating image:', error);
          return getPlaceholderImage(word.word);
        });

      imageTask.then((generatedUrl) => {
        if (!mountedRef.current || !isPlayingRef.current) return;
        if (currentWordIdRef.current !== word.id) return;
        if (isPlaceholderImage(generatedUrl)) return;
        setCurrentImage(generatedUrl);
        setLoadingImage(false);
        setShowImage(true);
      });
    } else {
      console.log(`[runPassiveSequence] Using existing image: ${cachedImage?.substring(0, 100)}${cachedImage && cachedImage.length > 100 ? '...' : ''}`);
    }

    console.log(`[runPassiveSequence] Speaking word: ${word.word}`);
    await speak(word.word);
    if (!mountedRef.current || !isPlayingRef.current) return;
    await wait(500);
    if (!mountedRef.current || !isPlayingRef.current) return;

    let displayImage = cachedImage || null;
    if (!displayImage && imageTask) {
      const imageReadyTimeout = 1200;
      displayImage = await Promise.race([
        imageTask,
        wait(imageReadyTimeout).then(() => null),
      ]);
      if (!displayImage) {
        console.log(`[runPassiveSequence] Image not ready in ${imageReadyTimeout}ms, using placeholder`);
        displayImage = getPlaceholderImage(word.word);
      }
    }

    setLoadingImage(false);
    setCurrentImage(displayImage);
    setShowImage(true);

    if (displayImage && !isPlaceholderImage(displayImage)) {
      const loadedSuccessfully = await loadImage(displayImage);
      if (!loadedSuccessfully && mountedRef.current) {
        console.log('[runPassiveSequence] Image failed to load, using placeholder');
        setCurrentImage(getPlaceholderImage(word.word));
      }
    }

    console.log(`[runPassiveSequence] Speaking word again: ${word.word}`);
    await speak(word.word);
    if (!mountedRef.current || !isPlayingRef.current) return;
    await wait(2500);
    if (!mountedRef.current || !isPlayingRef.current) return;

    console.log(`[runPassiveSequence] Updating review count for word: ${word.word}`);
    updateWord(word.id, { reviewCount: (word.reviewCount || 0) + 1 });
    handleNext();
  };

  const startSequence = () => {
      console.log(`[startSequence] Starting, mode: ${mode}, currentWord: ${currentWord?.word || 'none'}`);
      if (!currentWord) {
        console.log('[startSequence] No current word, returning');
        return;
      }
      if (mode === 'passive') {
          console.log('[startSequence] Running passive sequence');
          runPassiveSequence(currentWord);
      } else {
          console.log('[startSequence] Running active mode load');
          const load = async () => {
            console.log(`[startSequence] Loading image for word: ${currentWord.word}`);
            setLoadingImage(true);
            setShowImage(false);
            let imgUrl = currentWord.todayImage;
            if (!imgUrl || isPlaceholderImage(imgUrl)) {
                console.log(`[startSequence] Missing/placeholder image, generating new one`);
                try {
                  imgUrl = await generateCardImage(currentWord.word, currentWord.context, currentWord.visualDescription);
                  console.log(`[startSequence] Image generated: ${imgUrl ? imgUrl.substring(0, 100) + (imgUrl.length > 100 ? '...' : '') : 'NULL'}`);
                  console.log(`[startSequence] Image is placeholder? ${imgUrl && isPlaceholderImage(imgUrl) ? 'YES' : 'NO'}`);
                  if (!isPlaceholderImage(imgUrl)) {
                    updateWord(currentWord.id, { todayImage: imgUrl }).catch((error) => {
                      console.warn('[startSequence] Failed to persist generated image:', error);
                    });
                  }
                } catch (error) {
                  console.error('[startSequence] Error generating image:', error);
                }
            } else {
                console.log(`[startSequence] Using existing image: ${imgUrl.substring(0, 100)}${imgUrl.length > 100 ? '...' : ''}`);
            }
            // 在异步操作开始前捕获mounted状态
            const isMounted = mountedRef.current;
            if (isMounted) {
                console.log(`[startSequence] Setting image and speaking: ${currentWord.word}`);
                setCurrentImage(imgUrl || null);
                setLoadingImage(false);
                speak(currentWord.word);
            } else {
                console.log('[startSequence] Component not mounted, skipping');
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
        // 这个清理函数只清理资源，不修改mountedRef
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        window.speechSynthesis.cancel();
    }
  }, [isPlaying, currentIndex]);

  const handleNext = () => {
    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onComplete(50);
    }
  };

  const handleRate = (correct: boolean) => {
    const { level, date } = calculateNextReview(currentWord.reviewLevel, correct);
    updateWord(currentWord.id, { 
        reviewLevel: level, 
        nextReviewDate: date, 
        lastReviewedAt: Date.now(),
        reviewCount: (currentWord.reviewCount || 0) + 1 // Active count
    });
    handleNext();
  };

  if (!currentWord) return null;

  return (
    <div className="flex flex-col h-full p-6 relative">
      <div className="flex justify-between items-center mb-4">
          <span data-testid="review-progress" className="text-xs font-bold text-brand-400 uppercase tracking-wider">
              {mode === 'passive' ? 'Daily Listen' : 'Active Recall'} • {currentIndex + 1}/{sessionWords.length}
          </span>
          <div className="flex gap-4">
             {currentIndex < sessionWords.length - 1 && (
                <button onClick={shuffleQueue} className="text-gray-400 hover:text-brand-500 transition-colors">
                    <Shuffle size={16} />
                </button>
             )}
             <span onClick={() => onComplete(0)} className="text-xs font-bold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-red-400">Exit</span>
          </div>
      </div>
      
      <div className="w-full bg-gray-100 h-3 rounded-full mb-6 overflow-hidden">
        <div className="bg-brand-400 h-full transition-all duration-500" style={{ width: `${((currentIndex) / sessionWords.length) * 100}%` }} />
      </div>

      <div className="flex-1 relative">
        <div className="w-full h-full bg-white rounded-[2rem] shadow-xl border border-gray-100 flex flex-col overflow-hidden">
            <div className={`h-3/5 relative bg-gray-50 transition-opacity duration-700 ${showImage || mode === 'active' ? 'opacity-100' : 'opacity-0'}`}>
                {loadingImage ? (
                    <div className="absolute inset-0 flex items-center justify-center text-brand-300">
                        <RotateCw className="animate-spin" />
                    </div>
                ) : (
                    currentImage && <img
                      src={currentImage}
                      alt="Visual"
                      className="w-full h-full object-contain p-4"
                      onError={(e) => {
                        console.error('[Image] Failed to load:', currentImage.substring(0, 100));
                        console.error('[Image] Error event:', e);
                        // 可以在这里设置占位符图片，但需要访问setCurrentImage
                        // 暂时只记录错误
                      }}
                    />
                )}
            </div>

            <div className="h-2/5 p-4 flex flex-col items-center justify-start text-center bg-white">
                <h2 className="text-4xl font-black text-gray-800 mb-2">{currentWord.word}</h2>
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

      <div className="h-24 flex items-center justify-center gap-8 mt-4">
         {mode === 'passive' && (
             <button
                data-testid="passive-play-toggle"
                onClick={() => setIsPlaying(!isPlaying)}
                className={`w-20 h-20 rounded-full shadow-2xl border-4 border-white flex items-center justify-center ${isPlaying ? 'bg-brand-300 text-white' : 'bg-brand-500 text-white'}`}
             >
                {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
             </button>
         )}
         {mode === 'active' && (
            <div className="w-full px-8 flex justify-between items-center">
                 <button onClick={() => handleRate(false)} className="w-16 h-16 rounded-full bg-white shadow-lg text-red-400 border border-red-100 flex items-center justify-center">
                     <X size={32} strokeWidth={3} />
                 </button>
                 <button onClick={() => speak(currentWord.word)} className="w-12 h-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                    <Play size={20} fill="currentColor" />
                 </button>
                 <button onClick={() => handleRate(true)} className="w-16 h-16 rounded-full bg-green-500 text-white shadow-lg flex items-center justify-center">
                     <Check size={32} strokeWidth={3} />
                 </button>
            </div>
         )}
      </div>
    </div>
  );
};

export default ReviewSession;
