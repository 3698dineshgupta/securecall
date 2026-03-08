import { create } from 'zustand';

// ─── Auth Store ───────────────────────────────────────────────────────────────
export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));

// ─── Call Store ───────────────────────────────────────────────────────────────
export const useCallStore = create((set, get) => ({
  // Current call state
  callId: null,
  callState: 'idle', // idle | ringing | incoming | connecting | active | ended
  callType: null,    // audio | video
  remoteUser: null,
  isInitiator: false,

  // Media state
  isMicMuted: false,
  isCameraOff: false,
  localStream: null,
  remoteStream: null,

  // Call timer
  callStartTime: null,
  callDuration: 0,

  // Incoming call
  incomingCall: null,

  // Actions
  setCallState: (callState) => set({ callState }),

  setIncomingCall: (incomingCall) => set({ incomingCall }),

  startCall: (callId, callType, remoteUser, isInitiator) => set({
    callId,
    callType,
    remoteUser,
    isInitiator,
    callState: isInitiator ? 'ringing' : 'incoming',
    isMicMuted: false,
    isCameraOff: false,
  }),

  setCallActive: () => set({
    callState: 'active',
    callStartTime: Date.now(),
    incomingCall: null,
  }),

  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),

  toggleMic: () => set(state => ({ isMicMuted: !state.isMicMuted })),
  toggleCamera: () => set(state => ({ isCameraOff: !state.isCameraOff })),

  updateDuration: () => {
    const { callStartTime } = get();
    if (callStartTime) {
      set({ callDuration: Math.floor((Date.now() - callStartTime) / 1000) });
    }
  },

  endCall: () => set({
    callId: null,
    callState: 'idle',
    callType: null,
    remoteUser: null,
    isInitiator: false,
    isMicMuted: false,
    isCameraOff: false,
    localStream: null,
    remoteStream: null,
    callStartTime: null,
    callDuration: 0,
    incomingCall: null,
  }),
}));

// ─── Contacts Store ───────────────────────────────────────────────────────────
export const useContactsStore = create((set) => ({
  contacts: [],
  onlineUsers: new Set(),
  isLoading: false,
  error: null,

  setContacts: (contacts) => set({ contacts }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  setUserOnline: (userId, isOnline) => set(state => {
    const onlineUsers = new Set(state.onlineUsers);
    if (isOnline) onlineUsers.add(userId);
    else onlineUsers.delete(userId);
    return { onlineUsers };
  }),

  setOnlineUsers: (userIds) => set({
    onlineUsers: new Set(userIds)
  }),

  addContact: (contact) => set(state => ({
    contacts: [...state.contacts.filter(c => c.id !== contact.id), contact]
  })),

  removeContact: (contactId) => set(state => ({
    contacts: state.contacts.filter(c => c.id !== contactId)
  })),
}));

// ─── Notifications Store ──────────────────────────────────────────────────────
export const useNotificationStore = create((set) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = Date.now().toString();
    set(state => ({
      notifications: [...state.notifications, { ...notification, id }]
    }));
    // Auto-remove after 5 seconds
    setTimeout(() => {
      set(state => ({
        notifications: state.notifications.filter(n => n.id !== id)
      }));
    }, 5000);
  },

  removeNotification: (id) => set(state => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),
}));
