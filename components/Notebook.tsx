
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Calendar, Zap, BookOpen } from 'lucide-react';
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
      if (level === 0) return 'bg-gray-200 text-gray-500';
      if (level <= 2) return 'bg-orange-100 text-orange-600';
      if (level <= 4) return 'bg-teal-100 text-teal-600';
      return 'bg-brand-100 text-brand-600'; // Mastered
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white px-6 pt-6 pb-4 shadow-sm z-10">
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-extrabold text-gray-800 flex items-center gap-2">
              <BookOpen className="text-brand-500" size={24}/> Notebook
          </h1>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text" 
                placeholder="Search your words..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-100 rounded-xl py-3 pl-10 pr-4 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredWords.length === 0 ? (
              <div className="text-center py-12 opacity-50">
                  <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-400 font-bold">No words found</p>
              </div>
          ) : (
              <div className="space-y-3">
                  {filteredWords.map((word) => {
                      const isExpanded = expandedId === word.id;
                      const addedDate = new Date(word.addedAt).toLocaleDateString();
                      const reviewBadgeColor = getReviewColor(word.reviewLevel);
                      
                      return (
                        <div 
                            key={word.id} 
                            onClick={() => toggleExpand(word.id)}
                            className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden cursor-pointer ${isExpanded ? 'shadow-md border-brand-200 ring-1 ring-brand-100' : 'shadow-sm border-gray-100 hover:border-brand-200'}`}
                        >
                            <div className="p-4">
                                <div className="flex justify-between items-center mb-1">
                                    <h3 className="text-lg font-extrabold text-gray-800">{word.word}</h3>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${reviewBadgeColor}`}>
                                        <Zap size={8} fill="currentColor" /> Lv.{word.reviewLevel}
                                    </span>
                                </div>
                                
                                {/* Default View: Just Translation */}
                                <div className="flex justify-between items-end">
                                    <p className="text-sm font-bold text-gray-500">
                                        {word.translation || "No translation"}
                                    </p>
                                    {!isExpanded && (
                                        <span className="text-[10px] text-gray-300">Tap for details</span>
                                    )}
                                </div>
                            </div>

                            {/* Expanded Details */}
                            <div className={`bg-brand-50/30 border-t border-brand-50 px-4 py-3 transition-all duration-300 ${isExpanded ? 'block' : 'hidden'}`}>
                                <div className="mb-3">
                                    <span className="text-[10px] font-bold text-brand-400 uppercase tracking-wider block mb-1">Definition</span>
                                    <p className="text-sm text-gray-700 leading-relaxed font-medium">{word.definition}</p>
                                </div>
                                <div className="mb-3">
                                    <span className="text-[10px] font-bold text-brand-400 uppercase tracking-wider block mb-1">Context</span>
                                    <p className="text-sm text-gray-600 italic">"{word.context}"</p>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-2 justify-end">
                                    <Calendar size={10} /> Added {addedDate}
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
