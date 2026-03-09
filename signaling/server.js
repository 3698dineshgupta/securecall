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
  maxHttpBufferSize: 1e4, // 10KB max
  pingTimeout: 30000,
  pingInterval: 25000,
});

// ─── USER PRESENCE & CALL MAPS ─────────────────────────────────────────────
const userSocketMap = {}; // mapping structure: { userId : Set(socketId, socketId) }
const activeCalls = new Map(); // callId -> { callerId, calleeId, type, status }

// ─── JWT Authentication Middleware ────────────────────────────────────────────
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.decodedUserId = decoded.userId;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(new Error('Token expired'));
    return next(new Error('Invalid token'));
  }
});

// ─── CONNECTION HANDLER ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on('register-user', (userId) => {
    console.log("User connected:", userId);
    console.log("Socket ID:", socket.id);

    // Safety check matching token to prevent impersonation
    if (socket.decodedUserId !== userId) {
      console.warn(`User ID mismatch. Token: ${socket.decodedUserId}, Requested: ${userId}`);
      return;
    }

    socket.userId = userId;

    if (!userSocketMap[userId]) {
      userSocketMap[userId] = new Set();
    }
    userSocketMap[userId].add(socket.id);

    // Join personal room to receive multi-device signaling
    socket.join(`user:${userId}`);

    // Broadcast presence to all other users
    io.emit('user:status', { userId, isOnline: true, lastSeen: new Date().toISOString() });

    // Sync existing online users to the newly registered socket
    const onlineUsers = Object.keys(userSocketMap).filter(id => userSocketMap[id].size > 0);
    socket.emit('users:online', { userIds: onlineUsers });
  });

  socket.on('request-online-users', () => {
    const onlineUsers = Object.keys(userSocketMap).filter(id => userSocketMap[id].size > 0);
    socket.emit('users:online', { userIds: onlineUsers });
  });

  // Helper function to emit events to all connected sockets of a user
  const emitToUser = (targetUserId, eventName, data) => {
    if (userSocketMap[targetUserId]) {
      userSocketMap[targetUserId].forEach(sockId => {
        io.to(sockId).emit(eventName, data);
      });
    }
  };

  // ─── CALL INITIATION ────────────────────────────────────────────────────────
  socket.on('call:initiate', ({ calleeId, callType }) => {
    try {
      const userId = socket.userId;
      console.log("Call request:", userId, "->", calleeId);

      if (!calleeId || !userId) return;

      if (calleeId === userId) {
        return socket.emit('call:error', { message: 'Cannot call yourself' });
      }

      // Note: We deliberately skip the `!isOnline` return-error block here.
      // This allows the WhatsApp-style offline calling experience.
      const isOnline = userSocketMap[calleeId] && userSocketMap[calleeId].size > 0;
      if (!isOnline) {
        console.log(`Call delivery info: User ${calleeId} is offline. Starting 30s ringing timeout.`);
      }

      const callerBusy = Array.from(activeCalls.values()).some(
        c => (c.callerId === userId || c.calleeId === userId) && c.status === 'active'
      );
      if (callerBusy) return socket.emit('call:error', { message: 'You are already in a call', code: 'ALREADY_IN_CALL' });

      const calleeBusy = Array.from(activeCalls.values()).some(
        c => (c.callerId === calleeId || c.calleeId === calleeId) && c.status === 'active'
      );
      if (calleeBusy) return socket.emit('call:error', { message: 'User is busy', code: 'USER_BUSY' });

      // Generate Call Metadata
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      activeCalls.set(callId, {
        callId,
        callerId: userId,
        calleeId,
        callType,
        status: 'ringing',
      });

      // Confirm to caller via single socket
      socket.emit('call:ringing', { callId, calleeId });

      console.log(`Call delivery targeting User=${calleeId}`);
      // Send call to all registered sockets of receiver
      userSocketMap[calleeId].forEach(sockId => {
        console.log(`Delivering [call:incoming] to receiver socket ${sockId}`);
        io.to(sockId).emit('call:incoming', {
          callId,
          callerId: userId,
          callType,
        });
      });

      // Auto-reject after 30 seconds if not answered
      setTimeout(() => {
        const call = activeCalls.get(callId);
        if (call && call.status === 'ringing') {
          activeCalls.delete(callId);
          emitToUser(call.callerId, 'call:missed', { callId });
          emitToUser(call.calleeId, 'call:missed', { callId });
          console.log(`[CALL] Missed (timeout): ${callId}`);
        }
      }, 30000);

    } catch (err) {
      console.error('[CALL] Initiate error:', err);
      socket.emit('call:error', { message: 'Failed to initiate call' });
    }
  });

  socket.on('call:accept', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call || call.calleeId !== socket.userId) return;

    call.status = 'active';
    emitToUser(call.callerId, 'call:accepted', { callId, calleeId: socket.userId });
    socket.emit('call:accepted', { callId, callerId: call.callerId });
  });

  socket.on('call:reject', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;

    activeCalls.delete(callId);
    emitToUser(call.callerId, 'call:rejected', { callId });
    emitToUser(call.calleeId, 'call:rejected', { callId });
  });

  socket.on('call:end', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;

    activeCalls.delete(callId);
    emitToUser(call.callerId, 'call:ended', { callId, endedBy: socket.userId });
    emitToUser(call.calleeId, 'call:ended', { callId, endedBy: socket.userId });
  });

  // ─── WEBRTC SIGNALING (SDP + ICE) ───────────────────────────────────────────
  socket.on('webrtc:offer', ({ callId, sdp }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    const targetId = call.callerId === socket.userId ? call.calleeId : call.callerId;
    emitToUser(targetId, 'webrtc:offer', { callId, sdp });
  });

  socket.on('webrtc:answer', ({ callId, sdp }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    const targetId = call.callerId === socket.userId ? call.calleeId : call.callerId;
    emitToUser(targetId, 'webrtc:answer', { callId, sdp });
  });

  socket.on('webrtc:ice-candidate', ({ callId, candidate }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    const targetId = call.callerId === socket.userId ? call.calleeId : call.callerId;
    emitToUser(targetId, 'webrtc:ice-candidate', { callId, candidate });
  });

  // ─── PRESENCE LOGIC & DISCONNECT ───────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    const userId = socket.userId;
    console.log(`Socket disconnected: ${socket.id} (User: ${userId || 'unregistered'}, Reason: ${reason})`);

    if (userId && userSocketMap[userId]) {
      userSocketMap[userId].delete(socket.id);

      if (userSocketMap[userId].size === 0) {
        delete userSocketMap[userId];
        io.emit('user:status', { userId, isOnline: false });

        // Clean up any calls this user was in
        for (const [callId, call] of activeCalls.entries()) {
          if (call.status === 'active' || call.status === 'ringing') {
            if (call.callerId === userId || call.calleeId === userId) {
              activeCalls.delete(callId);
              const otherId = call.callerId === userId ? call.calleeId : call.callerId;
              emitToUser(otherId, 'call:ended', { callId, reason: 'peer_disconnected' });
            }
          }
        }
      }
    }
  });

  socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));
});

// ─── Start Server ─────────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ SecureCall Signaling Server running on port ${PORT}`);
  console.log('  Security: JWT authenticated WebSocket connections');
});

process.on('SIGTERM', () => {
  console.log('Shutting down signaling server...');
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
});

module.exports = { io, httpServer };
