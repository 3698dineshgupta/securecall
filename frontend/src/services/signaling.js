import { io } from 'socket.io-client';

const SIGNALING_URL = process.env.REACT_APP_SIGNALING_URL || 'http://localhost:3002';

class SignalingService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.eventHandlers = new Map();
  }

  connect(token) {
    if (this.socket?.connected) return;

    this.socket = io(SIGNALING_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('[Signaling] Connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log('[Signaling] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Signaling] Connection error:', err.message);
      if (['Authentication required', 'Token expired', 'Invalid token'].includes(err.message)) {
        // Dispatch local auth_error event so App.jsx can clear tokens and redirect
        const authHandler = this.eventHandlers.get('auth_error');
        if (authHandler) authHandler(err);
      }
    });

    // Re-register event handlers after reconnection
    this.socket.on('reconnect', () => {
      console.log('[Signaling] Reconnected');
      this.eventHandlers.forEach((handler, event) => {
        this.socket.on(event, handler);
      });
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  on(event, handler) {
    if (!this.socket) return;
    this.eventHandlers.set(event, handler);
    this.socket.on(event, handler);
  }

  off(event) {
    if (!this.socket) return;
    this.socket.off(event);
    this.eventHandlers.delete(event);
  }

  emit(event, data) {
    if (!this.socket?.connected) {
      console.warn('[Signaling] Cannot emit - not connected');
      return;
    }
    this.socket.emit(event, data);
  }

  // ── Call signaling ──
  initiateCall(calleeId, callType) {
    this.emit('call:initiate', { calleeId, callType });
  }

  acceptCall(callId) {
    this.emit('call:accept', { callId });
  }

  rejectCall(callId) {
    this.emit('call:reject', { callId });
  }

  endCall(callId) {
    this.emit('call:end', { callId });
  }

  // ── WebRTC signaling (relay only) ──
  sendOffer(callId, sdp) {
    this.emit('webrtc:offer', { callId, sdp });
  }

  sendAnswer(callId, sdp) {
    this.emit('webrtc:answer', { callId, sdp });
  }

  sendIceCandidate(callId, candidate) {
    this.emit('webrtc:ice-candidate', { callId, candidate });
  }
}

const signalingService = new SignalingService();
export default signalingService;
