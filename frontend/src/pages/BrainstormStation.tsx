import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { BrainstormBoard } from '../components/Brainstorm/BrainstormBoard';
import { useAuthStore } from '../store/useAuthStore';
import { Plus, Trash2, LayoutGrid, CalendarDays } from 'lucide-react';

interface MyBoard {
  board_id: number;
  title: string;
  status: string;
  created_at: string;
}

export const BrainstormStation: React.FC = () => {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const user = useAuthStore(state => state.user);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [boardTitle, setBoardTitle] = useState('New Brainstorm Session');
  const [questions, setQuestions] = useState<string[]>(['']);
  
  const [myBoards, setMyBoards] = useState<MyBoard[]>([]);

  useEffect(() => {
    if (user?.role === 'teacher' && user?.user_id && !boardId) {
      fetchMyBoards();
    }
  }, [user, boardId]);

  const fetchMyBoards = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/brainstorm/boards?user_id=${user?.user_id}`);
      const data = await res.json();
      if (data.boards) {
        setMyBoards(data.boards);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBoard = (id: number, title: string) => {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you really want to delete "${title}"? This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/brainstorm/boards/${id}`, {
            method: 'DELETE'
          });
          fetchMyBoards();
          Swal.fire('Deleted!', 'The board has been deleted.', 'success');
        } catch (e) {
          console.error(e);
        }
      }
    });
  };

  // If no boardId is provided, show the join/create screen
  if (!boardId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-800 to-pink-900 flex items-center justify-center p-4">
        <div className={`bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl ${user?.role === 'teacher' ? 'max-w-4xl' : 'max-w-md'} w-full flex flex-col md:flex-row gap-8`}>
          
          {/* Left Side: Join / Create */}
          <div className="flex-1 flex flex-col items-center text-center">
            <div className="text-6xl mb-6">🧠</div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">BrainStorm Station</h1>
            <p className="text-purple-200 mb-8 font-medium text-lg">Collaborate and share ideas in real-time!</p>
            
            <div className="space-y-4 w-full">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
              <h3 className="text-white font-bold mb-3">Join a Board</h3>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter Board ID" 
                  className="w-full bg-white/80 rounded-xl px-4 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-pink-500 font-bold text-center"
                />
                <button 
                  onClick={() => { if(joinCode) navigate(`/brainstorm/${joinCode}`) }}
                  className="bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 px-6 rounded-xl transition-colors"
                >
                  Join
                </button>
              </div>
            </div>

            {user?.role === 'teacher' && (
              <>
                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-white/20"></div>
                    <span className="flex-shrink-0 mx-4 text-white/50 text-sm">or</span>
                    <div className="flex-grow border-t border-white/20"></div>
                </div>

                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="w-full bg-white hover:bg-gray-50 text-purple-700 font-bold py-3 rounded-2xl shadow-lg transition-transform hover:scale-105"
                >
                  ✨ Create New Board
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Side: My Boards (Teacher Only) */}
        {user?.role === 'teacher' && (
          <div className="flex-1 border-t md:border-t-0 md:border-l border-white/20 pt-8 md:pt-0 md:pl-8 flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <LayoutGrid size={24} /> My Boards
            </h2>
            
            <div className="flex-1 overflow-y-auto max-h-[400px] space-y-3 custom-scrollbar pr-2">
              {myBoards.length === 0 ? (
                <div className="text-white/50 text-center mt-10">You haven't created any boards yet.</div>
              ) : (
                myBoards.map(b => (
                  <div key={b.board_id} className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors group relative">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-white leading-tight pr-8">{b.title}</h3>
                      <button 
                        onClick={() => handleDeleteBoard(b.board_id, b.title)}
                        className="text-white/30 hover:text-red-400 absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Board"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    
                    <div className="flex gap-4 text-xs text-white/60 mb-4">
                      <span className="flex items-center gap-1 font-mono">
                        🔑 ID: {b.board_id}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays size={14} /> 
                        {new Date(b.created_at).toLocaleDateString()}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wide ${b.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {b.status}
                      </span>
                    </div>

                    <button 
                      onClick={() => navigate(`/brainstorm/${b.board_id}`)}
                      className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl transition-colors text-sm"
                    >
                      Enter Board
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

        {/* Create Board Modal */}
        {showCreateModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="absolute top-4 right-6 text-gray-400 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
              <h2 className="text-2xl font-bold mb-6 text-purple-700">Create New BrainStorm Board</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-2">Board Title</label>
                  <input 
                    type="text"
                    value={boardTitle}
                    onChange={e => setBoardTitle(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter board title"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 font-bold mb-2 flex justify-between items-center">
                    Questions for Students
                    <button 
                      onClick={() => setQuestions([...questions, ''])}
                      className="text-pink-500 hover:text-pink-600 flex items-center gap-1 text-sm bg-pink-50 px-2 py-1 rounded-lg"
                    >
                      <Plus size={16} /> Add Question
                    </button>
                  </label>
                  
                  <div className="space-y-3">
                    {questions.map((q, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <span className="font-bold text-purple-300">Q{idx+1}</span>
                        <input 
                          type="text"
                          value={q}
                          onChange={e => {
                            const newQ = [...questions];
                            newQ[idx] = e.target.value;
                            setQuestions(newQ);
                          }}
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="e.g. What is the most important part of a flowchart?"
                        />
                        {questions.length > 1 && (
                          <button 
                            onClick={() => {
                              const newQ = [...questions];
                              newQ.splice(idx, 1);
                              setQuestions(newQ);
                            }}
                            className="text-red-400 hover:text-red-600 p-2"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/brainstorm/boards`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          title: boardTitle, 
                          user_id: user?.user_id || 1,
                          questions: questions.filter(q => q.trim() !== '')
                        })
                      });
                      const data = await res.json();
                      if (data.board_id) navigate(`/brainstorm/${data.board_id}`);
                      else throw new Error('No board ID returned');
                    } catch (e) {
                      console.error('Failed to create board', e);
                      Swal.fire({ icon: 'error', text: 'สร้างกระดานไม่สำเร็จ ระบบขัดข้อง' });
                    }
                  }}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white font-bold py-3 rounded-xl shadow-lg mt-4 transition-transform hover:scale-[1.02]"
                >
                  Confirm & Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <BrainstormBoard boardId={parseInt(boardId, 10)} />;
};
