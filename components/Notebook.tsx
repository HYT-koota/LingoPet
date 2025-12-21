
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Calendar, Zap, BookOpen, Clock, BarChart3 } from 'lucide-react';
import { WordEntry } from '../types';
import { getWords } from '../services/storageService';

interface NotebookProps {
  onBack: () => void;
}

const Notebook: React.FC<NotebookProps> = ({ onBack }) => {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const allWords = getWords().sort((a, b) => b.addedAt - a.addedAt);
    setWords(allWords);
  }, []);

  const filteredWords = words.filter(w => 
    w.word.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (w.translation && w.translation.includes(searchTerm))
  );

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getReviewColor = (level: number) => {
      if (level === 0) return 'bg-gray-100 text-gray-400';
      if (level <= 2) return 'bg-orange-100 text-orange-600';
      if (level <= 4) return 'bg-teal-100 text-teal-600';
      return 'bg-brand-100 text-brand-600';
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 animate-pop">
      {/* Header */}
      <div className="bg-white px-6 pt-6 pb-4 shadow-sm z-10 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
              <button 
                onClick={onBack}
                className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors border border-gray-100"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-black text-gray-800 tracking-tight">Notebook</h1>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{words.length} WORDS COLLECTED</p>
              </div>
          </div>
          <div className="bg-brand-50 text-brand-600 px-3 py-1 rounded-full text-xs font-bold border border-brand-100">
              Lv. {Math.round(words.reduce((acc, w) => acc + w.reviewLevel, 0) / (words.length || 1))} Avg.
          </div>
        </div>
        
        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text" 
                placeholder="Find a word or translation..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 pl-12 pr-4 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all"
            />
        </div>
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 bg-dot-pattern">
          {filteredWords.length === 0 ? (
              <div className="text-center py-20">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BookOpen size={32} className="text-gray-300" />
                  </div>
                  <p className="text-gray-400 font-bold">No words match your search.</p>
              </div>
          ) : (
              <div className="space-y-4">
                  {filteredWords.map((word) => {
                      const isExpanded = expandedId === word.id;
                      const addedDate = new Date(word.addedAt).toLocaleDateString();
                      const reviewBadgeColor = getReviewColor(word.reviewLevel);
                      
                      return (
                        <div 
                            key={word.id} 
                            onClick={() => toggleExpand(word.id)}
                            className={`bg-white rounded-[2rem] border transition-all duration-300 overflow-hidden cursor-pointer group ${isExpanded ? 'shadow-2xl border-brand-500/30 scale-[1.02] ring-4 ring-brand-500/5' : 'shadow-sm border-gray-100 hover:border-brand-200 hover:translate-y-[-2px]'}`}
                        >
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-800 tracking-tight group-hover:text-brand-600 transition-colors">{word.word}</h3>
                                        {/* Default View: Just Translation */}
                                        <p className="text-sm font-bold text-teal-600 mt-0.5">
                                            {word.translation || "Learning..."}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-tighter ${reviewBadgeColor}`}>
                                            Lv.{word.reviewLevel} Master
                                        </span>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                                            <BarChart3 size={10} /> {word.reviewCount || 0} reviews
                                        </div>
                                    </div>
                                </div>
                                
                                {!isExpanded && (
                                    <div className="flex justify-end">
                                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest flex items-center gap-1">Tap for details</span>
                                    </div>
                                )}
                            </div>

                            {/* Expanded Details: English Explanation + Context */}
                            <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[500px] opacity-100 border-t border-gray-50 bg-brand-50/20' : 'max-h-0 opacity-0 invisible'}`}>
                                <div className="p-5 space-y-4">
                                    <div className="bg-white/60 rounded-2xl p-4 border border-brand-100/50">
                                        <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                                            <BookOpen size={10} /> English Definition
                                        </span>
                                        <p className="text-sm text-gray-700 leading-relaxed font-semibold">{word.definition}</p>
                                    </div>
                                    
                                    <div className="bg-white/60 rounded-2xl p-4 border border-brand-100/50">
                                        <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                                            <Clock size={10} /> In Context
                                        </span>
                                        <p className="text-sm text-gray-600 italic font-medium leading-relaxed">"{word.context}"</p>
                                    </div>

                                    <div className="flex items-center justify-between pt-2">
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                            <Calendar size={10} /> Collected {addedDate}
                                        </div>
                                        <div className="text-[10px] font-bold text-brand-400 italic">
                                            Keep going! You're doing great.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                      );
                  })}
              </div>
          )}
      </div>
    </div>
  );
};

export default Notebook;
