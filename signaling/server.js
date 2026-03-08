require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const PORT = process.env.SIGNALING_PORT || 3002;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_URL.split(','),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Security: limit message size
  maxHttpBufferSize: 1e4, // 10KB max
  pingTimeout: 30000,
  pingInterval: 25000,
});

// In-memory state (use Redis for horizontal scaling)
const connectedUsers = new Map(); // userId -> { socketId, username, isOnline }
const activeCalls = new Map();    // callId -> { callerId, calleeId, type, startedAt }

// ─── JWT Authentication Middleware ────────────────────────────────────────────
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    }
    next(new Error('Invalid token'));
  }
});

// ─── Helper Functions ─────────────────────────────────────────────────────────
const getUserSocket = (userId) => {
  const user = connectedUsers.get(userId);
  if (user) return io.sockets.sockets.get(user.socketId);
  return null;
};

const broadcastPresence = (userId, isOnline) => {
  // Notify all sockets that might care about this user's status
  io.emit('user:status', { userId, isOnline, lastSeen: new Date().toISOString() });
};

const generateCallId = () => {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// ─── Validate Call Permission ──────────────────────────────────────────────────
const validateCallParticipant = (callId, userId) => {
  const call = activeCalls.get(callId);
  if (!call) return false;
  return call.callerId === userId || call.calleeId === userId;
};

// ─── Connection Handler ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`[SIGNALING] User connected: ${userId} (socket: ${socket.id})`);

  // Register user
  connectedUsers.set(userId, {
    socketId: socket.id,
    userId,
    isOnline: true,
    connectedAt: new Date().toISOString(),
  });

  socket.join(`user:${userId}`);
  broadcastPresence(userId, true);

  // Send current online users to newly connected user
  const onlineUsers = Array.from(connectedUsers.keys());
  socket.emit('users:online', { userIds: onlineUsers });

  // ─── CALL INITIATION ────────────────────────────────────────────────────────

  // Caller initiates a call
  socket.on('call:initiate', ({ calleeId, callType }) => {
    try {
      if (!calleeId || !['audio', 'video'].includes(callType)) {
        return socket.emit('call:error', { message: 'Invalid call parameters' });
      }

      if (calleeId === userId) {
        return socket.emit('call:error', { message: 'Cannot call yourself' });
      }

      // Check if callee is online
      const calleeSocket = getUserSocket(calleeId);
      if (!calleeSocket) {
        return socket.emit('call:error', { message: 'User is offline', code: 'USER_OFFLINE' });
      }

      // Check if either party is already in a call
      const callerBusy = Array.from(activeCalls.values()).some(
        c => (c.callerId === userId || c.calleeId === userId) && c.status === 'active'
      );
      if (callerBusy) {
        return socket.emit('call:error', { message: 'You are already in a call', code: 'ALREADY_IN_CALL' });
      }

      const calleeBusy = Array.from(activeCalls.values()).some(
        c => (c.callerId === calleeId || c.calleeId === calleeId) && c.status === 'active'
      );
      if (calleeBusy) {
        return socket.emit('call:error', { message: 'User is busy', code: 'USER_BUSY' });
      }

      const callId = generateCallId();
      activeCalls.set(callId, {
        callId,
        callerId: userId,
        calleeId,
        callType,
        status: 'ringing',
        createdAt: new Date().toISOString(),
      });

      // Notify caller that call is ringing
      socket.emit('call:ringing', { callId, calleeId });

      // Notify callee of incoming call
      calleeSocket.emit('call:incoming', {
        callId,
        callerId: userId,
        callType,
      });

      console.log(`[CALL] Initiated: ${callId} | ${userId} -> ${calleeId} (${callType})`);

      // Auto-reject after 30 seconds if not answered
      setTimeout(() => {
        const call = activeCalls.get(callId);
        if (call && call.status === 'ringing') {
          activeCalls.delete(callId);
          socket.emit('call:missed', { callId });
          const cs = getUserSocket(calleeId);
          if (cs) cs.emit('call:missed', { callId });
          console.log(`[CALL] Missed (timeout): ${callId}`);
        }
      }, 30000);

    } catch (err) {
      console.error('[CALL] Initiate error:', err);
      socket.emit('call:error', { message: 'Failed to initiate call' });
    }
  });

  // Callee accepts the call
  socket.on('call:accept', ({ callId }) => {
    try {
      const call = activeCalls.get(callId);
      if (!call || call.calleeId !== userId) {
        return socket.emit('call:error', { message: 'Call not found', code: 'CALL_NOT_FOUND' });
      }

      if (call.status !== 'ringing') {
        return socket.emit('call:error', { message: 'Call is no longer available' });
      }

      call.status = 'active';
      call.startedAt = new Date().toISOString();
      activeCalls.set(callId, call);

      // Notify caller that call was accepted
      const callerSocket = getUserSocket(call.callerId);
      if (callerSocket) {
        callerSocket.emit('call:accepted', { callId, calleeId: userId });
      } else {
        // Caller disconnected
        activeCalls.delete(callId);
        return socket.emit('call:ended', { callId, reason: 'caller_disconnected' });
      }

      socket.emit('call:accepted', { callId, callerId: call.callerId });
      console.log(`[CALL] Accepted: ${callId}`);
    } catch (err) {
      console.error('[CALL] Accept error:', err);
    }
  });

  // Callee rejects the call
  socket.on('call:reject', ({ callId }) => {
    try {
      const call = activeCalls.get(callId);
      if (!call) return;

      if (call.calleeId !== userId && call.callerId !== userId) {
        return socket.emit('call:error', { message: 'Unauthorized' });
      }

      activeCalls.delete(callId);

      const callerSocket = getUserSocket(call.callerId);
      if (callerSocket) callerSocket.emit('call:rejected', { callId });

      const calleeSocket = getUserSocket(call.calleeId);
      if (calleeSocket) calleeSocket.emit('call:rejected', { callId });

      console.log(`[CALL] Rejected: ${callId} by ${userId}`);
    } catch (err) {
      console.error('[CALL] Reject error:', err);
    }
  });

  // Either party ends the call
  socket.on('call:end', ({ callId }) => {
    try {
      const call = activeCalls.get(callId);
      if (!call) return;

      if (!validateCallParticipant(callId, userId)) {
        return socket.emit('call:error', { message: 'Unauthorized' });
      }

      activeCalls.delete(callId);

      // Notify both parties
      const callerSocket = getUserSocket(call.callerId);
      const calleeSocket = getUserSocket(call.calleeId);

      if (callerSocket) callerSocket.emit('call:ended', { callId, endedBy: userId });
      if (calleeSocket) calleeSocket.emit('call:ended', { callId, endedBy: userId });

      console.log(`[CALL] Ended: ${callId} by ${userId}`);
    } catch (err) {
      console.error('[CALL] End error:', err);
    }
  });

  // ─── WEBRTC SIGNALING (SDP + ICE) ───────────────────────────────────────────
  // IMPORTANT: Server ONLY relays these messages - never reads/stores media content

  // Relay SDP offer from caller to callee
  socket.on('webrtc:offer', ({ callId, sdp }) => {
    try {
      if (!validateCallParticipant(callId, userId)) {
        return socket.emit('call:error', { message: 'Unauthorized' });
      }

      const call = activeCalls.get(callId);
      const targetId = call.callerId === userId ? call.calleeId : call.callerId;
      const targetSocket = getUserSocket(targetId);

      if (targetSocket) {
        // RELAY ONLY - server never inspects SDP content
        targetSocket.emit('webrtc:offer', { callId, sdp, fromUserId: userId });
      }
    } catch (err) {
      console.error('[WEBRTC] Offer relay error:', err);
    }
  });

  // Relay SDP answer from callee to caller
  socket.on('webrtc:answer', ({ callId, sdp }) => {
    try {
      if (!validateCallParticipant(callId, userId)) {
        return socket.emit('call:error', { message: 'Unauthorized' });
      }

      const call = activeCalls.get(callId);
      const targetId = call.callerId === userId ? call.calleeId : call.callerId;
      const targetSocket = getUserSocket(targetId);

      if (targetSocket) {
        // RELAY ONLY - server never inspects SDP content
        targetSocket.emit('webrtc:answer', { callId, sdp, fromUserId: userId });
      }
    } catch (err) {
      console.error('[WEBRTC] Answer relay error:', err);
    }
  });

  // Relay ICE candidates between peers
  socket.on('webrtc:ice-candidate', ({ callId, candidate }) => {
    try {
      if (!validateCallParticipant(callId, userId)) return;

      const call = activeCalls.get(callId);
      const targetId = call.callerId === userId ? call.calleeId : call.callerId;
      const targetSocket = getUserSocket(targetId);

      if (targetSocket) {
        // RELAY ONLY - server never inspects ICE content
        targetSocket.emit('webrtc:ice-candidate', { callId, candidate, fromUserId: userId });
      }
    } catch (err) {
      console.error('[WEBRTC] ICE relay error:', err);
    }
  });

  // ─── PRESENCE & DISCONNECT ───────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[SIGNALING] User disconnected: ${userId} (${reason})`);

    // End any active calls
    for (const [callId, call] of activeCalls.entries()) {
      if (call.callerId === userId || call.calleeId === userId) {
        activeCalls.delete(callId);
        const otherId = call.callerId === userId ? call.calleeId : call.callerId;
        const otherSocket = getUserSocket(otherId);
        if (otherSocket) {
          otherSocket.emit('call:ended', { callId, reason: 'peer_disconnected' });
        }
      }
    }

    connectedUsers.delete(userId);
    broadcastPresence(userId, false);
  });

  // Heartbeat
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ SecureCall Signaling Server running on port ${PORT}`);
  console.log(`  CORS origin: ${FRONTEND_URL}`);
  console.log('  Security: JWT authenticated WebSocket connections');
  console.log('  Privacy: Server only relays SDP/ICE - never accesses media');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down signaling server...');
  io.close(() => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
});

module.exports = { io, httpServer };
