
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useBrainstormStore } from '../../store/useBrainstormStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Card } from './Card';
import { MousePointer2, Plus, Sparkles, Send, Home, Eye, EyeOff, ZoomIn, ZoomOut, Maximize, Grid3X3, Image as ImageIcon, X, Loader2, Search } from 'lucide-react';

interface BrainstormBoardProps {
  boardId?: number;
  missionId?: number;
}

const colors = ['#ffffff', '#fdf2f8', '#eff6ff', '#f0fdf4', '#fefce8', '#fff7ed'];

export const BrainstormBoard: React.FC<BrainstormBoardProps> = ({ boardId, missionId }) => {
  const { 
    board, cards, cursors, summary, selectedCard, isSummarizing,
    fetchBoard, fetchBoardByMission, initSocket, disconnectSocket, emitCursorMove, addCard, fetchSummary, setSelectedCard
  } = useBrainstormStore();
  
  const [searchParams] = useSearchParams();
  const focusStudentId = searchParams.get('focus_student') ? parseInt(searchParams.get('focus_student') as string) : null;
  
  const [newText, setNewText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const lastMouseUpdate = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [selectedColor, setSelectedColor] = useState(colors[0]);
  const boardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  const user = useAuthStore(state => state.user);

  const isTeacher = user?.role === 'teacher';
  const isClosed = board?.status === 'closed';
  const showPosts = board?.show_student_posts ?? true;
  const hasQuestions = board?.questions && board.questions.length > 0;
  const hasPosted = cards.some(c => c.author_id === user?.user_id);
  
  const visibleCards = cards.filter(card => {
    const canSee = isTeacher || showPosts || card.author_id === user?.user_id;
    if (!canSee) return false;
    
    if (searchQuery.trim()) {
      const authorName = (card.author_name || '').toLowerCase();
      if (!authorName.includes(searchQuery.trim().toLowerCase())) return false;
    }
    
    return true;
  });

  useEffect(() => {
    if (boardId) {
      fetchBoard(boardId).then((realBoardId) => {
        if (realBoardId) {
          initSocket(realBoardId, user?.user_id || Math.floor(Math.random() * 1000));
        }
      });
    } else if (missionId) {
      fetchBoardByMission(missionId).then((realBoardId) => {
        if (realBoardId) {
          initSocket(realBoardId, user?.user_id || Math.floor(Math.random() * 1000));
        }
      });
    }
    
    return () => {
      disconnectSocket();
    };
  }, [boardId, missionId, fetchBoard, fetchBoardByMission, initSocket, disconnectSocket, user?.user_id]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newText.trim() && !selectedImage) || !board || isSubmitting) return;

    setIsSubmitting(true);
    let mediaUrl = undefined;
    if (selectedImage) {
      const url = await useBrainstormStore.getState().uploadImage(selectedImage);
      if (url) mediaUrl = url;
    }

    await addCard({
      card_type: 'text',
      content: newText.trim(),
      position_x: window.innerWidth / 2 - 100 + (Math.random() * 50 - 25),
      position_y: window.innerHeight / 2 - 100 + (Math.random() * 50 - 25),
      color: selectedColor,
      media_url: mediaUrl
    });
    
    setNewText('');
    setSelectedImage(null);
    setImagePreview(null);
    setIsSubmitting(false);
  };

  const handleAddCardToQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!board || !board.questions || isSubmitting) return;
    
    setIsSubmitting(true);
    
    let combinedContent = '';
    for (let i = 0; i < board.questions.length; i++) {
      const q = board.questions[i];
      const ans = answers[q.question_id];
      if (ans && ans.trim()) {
        if (combinedContent) combinedContent += '\n\n';
        combinedContent += `**Q${i + 1}: ${q.content}**\n${ans.trim()}`;
      }
    }
    
    if (!combinedContent && !selectedImage) {
      setIsSubmitting(false);
      return;
    }
    
    let mediaUrl = undefined;
    if (selectedImage) {
      const url = await useBrainstormStore.getState().uploadImage(selectedImage);
      if (url) mediaUrl = url;
    }
    
    await addCard({
      card_type: 'text',
      content: combinedContent,
      position_x: window.innerWidth / 2 - 100 + (Math.random() * 50 - 25),
      position_y: window.innerHeight / 2 - 100 + (Math.random() * 50 - 25),
      color: selectedColor,
      media_url: mediaUrl,
      question_id: null // Explicitly null to mean it answers all
    });
    
    setAnswers({});
    setSelectedImage(null);
    setImagePreview(null);
    setShowAnswerModal(false);
    setIsSubmitting(false);
  };



  const handleGoHome = () => {
    Swal.fire({
      title: 'กลับหน้ารายการด่าน?',
      text: "คุณต้องการออกจากกระดานระดมความคิดนี้ใช่หรือไม่?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ec4899', // pink-500
      cancelButtonColor: '#6b7280', // gray-500
      confirmButtonText: 'ใช่, กลับไป',
      cancelButtonText: 'ยกเลิก'
    }).then((result) => {
      if (result.isConfirmed) {
        navigate(-1);
      }
    });
  };

  if (!board) return <div className="flex h-screen items-center justify-center text-white text-xl">Loading BrainStorm Station...</div>;

  return (
    <div 
      className="relative w-full h-screen overflow-auto bg-gradient-to-br from-indigo-900 via-purple-800 to-pink-900 custom-scrollbar"
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

      {/* Header Info */}
      <div className="absolute top-4 left-4 z-50 flex flex-col md:flex-row gap-2 md:gap-4 items-start md:items-center">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleGoHome}
            className="bg-white/20 hover:bg-white/40 text-white p-2 rounded-full backdrop-blur-md border border-white/30 transition-transform hover:scale-110 shadow-lg"
            title="กลับหน้าหลัก"
          >
            <Home size={20} className="md:w-6 md:h-6" />
          </button>
          <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight drop-shadow-lg flex items-center gap-2">
            🧠 {board.title}
          </h1>
        </div>
        <div className="flex gap-2">
          <div 
            className="bg-black/30 backdrop-blur-md px-3 md:px-4 py-1.5 rounded-full text-white text-xs md:text-sm font-bold border border-white/20 shadow-inner flex items-center gap-2 cursor-pointer hover:bg-black/40 transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(board.board_id.toString());
              Swal.fire({ icon: 'success', text: `คัดลอกรหัสกระดานเรียบร้อย: ${board.board_id}` });
            }}
            title="Click to copy ID"
          >
            ID: <span className="text-pink-300 text-sm md:text-lg">{board.board_id}</span>
          </div>
          <div className="bg-white/20 backdrop-blur-md px-3 md:px-4 py-1.5 rounded-full text-white text-xs md:text-sm font-medium border border-white/30 flex items-center">
            {cards.length} Ideas
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="absolute top-4 right-4 z-50 flex flex-col md:flex-row gap-2 md:gap-3 items-end md:items-center">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="ค้นหาชื่อ-นามสกุล..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-1.5 md:py-2 rounded-xl border border-white/30 bg-black/20 backdrop-blur-md text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-pink-500 shadow-lg text-xs md:text-sm w-40 md:w-48 transition-all focus:w-48 md:focus:w-64"
          />
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70" />
        </div>

        {isTeacher && (
          <>
            <button 
              onClick={() => useBrainstormStore.getState().toggleBoardVisibility(!showPosts)}
              className={`flex items-center gap-1 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-bold shadow-lg transition-transform hover:scale-105 text-white ${showPosts ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-500 hover:bg-gray-600'}`}
              title={showPosts ? "คลิกเพื่อซ่อนคำตอบของนักเรียน" : "คลิกเพื่อแสดงคำตอบทั้งหมด"}
            >
              {showPosts ? <Eye size={16} className="md:w-[18px]" /> : <EyeOff size={16} className="md:w-[18px]" />} 
              <span className="hidden md:inline">{showPosts ? "แสดงอยู่" : "ซ่อนอยู่"}</span>
            </button>
            <button 
              onClick={() => useBrainstormStore.getState().toggleBoardStatus(isClosed ? 'active' : 'closed')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold shadow-lg transition-transform hover:scale-105 text-white ${isClosed ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
            >
              {isClosed ? '🔓 เปิดรับคำตอบ' : '🔒 ปิดรับคำตอบ'}
            </button>
          </>
        )}
        <button 
          onClick={() => fetchSummary(board.board_id)}
          disabled={isSummarizing}
          className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 text-white px-4 py-2 rounded-xl font-bold shadow-lg transition-transform hover:scale-105 disabled:opacity-70 disabled:hover:scale-100"
        >
          {isSummarizing ? (
            <><Loader2 size={20} className="animate-spin" /> กำลังสรุป...</>
          ) : (
            <><Sparkles size={20} /> AI Summary</>
          )}
        </button>
      </div>

      {/* Summary Modal */}
      {summary && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => useBrainstormStore.setState({ summary: null })}>
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => useBrainstormStore.setState({ summary: null })} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 font-bold text-xl">&times;</button>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-purple-700"><Sparkles className="text-yellow-500" /> AI Summary</h2>
            <div className="prose prose-lg text-gray-700">
              {summary.split('\n').map((line, i) => <p key={i}>{line}</p>)}
            </div>
          </div>
        </div>
      )}

      {/* Large Card View Modal */}
      {selectedCard && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md" onClick={() => setSelectedCard(null)}>
          <div 
            className="rounded-3xl p-8 max-w-3xl w-full mx-4 shadow-2xl relative" 
            style={{ backgroundColor: selectedCard.color || '#fff' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setSelectedCard(null)} className="absolute top-4 right-6 text-gray-700 hover:text-black font-bold text-3xl">&times;</button>
            
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sm font-bold bg-white/50 px-3 py-1 rounded-full text-gray-800">
                {selectedCard.author_name || (selectedCard.author_id ? `User ${selectedCard.author_id}` : 'Anonymous')}
              </span>
            </div>

            <div className="text-gray-900 font-medium whitespace-pre-wrap break-words text-3xl leading-relaxed">
              {selectedCard.content}
            </div>

            {selectedCard.media_url && (
              <img src={selectedCard.media_url} alt="card media" className="w-full rounded-xl mt-6 pointer-events-none" />
            )}
          </div>
        </div>
      )}

      {/* Answer Form Modal */}
      {showAnswerModal && board.questions && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto flex flex-col">
            <button onClick={() => setShowAnswerModal(false)} className="absolute top-4 right-6 text-gray-400 hover:text-gray-800 font-bold text-2xl">&times;</button>
            <h2 className="text-2xl font-bold mb-6 text-purple-700">✍️ ส่งคำตอบ (Answer Questions)</h2>
            
            <form onSubmit={handleAddCardToQuestion} className="flex-1 flex flex-col space-y-6">
              {board.questions.map((q, idx) => (
                <div key={q.question_id} className="flex flex-col gap-2">
                  <label className="font-bold text-gray-800 text-lg bg-purple-50 px-4 py-2 rounded-xl border border-purple-100 flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <span className="text-purple-600 mr-2">Q{idx + 1}:</span>{q.content}
                    </div>
                    <div className="flex gap-2 bg-white px-3 py-1 rounded-full border border-purple-100 shadow-sm">
                      {['💡', '✨', '🔥', '🤔', '👍', '📌', '🎉'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setAnswers(prev => ({...prev, [q.question_id]: (prev[q.question_id] || '') + emoji}))}
                          className="hover:scale-125 transition-transform text-xl"
                          title={`เพิ่มอีโมจิ ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </label>
                  <textarea 
                    value={answers[q.question_id] || ''}
                    onChange={(e) => setAnswers(prev => ({...prev, [q.question_id]: e.target.value}))}
                    placeholder="พิมพ์คำตอบของคุณที่นี่..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 outline-none focus:ring-2 focus:ring-purple-500 resize-none h-24 text-base"
                  />
                </div>
              ))}

              <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-4">
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    {colors.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelectedColor(c)}
                        className={`w-10 h-10 rounded-full shadow-inner border-4 transition-transform hover:scale-110 ${selectedColor === c ? 'border-pink-500 scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="cursor-pointer flex items-center gap-1 text-purple-600 hover:text-purple-800 bg-purple-50 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border border-purple-100">
                      <ImageIcon size={16} /> <span>แนบรูปภาพประกอบคำตอบ</span>
                      <input 
                        type="file" 
                        accept="image/png, image/jpeg" 
                        className="hidden" 
                        onChange={handleImageChange} 
                      />
                    </label>
                    {imagePreview && (
                      <div className="relative inline-block">
                        <img src={imagePreview} alt="Preview" className="h-12 object-contain rounded-lg border shadow-sm" />
                        <button 
                          type="button" 
                          onClick={() => { setSelectedImage(null); setImagePreview(null); }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition-transform"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={!board.questions.some(q => (answers[q.question_id] || '').trim().length > 0) && !selectedImage || isSubmitting}
                  className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white px-8 py-3 rounded-full font-bold shadow-lg disabled:opacity-50 flex items-center gap-2 transition-transform hover:scale-105"
                >
                  {isSubmitting ? (
                    <><Loader2 size={20} className="animate-spin" /> กำลังส่ง...</>
                  ) : (
                    <>Post Answer <Send size={20} /></>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Card Area (Auto Flex Layout) */}
      <div 
        className="absolute inset-0 pt-28 pb-40 px-4 md:px-12 overflow-y-auto custom-scrollbar z-40 transition-transform duration-200"
      >
        <div 
          className="flex flex-wrap gap-6 items-start justify-center mx-auto"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
          {visibleCards.map(card => (
            <Card 
              key={card.card_id} 
              card={card} 
              isFocused={focusStudentId !== null ? card.author_id === focusStudentId : false}
              isDimmed={focusStudentId !== null ? card.author_id !== focusStudentId : false}
            />
          ))}
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="absolute bottom-24 md:bottom-8 right-4 md:right-8 z-50 flex items-center gap-1 md:gap-2 bg-white/20 backdrop-blur-md p-1.5 md:p-2 rounded-2xl shadow-lg border border-white/30">
        <button 
          onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
          className="p-1.5 md:p-2 bg-white/50 hover:bg-white text-purple-900 rounded-xl transition-colors"
          title="Zoom Out"
        >
          <ZoomOut size={18} className="md:w-5 md:h-5" />
        </button>
        <button 
          onClick={() => setZoom(1)}
          className="px-2 md:px-3 py-1.5 md:py-2 bg-white/50 hover:bg-white text-purple-900 rounded-xl transition-colors text-xs md:text-base font-bold min-w-[60px] md:min-w-[70px]"
          title="Reset Zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button 
          onClick={() => setZoom(z => Math.min(3, z + 0.25))}
          className="p-1.5 md:p-2 bg-white/50 hover:bg-white text-purple-900 rounded-xl transition-colors"
          title="Zoom In"
        >
          <ZoomIn size={18} className="md:w-5 md:h-5" />
        </button>
      </div>

      {/* Add Idea Dock / Answer Button */}
      {isClosed && !isTeacher ? (
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[90%] md:w-auto">
          <div className="bg-red-500/90 backdrop-blur-md px-8 py-3 rounded-full shadow-lg border border-red-400 text-white font-bold flex items-center gap-2">
            🔒 ด่านนี้ปิดรับคำตอบแล้ว
          </div>
        </div>
      ) : hasPosted && !isTeacher ? (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-white/90 backdrop-blur-md px-8 py-3 rounded-full shadow-lg border border-green-200 text-green-600 font-bold flex items-center gap-2">
            ✅ คุณได้ส่งคำตอบแล้ว
          </div>
        </div>
      ) : !hasQuestions ? (
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[90%] md:w-auto">
          <div className="bg-white/20 backdrop-blur-xl p-2 md:p-3 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/30 flex gap-2 md:gap-4 items-center">
            {/* Color Picker */}
            <div className="flex gap-1 md:gap-2 px-2 md:px-4">
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-6 h-6 md:w-10 md:h-10 rounded-full shadow-inner border-4 transition-transform hover:scale-110 ${selectedColor === c ? 'border-pink-500 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <form onSubmit={handleAddCard} className="flex gap-2 w-full items-end">
              <div className="flex-1 flex flex-col gap-2">
                {imagePreview && (
                  <div className="relative inline-block w-fit">
                    <img src={imagePreview} alt="Preview" className="h-24 object-contain rounded-lg border border-purple-200 shadow-sm" />
                    <button 
                      type="button" 
                      onClick={() => { setSelectedImage(null); setImagePreview(null); }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition-transform"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                    placeholder="พิมพ์ไอเดียของคุณที่นี่..."
                    className="bg-white/90 text-gray-800 pl-4 pr-12 md:pl-6 md:pr-14 py-2 md:py-3 rounded-full outline-none focus:ring-4 focus:ring-pink-500/50 w-48 md:w-80 shadow-inner font-medium text-sm md:text-base transition-all"
                    maxLength={100}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute right-2 md:right-3 p-1.5 md:p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-100 rounded-full transition-colors"
                    title="แนบรูปภาพ"
                  >
                    <ImageIcon size={20} />
                  </button>
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleImageChange} 
                  />
                </div>
              </div>
              <button 
                type="submit"
                disabled={(!newText.trim() && !selectedImage) || isSubmitting}
                className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white p-2 md:px-6 md:py-3 rounded-full font-bold shadow-lg disabled:opacity-50 transition-transform hover:scale-105 flex items-center justify-center mb-[2px]"
              >
                {isSubmitting ? (
                  <Loader2 size={18} className="animate-spin md:mr-2 md:w-5 md:h-5" />
                ) : (
                  <>
                    <span className="hidden md:inline mr-2">Post</span>
                    <Send size={18} className="md:w-5 md:h-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
          <button 
            onClick={() => setShowAnswerModal(true)}
            className="bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 text-white px-10 py-4 rounded-full font-bold shadow-2xl flex items-center gap-3 transition-transform hover:scale-105 text-lg"
          >
            ✍️ ส่งคำตอบ (Answer Questions)
          </button>
        </div>
      )}
    </div>
  );
};
