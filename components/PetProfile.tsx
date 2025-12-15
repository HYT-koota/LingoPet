
import React from 'react';
import { PetState, PetStage } from '../types';
import { Trophy, BookOpen, MapPin, Star, Activity, ChevronRight } from 'lucide-react';
import { CURRENT_CONFIG } from '../services/geminiService';
import { getWords } from '../services/storageService';

interface PetProfileProps {
  pet: PetState;
  onOpenNotebook: () => void;
}

const PetProfile: React.FC<PetProfileProps> = ({ pet, onOpenNotebook }) => {
  const wordCount = getWords().length;

  const stages = [
    { id: PetStage.EGG, label: 'Egg', desc: 'Waiting to hatch' },
    { id: PetStage.BABY, label: 'Baby', desc: 'Needs 100 XP' },
    { id: PetStage.TEEN, label: 'Teen', desc: 'Needs 500 XP' },
    { id: PetStage.ADULT, label: 'Adult', desc: 'Needs 1500 XP' },
  ];

  return (
    <div className="h-full w-full overflow-y-auto px-6 py-6 bg-brand-50/50 relative">
       <div className="mb-8">
           <h1 className="text-3xl font-extrabold text-brand-800">Pet Journey</h1>
           <p className="text-brand-600">Cycle {pet.cycle} • {pet.name}</p>
       </div>

       {/* Stats Card */}
       <div className="bg-white p-6 rounded-3xl shadow-sm border border-brand-100 mb-6 flex justify-between items-center">
           <div className="text-center">
               <div className="bg-teal-50 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 text-teal-600">
                   <Star size={24} fill="currentColor" />
               </div>
               <span className="font-bold text-gray-700">{pet.xp} XP</span>
           </div>
           <div className="text-center border-l border-gray-100 pl-6">
               <div className="bg-coral-50 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 text-coral-500">
                   <MapPin size={24} />
               </div>
               <span className="font-bold text-gray-700">{pet.postcardCollection.length} Trips</span>
           </div>
           <div className="text-center border-l border-gray-100 pl-6">
               <div className="bg-brand-50 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 text-brand-500">
                   <Trophy size={24} />
               </div>
               <span className="font-bold text-gray-700">Cycle {pet.cycle}</span>
           </div>
       </div>

       {/* Notebook Entry Card */}
       <button 
         onClick={onOpenNotebook}
         className="w-full bg-white p-6 rounded-3xl shadow-sm border border-brand-100 mb-6 flex justify-between items-center group hover:bg-brand-50 transition-colors"
       >
            <div className="flex items-center gap-4">
                <div className="bg-brand-100 text-brand-600 w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <BookOpen size={24} />
                </div>
                <div className="text-left">
                    <h3 className="text-lg font-bold text-gray-800 group-hover:text-brand-700 transition-colors">My Notebook</h3>
                    <p className="text-sm text-gray-500">{wordCount} words collected</p>
                </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-brand-200 group-hover:text-brand-700 transition-colors">
                <ChevronRight size={20} />
            </div>
       </button>

       {/* Timeline */}
       <div className="bg-white p-6 rounded-3xl shadow-sm border border-brand-100 mb-6">
           <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
               <BookOpen size={18} className="text-brand-500"/> Evolution Path
           </h3>
           <div className="space-y-6 relative">
               {/* Connector Line */}
               <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-100"></div>

               {stages.map((s) => {
                   const isActive = pet.stage >= s.id;
                   const isCurrent = pet.stage === s.id;
                   
                   return (
                       <div key={s.id} className={`relative flex items-center gap-4 ${isActive ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${isCurrent ? 'bg-brand-500 text-white ring-4 ring-brand-100' : isActive ? 'bg-brand-200 text-brand-700' : 'bg-gray-200 text-gray-400'}`}>
                               {isActive ? <Star size={12} fill="currentColor"/> : <div className="w-2 h-2 bg-current rounded-full"></div>}
                           </div>
                           <div>
                               <p className={`font-bold ${isCurrent ? 'text-brand-700 text-lg' : 'text-gray-700'}`}>{s.label}</p>
                               <p className="text-xs text-gray-400">{s.desc}</p>
                           </div>
                           {pet.imageUrls[s.id] && (
                               <img src={pet.imageUrls[s.id]} className="ml-auto w-10 h-10 rounded-lg object-cover border border-gray-100" alt="Stage"/>
                           )}
                       </div>
                   )
               })}
           </div>
       </div>

       {/* Rules (Chinese) */}
       <div className="bg-white/80 p-6 rounded-3xl border border-brand-50 mb-6">
           <h3 className="font-bold text-gray-800 mb-3">成长规则 (Growth Rules)</h3>
           <ul className="text-sm text-gray-600 space-y-2 list-disc pl-4">
               <li><span className="font-bold">每日学习：</span> 添加新单词 (+10 XP)。</li>
               <li><span className="font-bold">每日复习：</span> 完成复习卡片 (+50 XP)。</li>
               <li><span className="font-bold">进化：</span> 当 XP 达到特定值时，我会进化成新的形态。</li>
               <li><span className="font-bold">旅行：</span> 成年后我会去世界各地旅行，并给你寄明信片！</li>
           </ul>
       </div>

       {/* System Diagnostics */}
       <div className="bg-gray-100 p-4 rounded-xl text-xs font-mono text-gray-500 relative">
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold flex items-center gap-1"><Activity size={12}/> SYSTEM DIAGNOSTICS</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-2 gap-y-4">
                {/* Text Config */}
                <div className="col-span-2 border-b border-gray-200 pb-2">
                    <span className="block font-bold text-gray-600 mb-1">Text API (Chat)</span>
                    <div className="flex justify-between">
                         <span className="opacity-70">Status:</span>
                         <span className={CURRENT_CONFIG.hasTextKey ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                            {CURRENT_CONFIG.hasTextKey ? "✅ Ready" : "❌ Missing"}
                        </span>
                    </div>
                    <div className="flex justify-between mt-1">
                         <span className="opacity-70">Model:</span>
                         <span className="text-gray-700">{CURRENT_CONFIG.textModel}</span>
                    </div>
                </div>

                {/* Image Config */}
                <div className="col-span-2">
                    <span className="block font-bold text-gray-600 mb-1">Image API (DALL-E)</span>
                    <div className="flex justify-between">
                         <span className="opacity-70">Status:</span>
                         <span className={CURRENT_CONFIG.hasImageKey ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                            {CURRENT_CONFIG.hasImageKey ? "✅ Ready" : "❌ Missing"}
                        </span>
                    </div>
                    <div className="flex justify-between mt-1">
                         <span className="opacity-70">Model:</span>
                         <span className="text-gray-700">{CURRENT_CONFIG.imageModel}</span>
                    </div>
                </div>
            </div>
       </div>
    </div>
  );
};

export default PetProfile;
