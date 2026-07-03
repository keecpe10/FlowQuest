import React from 'react';
import { motion } from 'framer-motion';
import { Trash2, Pin, Maximize2, Loader2 } from 'lucide-react';
import { useBrainstormStore, API_URL } from '../../store/useBrainstormStore';
import type { CardData } from '../../store/useBrainstormStore';
import { useAuthStore } from '../../store/useAuthStore';
import { LinkPreview } from './LinkPreview';

interface CardProps {
  card: CardData;
  isFocused?: boolean;
  isDimmed?: boolean;
}

const emojis = ['❤️', '🔥', '💡', '👍', '🤔'];

export const Card: React.FC<CardProps> = ({ card, isFocused, isDimmed }) => {
  const { board, toggleReaction, deleteCard, setSelectedCard } = useBrainstormStore();
  const user = useAuthStore(state => state.user);
  const [isDeleting, setIsDeleting] = React.useState(false);
  
  const isTeacher = user?.role === 'teacher';
  const isClosed = board?.status === 'closed';
  const canModify = isTeacher || (card.author_id === user?.user_id && !isClosed);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCard(card.card_id);
    } catch (e) {
      console.error(e);
      setIsDeleting(false);
    }
  };

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = React.useMemo(() => {
    const match = card.content.match(urlRegex);
    return match ? Array.from(new Set(match)) : [];
  }, [card.content]);

  const renderContent = () => {
    if (!urls.length) return card.content;
    const parts = card.content.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-words" onClick={(e) => e.stopPropagation()}>
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ 
        opacity: isDimmed ? 0.4 : 1, 
        scale: isFocused ? 1.05 : 1,
        boxShadow: isFocused ? '0 25px 50px -12px rgba(139, 92, 246, 0.5)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`relative w-full max-w-[320px] p-5 rounded-2xl border-2 backdrop-blur-md shrink-0 transition-colors ${
        isFocused ? 'border-violet-500 z-10' : 'border-white/20'
      }`}
      style={{ 
        backgroundColor: card.color || '#fff'
      }}
    >
      {/* Card Header */}
      <div className="flex justify-between items-start mb-3">
        <span className="text-xs font-bold text-gray-700 bg-white/50 px-3 py-1 rounded-full shadow-sm">
          {card.author_name || (card.author_id ? `User ${card.author_id}` : 'Anonymous')}
        </span>
        <div className="flex gap-1">
          {card.is_pinned && <Pin size={16} className="text-blue-500" />}
          
          <button 
            onClick={() => setSelectedCard(card)} 
            className="text-gray-400 hover:text-blue-500 transition-colors ml-1"
            title="ขยายดูโพสต์"
          >
            <Maximize2 size={16} />
          </button>

          {canModify && (
            <button 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="hover:text-red-500 transition-colors ml-1 disabled:opacity-50" 
              title="ลบโพสต์"
            >
              {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          )}
        </div>
      </div>

      {card.media_url && (
        <div className="mb-4 rounded-xl overflow-hidden border border-black/5 bg-black/5 relative group flex items-center justify-center">
          <img 
            src={`${API_URL}${card.media_url}`} 
            alt="Uploaded attachment" 
            className="w-full h-auto max-h-[250px] object-contain cursor-pointer hover:scale-105 transition-transform" 
            onClick={(e) => { e.stopPropagation(); window.open(`${API_URL}${card.media_url}`, '_blank'); }}
          />
        </div>
      )}

      <div 
        className="text-gray-800 font-medium whitespace-pre-wrap break-words mb-4 text-lg cursor-pointer hover:bg-black/5 p-1 rounded transition-colors"
        onClick={() => setSelectedCard(card)}
      >
        {renderContent()}
      </div>

      {urls.map((url, i) => {
        const getYoutubeId = (u: string) => {
          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
          const match = u.match(regExp);
          return (match && match[2].length === 11) ? match[2] : null;
        };
        const ytId = getYoutubeId(url);
        
        if (ytId) {
          return (
            <div key={`yt-${i}`} className="mt-3 rounded-xl overflow-hidden border border-black/10 bg-black/5 aspect-video relative">
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full"
              ></iframe>
            </div>
          );
        }
        return <LinkPreview key={`preview-${i}`} url={url} />;
      })}


      {/* Reaction Bar */}
      <div className="flex flex-wrap gap-1 mt-auto">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(card.card_id, emoji)}
            className="flex items-center gap-1 bg-white/50 hover:bg-white/80 rounded-full px-2 py-1 text-sm transition-colors"
          >
            <span>{emoji}</span>
            {card.reactions[emoji] > 0 && <span className="font-bold">{card.reactions[emoji]}</span>}
          </button>
        ))}
      </div>
    </motion.div>
  );
};
