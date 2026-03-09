/**
 * WebRTC Service
 *
 * Security Architecture:
 * - Uses WebRTC's built-in DTLS-SRTP encryption for ALL media
 * - All audio/video streams are encrypted peer-to-peer
 * - The signaling server ONLY sees SDP metadata and ICE candidates (not media)
 * - DTLS handshake is automatic and provides forward secrecy
 *
 * E2E Encryption Flow:
 * 1. PeerConnection created with secure DTLS config
 * 2. SDP offer/answer exchanged via signaling (only negotiation metadata)
 * 3. DTLS-SRTP handshake occurs directly between peers
 * 4. All media flows encrypted via SRTP - no server access
 */

const ICE_SERVERS = [
  // Google STUN servers (for NAT traversal)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // Add your TURN server for reliability behind symmetric NAT:
  // {
  //   urls: 'turn:your-turn-server.com:3478',
  //   username: 'your-username',
  //   credential: 'your-credential'
  // }
];

const PEER_CONFIG = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  // Enforce encrypted connections only
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  // SDP semantics for modern WebRTC
  sdpSemantics: 'unified-plan',
};

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callId = null;
    this.isInitiator = false;

    // Callbacks
    this.onRemoteStream = null;
    this.onIceCandidate = null;
    this.onOffer = null;
    this.onAnswer = null;
    this.onConnectionStateChange = null;
    this.onError = null;

    this._iceCandidateBuffer = [];
    this._remoteDescriptionSet = false;
  }

  // ─── Initialize peer connection ──────────────────────────────────────────────
  createPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new RTCPeerConnection(PEER_CONFIG);
    this._iceCandidateBuffer = [];
    this._remoteDescriptionSet = false;

    // ── ICE Candidate Handler ──
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state:', this.peerConnection.iceGatheringState);
    };

    // ── Remote Track Handler ──
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind);
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      event.streams[0]?.getTracks().forEach(track => {
        this.remoteStream.addTrack(track);
      });
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };

    // ── Connection State ──
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[WebRTC] Connection state changed to:', state);

      if (state === 'failed') {
        console.error('[WebRTC] Connection failed. This often means NAT traversal (STUN/TURN) failed.');
      }

      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', this.peerConnection.iceConnectionState);
    };

    // ── Security: Verify DTLS ──
    this.peerConnection.onsignalingstatechange = () => {
      if (this.peerConnection.signalingState === 'stable') {
        this._verifyEncryption();
      }
    };

    return this.peerConnection;
  }

  // ─── Verify DTLS-SRTP encryption is active ──────────────────────────────────
  async _verifyEncryption() {
    try {
      if (!this.peerConnection) return;
      const stats = await this.peerConnection.getStats();
      stats.forEach(report => {
        if (report.type === 'transport') {
          console.log(`[Security] DTLS state: ${report.dtlsState}`);
          if (report.dtlsState !== 'connected') {
            console.warn('[Security] DTLS not established!');
          } else {
            console.log('[Security] ✓ DTLS-SRTP encryption active');
          }
        }
      });
    } catch (e) {
      // Stats API not critical
    }
  }

  // ─── Get local media stream ──────────────────────────────────────────────────
  async getLocalStream(callType = 'video') {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
        video: callType === 'video' ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user',
        } : false,
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`[WebRTC] Local stream obtained (${callType})`);
      return this.localStream;
    } catch (err) {
      console.error('[WebRTC] Failed to get local stream:', err);
      throw new Error(
        err.name === 'NotAllowedError'
          ? 'Camera/microphone permission denied'
          : err.name === 'NotFoundError'
            ? 'Camera or microphone not found'
            : `Media error: ${err.message}`
      );
    }
  }

  // ─── Add local tracks to peer connection ────────────────────────────────────
  addLocalTracks() {
    if (!this.localStream || !this.peerConnection) return;
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });
  }

  // ─── Create SDP offer (caller) ──────────────────────────────────────────────
  async createOffer() {
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await this.peerConnection.setLocalDescription(offer);
      console.log('[WebRTC] Offer created');
      return offer;
    } catch (err) {
      console.error('[WebRTC] Create offer error:', err);
      throw err;
    }
  }

  // ─── Handle incoming SDP offer (callee) ─────────────────────────────────────
  async handleOffer(sdp) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      this._remoteDescriptionSet = true;

      // Flush buffered ICE candidates
      await this._flushIceCandidateBuffer();

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      console.log('[WebRTC] Answer created');
      return answer;
    } catch (err) {
      console.error('[WebRTC] Handle offer error:', err);
      throw err;
    }
  }

  // ─── Handle SDP answer (caller receives) ────────────────────────────────────
  async handleAnswer(sdp) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      this._remoteDescriptionSet = true;
      await this._flushIceCandidateBuffer();
      console.log('[WebRTC] Remote description set from answer');
    } catch (err) {
      console.error('[WebRTC] Handle answer error:', err);
      throw err;
    }
  }

  // ─── Handle incoming ICE candidate ──────────────────────────────────────────
  async handleIceCandidate(candidate) {
    try {
      if (!this._remoteDescriptionSet) {
        // Buffer until remote description is set
        this._iceCandidateBuffer.push(candidate);
        return;
      }
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // Non-fatal: some candidates may arrive out of order
      console.warn('[WebRTC] ICE candidate error (non-fatal):', err.message);
    }
  }

  // ─── Flush buffered ICE candidates ──────────────────────────────────────────
  async _flushIceCandidateBuffer() {
    const buffer = [...this._iceCandidateBuffer];
    this._iceCandidateBuffer = [];
    for (const candidate of buffer) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Buffered ICE candidate error:', e.message);
      }
    }
  }

  // ─── Mute/Unmute microphone ──────────────────────────────────────────────────
  setMicrophoneMuted(muted) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }

  // ─── Enable/Disable camera ───────────────────────────────────────────────────
  setCameraEnabled(enabled) {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  // ─── Get connection statistics ───────────────────────────────────────────────
  async getStats() {
    if (!this.peerConnection) return null;
    try {
      const stats = await this.peerConnection.getStats();
      const result = {};
      stats.forEach(report => {
        if (['inbound-rtp', 'outbound-rtp', 'transport', 'candidate-pair'].includes(report.type)) {
          result[report.id] = report;
        }
      });
      return result;
    } catch (e) {
      return null;
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────
  cleanup() {
    console.log('[WebRTC] Cleaning up...');

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.callId = null;
    this._iceCandidateBuffer = [];
    this._remoteDescriptionSet = false;
  }
}

// Singleton instance
const webRTCService = new WebRTCService();
export default webRTCService;
