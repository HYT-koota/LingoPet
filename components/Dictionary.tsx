import React, { useState } from 'react';
import { Mic, Search, Loader2, CheckCircle, Sparkles } from 'lucide-react';
import { queryDictionary, generateCardImage } from '../services/geminiService';
import { saveWord, updateWord, updateDailyStats, getDailyStats } from '../services/storageService';
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
      alert("Browser doesn't support speech recognition.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      handleSearch(transcript); 
    };
    recognition.start();
  };

  const handleSearch = async (searchTerm: string = input) => {
    if (!searchTerm.trim()) return;
    setIsLoading(true);
    setResult(null);
    setAdded(false);
    
    try {
      const data = await queryDictionary(searchTerm);
      if (data) {
        setResult(data);
        const newWord: WordEntry = {
          id: crypto.randomUUID(),
          word: data.identifiedWord,
          definition: data.definition,
          context: data.example,
          addedAt: Date.now(),
          lastReviewedAt: null,
          reviewLevel: 0,
          nextReviewDate: Date.now(), 
        };
        saveWord(newWord);
        
        // Background process: Generate image immediately so it's ready for review
        generateCardImage(newWord.word, newWord.context).then(imgUrl => {
            updateWord(newWord.id, { 
                todayImage: imgUrl, 
                todayImageDate: new Date().toISOString().split('T')[0] 
            });
        });

        // Fixed: Get current stats first, then increment
        const currentStats = getDailyStats();
        updateDailyStats({ wordsAdded: (currentStats.wordsAdded || 0) + 1 });
        
        setAdded(true);
        onWordAdded();
      }
    } catch (error: any) {
      console.error("Dictionary error", error);
      alert(`Error: ${error.message || "Unknown API Error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full px-6 py-4 overflow-y-auto">
      
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold text-brand-800 mb-1">New Word?</h2>
        <p className="text-brand-600/80 font-medium">Ask me anything, I'll take notes.</p>
      </div>

      <div className="relative group z-10">
        <div className={`absolute -inset-1 bg-gradient-to-r from-brand-300 to-brand-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 ${isListening ? 'animate-pulse opacity-75' : ''}`}></div>
        <div className="relative flex items-center w-full bg-white rounded-2xl shadow-xl transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Type 'Attention'..."
              className="flex-1 bg-transparent pl-6 pr-2 py-5 outline-none text-xl text-gray-800 placeholder-gray-300 font-bold rounded-l-2xl"
            />
            <button 
              onClick={startListening}
              className={`p-3 mr-2 rounded-xl transition-all ${isListening ? 'bg-red-50 text-red-500' : 'hover:bg-gray-50 text-gray-400'}`}
            >
              <Mic size={22} />
            </button>
            <button 
              onClick={() => handleSearch()}
              className="bg-brand-500 hover:bg-brand-400 text-white p-4 rounded-xl m-1 shadow-md transition-transform active:scale-95"
            >
              {isLoading ? <Loader2 size={22} className="animate-spin" /> : <Search size={22} strokeWidth={3} />}
            </button>
        </div>
      </div>

      <div className="mt-8 flex-1">
        {isLoading && (
            <div className="flex flex-col items-center justify-center h-40 text-brand-400 opacity-70">
                <Sparkles className="animate-spin mb-2" size={32}/>
                <span className="text-sm font-bold tracking-widest uppercase">Thinking...</span>
            </div>
        )}

        {result && (
          <div className="animate-pop">
            <div className="bg-white rounded-3xl p-8 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] border border-white ring-4 ring-brand-50 relative overflow-hidden">
              
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 rounded-full translate-x-10 -translate-y-10"></div>
              
              <div className="relative">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-4xl font-extrabold text-gray-800 capitalize tracking-tight">
                      {result.identifiedWord}
                    </h3>
                    <span className="bg-teal-50 text-teal-600 text-xs font-bold px-3 py-1.5 rounded-full border border-teal-100">
                        {result.translation}
                    </span>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <p className="text-xl text-gray-600 font-medium leading-relaxed">{result.definition}</p>
                    </div>
                    
                    <div className="bg-brand-50/50 p-5 rounded-2xl border border-brand-100/50">
                      <div className="flex items-start gap-3">
                          <div className="mt-1 min-w-[4px] h-4 bg-brand-300 rounded-full"></div>
                          <p className="text-gray-700 italic font-medium text-lg">"{result.example}"</p>
                      </div>
                    </div>
                  </div>

                  {added && (
                    <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-center text-brand-600 font-bold animate-pulse">
                      <div className="bg-brand-100 p-2 rounded-full mr-2">
                         <CheckCircle size={20} fill="currentColor" className="text-white" />
                      </div>
                      Added to Notebook
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}

        {!result && !isLoading && (
            <div className="text-center mt-12 opacity-40">
                <div className="inline-block p-6 bg-white rounded-full mb-4 shadow-sm">
                    <Search size={48} className="text-gray-300" />
                </div>
                <p className="font-bold text-gray-400">Ready to learn?</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Dictionary;