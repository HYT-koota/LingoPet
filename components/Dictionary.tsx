
import React, { useState } from 'react';
import { Mic, Search, Loader2, CheckCircle, Sparkles, BrainCircuit } from 'lucide-react';
import { queryDictionary, generateCardImage } from '../services/apiService';
import { saveWord, updateWord, updateDailyStats, getDailyStats } from '../services/supabaseDataService';
import { WordEntry } from '../types';

interface DictionaryProps {
  onWordAdded: () => void;
}

const Dictionary: React.FC<DictionaryProps> = ({ onWordAdded }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [added, setAdded] = useState(false);

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("浏览器不支持语音识别");
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      handleSearch(transcript); 
    };
    recognition.start();
  };

  const handleSearch = async (searchTerm: string = input) => {
    if (!searchTerm.trim()) return;
    console.log('[Dictionary] handleSearch called for:', searchTerm);
    setIsLoading(true);
    setResult(null);
    setAdded(false);

    try {
      console.log('[Dictionary] Calling queryDictionary for:', searchTerm);
      let data;
      try {
        data = await queryDictionary(searchTerm);
        console.log('[Dictionary] queryDictionary result:', data);
      } catch (queryError) {
        console.error('[Dictionary] queryDictionary failed:', queryError);
        throw new Error(`词典查询失败: ${queryError instanceof Error ? queryError.message : '未知错误'}`);
      }

      if (data && data.identifiedWord) {
        console.log('[Dictionary] Valid data received, identifiedWord:', data.identifiedWord);
        setResult(data);
        const newWord: WordEntry = {
          id: crypto.randomUUID(),
          word: data.identifiedWord,
          definition: data.definition,
          translation: data.translation,
          context: data.example,
          visualDescription: data.visualDescription,
          addedAt: Date.now(),
          lastReviewedAt: null,
          reviewLevel: 0,
          reviewCount: 0,
          nextReviewDate: Date.now(),
        };
        console.log('[Dictionary] Attempting to save word:', newWord.word, 'ID:', newWord.id, 'Full object:', JSON.stringify(newWord, null, 2));

        let savedWordInfo: { id: string; isNew: boolean } | null = null;
        try {
          console.log('[Dictionary] Calling saveWord...');
          savedWordInfo = await saveWord(newWord);
          console.log('[Dictionary] saveWord completed successfully');
        } catch (saveError) {
          console.error('[Dictionary] saveWord failed:', saveError);
          throw saveError; // Re-throw to be caught by outer catch
        }

        if (!savedWordInfo) {
          throw new Error('saveWord returned empty result');
        }

        const persistedWordId = savedWordInfo.id;
        const isNewWord = savedWordInfo.isNew;
        console.log('[Dictionary] saveWord result:', { persistedWordId, isNewWord });

        // 异步生成图片（不阻塞文本显示）
        console.log('[Dictionary] Generating card image...');
        generateCardImage(newWord.word, newWord.context, newWord.visualDescription).then(imgUrl => {
            console.log('[Dictionary] Card image generated, updating word with image URL');
            updateWord(persistedWordId, {
                todayImage: imgUrl
            }).catch((imgPersistError) => {
              console.error('[Dictionary] Failed to persist generated card image:', imgPersistError);
            });
        }).catch(imgError => {
          console.error('[Dictionary] Failed to generate card image:', imgError);
        });

        if (isNewWord) {
          console.log('[Dictionary] Updating daily stats for newly added word...');
          const currentStats = await getDailyStats();
          console.log('[Dictionary] Current stats:', currentStats);
          await updateDailyStats({ wordsAdded: (currentStats.wordsAdded || 0) + 1 });
          setAdded(true);
          console.log('[Dictionary] Calling onWordAdded callback');
          onWordAdded();
        } else {
          console.log('[Dictionary] Word already exists; skip wordsAdded increment and XP update');
          setAdded(false);
        }
        console.log('[Dictionary] Word added process completed');
      } else {
        console.warn('[Dictionary] queryDictionary returned null/undefined data');
      }
    } catch (error: any) {
      console.error("[Dictionary] Overall error", error);
      alert(error.message || "请求失败，请检查网络或 API 配置");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full px-6 py-4 overflow-y-auto bg-dot-pattern">
      
      <div className="mb-6 animate-pop">
        <h2 className="text-3xl font-extrabold text-brand-800 mb-1 flex items-center gap-2">
            What's that? <Sparkles className="text-brand-400" size={24} />
        </h2>
        <p className="text-brand-600/80 font-medium">Type or speak to learn something new.</p>
      </div>

      <div className="relative group z-10">
        <div className={`absolute -inset-1 bg-gradient-to-r from-brand-300 to-teal-200 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 ${isListening ? 'animate-pulse opacity-60' : ''}`}></div>
        <div className="relative flex items-center w-full bg-white rounded-2xl shadow-xl transition-all border border-brand-100/50 overflow-hidden">
            <input
              data-testid="dictionary-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter a word..."
              className="flex-1 bg-transparent pl-6 pr-2 py-5 outline-none text-xl text-gray-800 placeholder-gray-300 font-bold"
            />
            <button 
              data-testid="dictionary-voice"
              onClick={startListening}
              className={`p-3 mr-2 rounded-xl transition-all ${isListening ? 'bg-red-50 text-red-500' : 'hover:bg-brand-50 text-brand-400'}`}
            >
              <Mic size={22} />
            </button>
            <button 
              data-testid="dictionary-search"
              onClick={() => handleSearch()}
              disabled={isLoading}
              className="bg-brand-500 hover:bg-brand-600 text-white p-5 transition-all disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={24} className="animate-spin" /> : <Search size={24} strokeWidth={3} />}
            </button>
        </div>
      </div>

      <div className="mt-8 flex-1">
        {isLoading && (
            <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="relative">
                    <BrainCircuit className="text-brand-400 animate-pulse" size={64} />
                    <div className="absolute -top-2 -right-2">
                        <Loader2 className="text-teal-400 animate-spin" size={24} />
                    </div>
                </div>
                <div className="text-center">
                    <p className="text-brand-800 font-black text-lg tracking-tight">Your pet is thinking...</p>
                    <p className="text-brand-400 text-xs font-bold uppercase tracking-widest mt-1">Accessing GMI Intelligence</p>
                </div>
            </div>
        )}

        {result && (
          <div className="animate-pop">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-white ring-8 ring-brand-50/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 rounded-full translate-x-10 -translate-y-10 opacity-50"></div>
              
              <div className="relative">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-4xl font-black text-gray-900 capitalize tracking-tighter mb-1">
                          {result.identifiedWord}
                        </h3>
                        <div className="h-1 w-12 bg-brand-500 rounded-full"></div>
                    </div>
                    <span className="bg-teal-500 text-white text-sm font-black px-4 py-2 rounded-2xl shadow-sm">
                        {result.translation}
                    </span>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
                      <p className="text-xl text-gray-700 font-semibold leading-relaxed">{result.definition}</p>
                    </div>
                    
                    <div className="bg-brand-50/30 p-6 rounded-2xl border border-brand-100/50 relative">
                      <div className="absolute -top-3 left-6 bg-white px-3 py-1 rounded-full border border-brand-100 text-[10px] font-black text-brand-400 uppercase tracking-widest">Example</div>
                      <p className="text-gray-800 italic font-bold text-lg">"{result.example}"</p>
                    </div>
                  </div>

                  {added && (
                    <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-center text-teal-600 font-black animate-bounce">
                      <CheckCircle size={24} className="mr-2" />
                      Added to Memory
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}

        {!result && !isLoading && (
            <div className="flex flex-col items-center justify-center mt-12 opacity-30 select-none">
                <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center shadow-inner border-2 border-dashed border-gray-200">
                    <Search size={48} className="text-gray-300" />
                </div>
                <p className="font-black text-gray-400 mt-4 text-lg">Waiting for input...</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Dictionary;

