import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Pin, Maximize2, Loader2, MessageCircle, Send, X } from 'lucide-react';
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
  const { board, toggleReaction, deleteCard, setSelectedCard, addComment, deleteComment } = useBrainstormStore();
  const user = useAuthStore(state => state.user);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);

  const isTeacher = user?.role === 'teacher';
  const isClosed = board?.status === 'closed';
  const canModify = isTeacher || (card.author_id === user?.user_id && !isClosed && !board?.is_completed);
  const comments = card.comments || [];

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCard(card.card_id);
    } catch (e) {
      console.error(e);
      setIsDeleting(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isPostingComment) return;
    setIsPostingComment(true);
    try {
      await addComment(card.card_id, commentText.trim());
      setCommentText('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    await deleteComment(commentId, card.card_id);
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

  const formatTime = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
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
      className={`relative w-full max-w-[320px] rounded-2xl border-2 backdrop-blur-md shrink-0 transition-colors overflow-hidden ${
        isFocused ? 'border-violet-500 z-10' : 'border-white/20'
      }`}
      style={{ 
        backgroundColor: card.color || '#fff'
      }}
    >
      {/* Card Main Content */}
      <div className="p-5">
        {/* Card Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2.5 bg-white/60 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm max-w-[220px]">
            {card.author_avatar ? (
              <img src={card.author_avatar} alt="Avatar" className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/50 shadow-sm" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0 shadow-sm">
                <span className="text-xs font-bold text-indigo-700">
                  {(card.author_name || 'A')[0]}
                </span>
              </div>
            )}
            <span className="text-sm font-bold text-gray-800 truncate" title={card.author_name || 'Anonymous'}>
              {card.author_name || (card.author_id ? `User ${card.author_id}` : 'Anonymous')}
            </span>
          </div>
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

        {/* Reaction Bar + Comment Toggle */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="flex flex-wrap gap-1">
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

          {/* Comment Button */}
          <button
            onClick={() => setShowComments(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold transition-all ml-2 shrink-0 ${
              showComments
                ? 'bg-indigo-500 text-white shadow-md'
                : comments.length > 0
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  : 'bg-white/50 text-gray-500 hover:bg-white/80'
            }`}
            title={showComments ? 'ซ่อนความคิดเห็น' : 'แสดงความคิดเห็นของครู'}
          >
            <MessageCircle size={14} />
            {comments.length > 0 && <span>{comments.length}</span>}
          </button>
        </div>
      </div>

      {/* Comment Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-black/10"
          >
            <div className="bg-indigo-50/80 backdrop-blur-sm px-4 pt-3 pb-2">
              <div className="flex items-center gap-1.5 mb-2">
                <MessageCircle size={13} className="text-indigo-500" />
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">ความคิดเห็นจากครู</span>
              </div>

              {/* Comments List */}
              {comments.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-2">
                  {isTeacher ? 'ยังไม่มีความคิดเห็น' : 'ครูยังไม่ได้แสดงความคิดเห็น'}
                </p>
              ) : (
                <div className="space-y-2 mb-2 max-h-48 overflow-y-auto pr-1">
                  {comments.map(cmt => (
                    <motion.div
                      key={cmt.comment_id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-2 items-start group"
                    >
                      {/* Avatar */}
                      {cmt.author_avatar ? (
                        <img src={cmt.author_avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 border border-white shadow-sm mt-0.5" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-indigo-200 border border-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-indigo-700">{(cmt.author_name || 'T')[0]}</span>
                        </div>
                      )}

                      {/* Bubble */}
                      <div className="flex-1 min-w-0">
                        <div className="bg-white rounded-xl rounded-tl-none px-3 py-2 shadow-sm border border-indigo-100 relative">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-[11px] font-bold text-indigo-700 truncate">{cmt.author_name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] text-gray-400">{formatTime(cmt.created_at)}</span>
                              {isTeacher && (
                                <button
                                  onClick={() => handleDeleteComment(cmt.comment_id)}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all p-0.5 rounded"
                                  title="ลบความคิดเห็น"
                                >
                                  <X size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-gray-700 break-words leading-snug">{cmt.content}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Teacher Input Box */}
              {isTeacher && (
                <form onSubmit={handlePostComment} className="flex gap-2 mt-2 mb-1">
                  <input
                    type="text"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="เขียนความคิดเห็น..."
                    className="flex-1 bg-white border border-indigo-200 rounded-full px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                    maxLength={300}
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim() || isPostingComment}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white p-2 rounded-full disabled:opacity-50 transition-colors shrink-0 flex items-center justify-center"
                    title="ส่งความคิดเห็น"
                  >
                    {isPostingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
