import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './useAuthStore';

export const API_URL = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`;
const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || '';

export type CardType = 'text' | 'image' | 'drawing';

export interface ReactionCounts {
  [emoji: string]: number;
}

export interface CardData {
  card_id: number;
  board_id: number;
  card_type: CardType;
  content: string;
  media_url?: string;
  position_x: number;
  position_y: number;
  color?: string;
  is_pinned: boolean;
  author_id?: number | null;
  author_name?: string;
  author_avatar?: string | null;
  question_id?: number | null;
  reactions: Record<string, number>;
}

export interface QuestionData {
  question_id: number;
  content: string;
  order_index: number;
}

export interface BoardData {
  board_id: number;
  title: string;
  layout_type: string;
  is_anonymous: boolean;
  status: string;
  show_student_posts: boolean;
  questions?: QuestionData[];
  started_at?: string;
  is_completed?: boolean;
}

export interface CursorData {
  user_id: number;
  name: string;
  x: number;
  y: number;
}

interface BrainstormState {
  socket: Socket | null;
  isConnected: boolean;
  board: BoardData | null;
  cards: CardData[];
  cursors: Record<number, CursorData>;
  summary: string | null;
  isSummarizing: boolean;
  selectedCard: CardData | null;
  
  initSocket: (boardId: number, userId: number | null) => void;
  disconnectSocket: () => void;
  fetchBoard: (boardId: number) => Promise<number | void>;
  fetchBoardByMission: (missionId: number) => Promise<number | void>;
  
  addCard: (card: Partial<CardData>) => Promise<void>;
  uploadImage: (file: File) => Promise<string | null>;
  addCardToQuestion: (boardId: number, questionId: number, content: string, color: string, media_url?: string) => Promise<void>;
  updateCardPosition: (cardId: number, x: number, y: number) => void;
  saveCardPosition: (cardId: number, x: number, y: number) => Promise<void>;
  saveCardPositions: (boardId: number, positions: { card_id: number, position_x: number, position_y: number }[]) => Promise<void>;
  toggleReaction: (cardId: number, emoji: string) => Promise<void>;
  deleteCard: (cardId: number) => Promise<void>;
  
  emitCursorMove: (x: number, y: number, name: string) => void;
  fetchSummary: (boardId: number) => Promise<void>;
  toggleBoardStatus: (status: string) => Promise<void>;
  toggleBoardVisibility: (show: boolean) => Promise<void>;
  setSelectedCard: (card: CardData | null) => void;
}

export const useBrainstormStore = create<BrainstormState>((set, get) => ({
  socket: null,
  isConnected: false,
  board: null,
  cards: [],
  cursors: {},
  summary: null,
  isSummarizing: false,
  selectedCard: null,

  initSocket: (boardId: number, userId: number | null) => {
    const existingSocket = get().socket;
    if (existingSocket) {
      existingSocket.disconnect();
    }

    const socket = io(SOCKET_URL, { transports: ['polling'] });
    
    socket.on('connect', () => {
      set({ isConnected: true, socket });
      socket.emit('join_board', { board_id: boardId, user_id: userId });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('card_added', (card: CardData) => {
      set((state) => {
        if (state.cards.some(c => c.card_id === card.card_id)) return state;
        // Defense-in-depth: respect show_student_posts visibility on client side too.
        // The server already filters; this is a second line of defense.
        const currentUser = useAuthStore.getState().user;
        const isTeacher = currentUser?.role === 'teacher';
        const showPosts = state.board?.show_student_posts ?? true;
        if (!isTeacher && !showPosts && card.author_id !== currentUser?.user_id) {
          return state; // silently drop cards that shouldn't be visible
        }
        return { cards: [...state.cards, card] };
      });
    });

    socket.on('card_updated', (updatedData: Partial<CardData>) => {
      set((state) => ({
        cards: state.cards.map((c) => 
          c.card_id === updatedData.card_id ? { ...c, ...updatedData } : c
        )
      }));
    });

    socket.on('cards_moved', (data: { updates: { card_id: number, position_x: number, position_y: number }[] }) => {
      set((state) => {
        const updateMap = new Map(data.updates.map(u => [u.card_id, u]));
        return {
          cards: state.cards.map(c => {
            const update = updateMap.get(c.card_id);
            return update ? { ...c, position_x: update.position_x, position_y: update.position_y } : c;
          })
        };
      });
    });

    socket.on('card_deleted', (data: { card_id: number }) => {
      set((state) => ({
        cards: state.cards.filter((c) => c.card_id !== data.card_id)
      }));
    });

    socket.on('reaction_updated', (data: { card_id: number, emoji: string, action: string, user_id: number }) => {
      set((state) => {
        return {
          cards: state.cards.map(c => {
            if (c.card_id === data.card_id) {
              const newReactions = { ...c.reactions };
              if (data.action === 'added') {
                newReactions[data.emoji] = (newReactions[data.emoji] || 0) + 1;
              } else {
                newReactions[data.emoji] = Math.max(0, (newReactions[data.emoji] || 0) - 1);
              }
              return { ...c, reactions: newReactions };
            }
            return c;
          })
        };
      });
    });

    socket.on('cursor_moved', (data: CursorData) => {
      set((state) => ({
        cursors: { ...state.cursors, [data.user_id]: data }
      }));
    });
    
    socket.on('board_summarized', (data: { summary: string }) => {
      set({ summary: data.summary });
    });

    socket.on('board_updated', (data: { status?: string, show_student_posts?: boolean }) => {
      set((state) => {
        if (!state.board) return state;
        const newBoard = { ...state.board };
        if (data.status !== undefined) newBoard.status = data.status;
        if (data.show_student_posts !== undefined) newBoard.show_student_posts = data.show_student_posts;
        return { board: newBoard };
      });
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket, board } = get();
    if (socket) {
      if (board) {
        socket.emit('leave_board', { board_id: board.board_id });
      }
      socket.disconnect();
      set({ socket: null, isConnected: false, cursors: {} });
    }
  },

  fetchBoard: async (boardId: number) => {
    const token = useAuthStore.getState().token;
    try {
      const res = await fetch(`${API_URL}/brainstorm/boards/${boardId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Failed to load board');
      const data = await res.json();
      set({ board: data, cards: data.cards || [] });
      return data.board_id;
    } catch (e) {
      console.error(e);
    }
  },

  fetchBoardByMission: async (missionId: number) => {
    const token = useAuthStore.getState().token;
    try {
      const res = await fetch(`${API_URL}/brainstorm/mission/${missionId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Failed to load board');
      const data = await res.json();
      set({ board: data, cards: data.cards || [] });
      return data.board_id;
    } catch (e) {
      console.error(e);
    }
  },

  addCard: async (card) => {
    const { board } = get();
    const currentUserId = useAuthStore.getState().user?.user_id;
    if (!board) return;
    
    const token = useAuthStore.getState().token;
    try {
      await fetch(`${API_URL}/brainstorm/boards/${board.board_id}/cards`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...card, user_id: currentUserId })
      });
    } catch (e) {
      console.error(e);
    }
  },

  uploadImage: async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.url;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  },

  addCardToQuestion: async (boardId: number, questionId: number, content: string, color: string, media_url?: string) => {
    const token = useAuthStore.getState().token;
    try {
      await fetch(`${API_URL}/brainstorm/boards/${boardId}/cards`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: useAuthStore.getState().user?.user_id,
          question_id: questionId,
          card_type: 'text',
          content: content,
          color: color,
          media_url: media_url
        })
      });
    } catch (e) {
      console.error(e);
    }
  },

  updateCardPosition: (cardId, x, y) => {
    set((state) => ({
      cards: state.cards.map(c => c.card_id === cardId ? { ...c, position_x: x, position_y: y } : c)
    }));
  },

  saveCardPosition: async (cardId, x, y) => {
    try {
      await fetch(`${API_URL}/brainstorm/cards/${cardId}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_x: x, position_y: y })
      });
    } catch (e) {
      console.error(e);
    }
  },

  saveCardPositions: async (boardId, positions) => {
    try {
      await fetch(`${API_URL}/brainstorm/boards/${boardId}/cards/positions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions })
      });
    } catch (e) {
      console.error(e);
    }
  },

  toggleReaction: async (cardId, emoji) => {
    const currentUserId = useAuthStore.getState().user?.user_id;
    try {
      await fetch(`${API_URL}/brainstorm/cards/${cardId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, emoji })
      });
    } catch (e) {
      console.error(e);
    }
  },
  
  deleteCard: async (cardId) => {
    try {
      await fetch(`${API_URL}/brainstorm/cards/${cardId}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.error(e);
    }
  },

  emitCursorMove: (x, y, name) => {
    const { socket, board } = get();
    const currentUserId = useAuthStore.getState().user?.user_id;
    if (socket && board && currentUserId) {
      socket.emit('cursor_moved', {
        board_id: board.board_id,
        user_id: currentUserId,
        x, y, name
      });
    }
  },
  
  fetchSummary: async (boardId) => {
    set({ isSummarizing: true });
    try {
      const res = await fetch(`${API_URL}/brainstorm/boards/${boardId}/summarize`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.summary) {
        set({ summary: data.summary });
      }
    } catch (e) {
      console.error(e);
    } finally {
      set({ isSummarizing: false });
    }
  },

  toggleBoardStatus: async (status: string) => {
    const { board } = get();
    if (!board) return;
    try {
      await fetch(`${API_URL}/brainstorm/boards/${board.board_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    } catch (e) {
      console.error(e);
    }
  },

  toggleBoardVisibility: async (show: boolean) => {
    const { board } = get();
    if (!board) return;
    try {
      await fetch(`${API_URL}/brainstorm/boards/${board.board_id}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_student_posts: show })
      });
    } catch (e) {
      console.error(e);
    }
  },

  setSelectedCard: (card) => set({ selectedCard: card })
}));
