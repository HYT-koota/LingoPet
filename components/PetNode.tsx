
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PetState } from '../types';
import { Heart, Zap, Star, Loader2 } from 'lucide-react';

interface PetNodeProps {
  pet: PetState;
  onClick: () => void;
  onImageError?: (stage: number, imageUrl?: string) => void;
}

const PetNode: React.FC<PetNodeProps> = ({ pet, onClick, onImageError }) => {
  const [isPetted, setIsPetted] = useState(false);
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const failedUrlRef = useRef<string | null>(null);

  const handlePet = () => {
    setIsPetted(true);
    onClick();
    setTimeout(() => setIsPetted(false), 1000);
  };
  
  const imageUrl = pet.imageUrls?.[pet.stage];
  const placeholderImage = useMemo(
    () =>
      `data:image/svg+xml;base64,${btoa(
        `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#F9FAFB"/><rect x="156" y="156" width="200" height="200" rx="40" fill="#FCD34D" opacity="0.2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#D97706">${pet.name}</text></svg>`
      )}`,
    [pet.name]
  );

  useEffect(() => {
    let cancelled = false;

    if (!imageUrl) {
      setDisplayImageUrl(placeholderImage);
      setImageLoading(false);
      return;
    }

    setImageLoading(true);
    const img = new Image();
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setDisplayImageUrl(placeholderImage);
      setImageLoading(false);
      if (!imageUrl.startsWith('data:image/svg+xml;base64,') && failedUrlRef.current !== imageUrl) {
        failedUrlRef.current = imageUrl;
        onImageError?.(pet.stage, imageUrl);
      }
    }, 6000);

    img.onload = () => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      setDisplayImageUrl(imageUrl);
      setImageLoading(false);
    };

    img.onerror = () => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      setDisplayImageUrl(placeholderImage);
      setImageLoading(false);
      if (!imageUrl.startsWith('data:image/svg+xml;base64,') && failedUrlRef.current !== imageUrl) {
        failedUrlRef.current = imageUrl;
        onImageError?.(pet.stage, imageUrl);
      }
    };

    img.src = imageUrl;

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [imageUrl, onImageError, pet.stage, placeholderImage]);
  
  return (
    <div className="w-full flex items-center justify-between p-4 relative" onClick={handlePet}>
      
      {/* Left: Speech Bubble Area */}
      <div className="flex-1 pr-4 z-10 relative flex flex-col items-start">
         <div className="bg-white/90 backdrop-blur-sm border border-brand-100 rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-none p-4 shadow-lg relative animate-pop transform origin-bottom-left md:max-w-[50%]">
            <p className="text-sm text-gray-700 font-bold leading-snug">
                "{pet.dailyQuote || '...'}"
            </p>
            {/* Tail of bubble */}
            <div className="absolute -bottom-2 left-0 w-4 h-4 bg-white/90 border-b border-l border-brand-100 transform rotate-45 z-[-1]"></div>
         </div>
         
         {/* Mood Badges */}
         <div className="flex gap-2 mt-4 ml-2">
            {pet.mood === 'happy' && <span className="bg-coral-100 text-coral-600 px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1"><Heart size={10} fill="currentColor"/> Happy</span>}
            {pet.mood === 'excited' && <span className="bg-yellow-100 text-yellow-600 px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1"><Zap size={10} fill="currentColor"/> Excited</span>}
            {pet.xp > 1000 && <span className="bg-teal-100 text-teal-600 px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1"><Star size={10} fill="currentColor"/> Pro</span>}
         </div>
      </div>

      {/* Right: Pet Image */}
      <div className={`relative w-40 h-40 flex-shrink-0 transition-all duration-500 ${isPetted ? 'scale-95' : 'hover:scale-105'} z-10`}>
         {isPetted && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                <Heart className="w-8 h-8 text-coral-500 fill-current animate-bounce" />
            </div>
        )}
        
        <div className="w-full h-full flex items-center justify-center">
            {imageLoading ? (
                <div className="w-24 h-24 bg-brand-100 rounded-full flex items-center justify-center animate-pulse shadow-inner">
                    <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                </div>
            ) : displayImageUrl ? (
                <img
                    data-testid="pet-image"
                    src={displayImageUrl}
                    alt={pet.name}
                    className="w-full h-full object-contain animate-float drop-shadow-lg"
                />
            ) : (
                <div className="w-24 h-24 bg-brand-100 rounded-full flex items-center justify-center animate-pulse shadow-inner">
                    <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                </div>
            )}
        </div>
        
        {/* Shadow Grounding */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-3 bg-black/10 rounded-[100%] blur-sm"></div>
      </div>

    </div>
  );
};

export default PetNode;
