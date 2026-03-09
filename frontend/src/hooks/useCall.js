import { useEffect, useCallback, useRef } from 'react';
import { useCallStore, useAuthStore, useNotificationStore } from '../store';
import webRTCService from '../services/webrtc';
import signalingService from '../services/signaling';
import { callsAPI } from '../services/api';

export function useCall() {
  const {
    callId, callState, callType, remoteUser, isInitiator,
    isMicMuted, isCameraOff,
    startCall, setCallState, setCallActive,
    setLocalStream, setRemoteStream,
    toggleMic, toggleCamera, endCall,
    incomingCall, setIncomingCall,
  } = useCallStore();

  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const callStartTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);

  // ─── Setup WebRTC callbacks ────────────────────────────────────────────────
  const setupWebRTC = useCallback((currentCallId) => {
    webRTCService.onRemoteStream = (stream) => {
      setRemoteStream(stream);
    };

    webRTCService.onIceCandidate = (candidate) => {
      signalingService.sendIceCandidate(currentCallId, candidate);
    };

    webRTCService.onConnectionStateChange = (state) => {
      console.log('[Call] Connection state:', state);
      if (state === 'connected') {
        setCallActive();
        callStartTimeRef.current = Date.now();
        durationIntervalRef.current = setInterval(() => {
          useCallStore.getState().updateDuration();
        }, 1000);
      } else if (['failed', 'disconnected'].includes(state)) {
        addNotification({ type: 'error', message: 'Call connection lost' });
        handleEndCall();
      }
    };
  }, []);

  // ─── Initiate call ─────────────────────────────────────────────────────────
  const initiateCall = useCallback(async (contactUser, type = 'video') => {
    try {
      const stream = await webRTCService.getLocalStream(type);
      setLocalStream(stream);

      startCall(null, type, contactUser, true);
      webRTCService.createPeerConnection();
      webRTCService.addLocalTracks();

      signalingService.initiateCall(contactUser.id, type);
    } catch (err) {
      addNotification({ type: 'error', message: err.message });
      webRTCService.cleanup();
      useCallStore.getState().endCall();
    }
  }, []);

  // ─── Accept incoming call ──────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    const incoming = incomingCall;
    if (!incoming) return;

    try {
      const stream = await webRTCService.getLocalStream(incoming.callType);
      setLocalStream(stream);

      webRTCService.createPeerConnection();
      webRTCService.addLocalTracks();
      setupWebRTC(incoming.callId);

      signalingService.acceptCall(incoming.callId);
      startCall(incoming.callId, incoming.callType, incoming.caller, false);
      setCallState('connecting');
    } catch (err) {
      addNotification({ type: 'error', message: err.message });
      rejectCall();
    }
  }, [incomingCall]);

  // ─── Reject incoming call ──────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (incomingCall) {
      signalingService.rejectCall(incomingCall.callId);
      setIncomingCall(null);
    }
  }, [incomingCall]);

  // ─── End active call ───────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    const currentCallId = useCallStore.getState().callId;
    const currentCallType = useCallStore.getState().callType;
    const currentRemoteUser = useCallStore.getState().remoteUser;

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }

    if (currentCallId) {
      signalingService.endCall(currentCallId);

      // Record call metadata
      if (callStartTimeRef.current) {
        const duration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        try {
          await callsAPI.recordCall({
            calleeId: currentRemoteUser?.id,
            callType: currentCallType,
            status: 'completed',
            startedAt: new Date(callStartTimeRef.current).toISOString(),
            endedAt: new Date().toISOString(),
            durationSeconds: duration,
          });
        } catch (e) {
          console.error('Failed to record call:', e);
        }
      } else if (isInitiator) {
        // If the call was never started (null start time) and I am caller, log as missed!
        try {
          await callsAPI.recordCall({
            calleeId: currentRemoteUser?.id,
            callType: currentCallType,
            status: 'missed',
            startedAt: new Date().toISOString()
          });
        } catch (e) {
          console.error('Failed to record missed call:', e);
        }
      }
    }

    callStartTimeRef.current = null;
    webRTCService.cleanup();
    endCall();
  }, []);

  // ─── Toggle mic ────────────────────────────────────────────────────────────
  const handleToggleMic = useCallback(() => {
    const nextMuted = !isMicMuted;
    webRTCService.setMicrophoneMuted(nextMuted);
    toggleMic();
  }, [isMicMuted]);

  // ─── Toggle camera ─────────────────────────────────────────────────────────
  const handleToggleCamera = useCallback(() => {
    const nextDisabled = !isCameraOff;
    webRTCService.setCameraEnabled(!nextDisabled);
    toggleCamera();
  }, [isCameraOff]);

  // ─── Register signaling event handlers ────────────────────────────────────
  useEffect(() => {
    // Call was accepted by callee
    signalingService.on('call:accepted', async ({ callId: acceptedCallId, calleeId }) => {
      console.log('[Call] Call accepted:', acceptedCallId);
      setupWebRTC(acceptedCallId);
      useCallStore.setState({ callId: acceptedCallId, callState: 'connecting' });

      try {
        const offer = await webRTCService.createOffer();
        signalingService.sendOffer(acceptedCallId, offer);
      } catch (err) {
        addNotification({ type: 'error', message: 'Failed to create offer' });
        handleEndCall();
      }
    });

    // Incoming SDP offer (callee receives)
    signalingService.on('webrtc:offer', async ({ callId: offerCallId, sdp }) => {
      try {
        const answer = await webRTCService.handleOffer(sdp);
        signalingService.sendAnswer(offerCallId, answer);
      } catch (err) {
        console.error('[Call] Handle offer error:', err);
        addNotification({ type: 'error', message: 'Failed to process call offer' });
        handleEndCall();
      }
    });

    // SDP answer received (caller receives)
    signalingService.on('webrtc:answer', async ({ callId: answerCallId, sdp }) => {
      try {
        await webRTCService.handleAnswer(sdp);
      } catch (err) {
        console.error('[Call] Handle answer error:', err);
        addNotification({ type: 'error', message: 'Failed to process call answer' });
        handleEndCall();
      }
    });

    // ICE candidate received
    signalingService.on('webrtc:ice-candidate', async ({ candidate }) => {
      await webRTCService.handleIceCandidate(candidate);
    });

    // Call ringing
    signalingService.on('call:ringing', ({ callId: ringingCallId }) => {
      useCallStore.setState({ callId: ringingCallId });
    });

    // Incoming call
    signalingService.on('call:incoming', ({ callId: incomingCallId, callerId, callType: type }) => {
      setIncomingCall({ callId: incomingCallId, callerId, callType: type, caller: { id: callerId } });
      addNotification({ type: 'call', message: `Incoming ${type} call` });
    });

    // Call rejected
    signalingService.on('call:rejected', ({ callId: rejectedCallId }) => {
      addNotification({ type: 'info', message: 'Call was rejected' });
      handleEndCall();
    });

    // Call ended by remote
    signalingService.on('call:ended', ({ callId: endedCallId, reason }) => {
      addNotification({
        type: 'info',
        message: reason === 'peer_disconnected'
          ? 'Call ended: peer disconnected'
          : 'Call ended'
      });
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      webRTCService.cleanup();
      endCall();
    });

    // Call missed
    signalingService.on('call:missed', () => {
      addNotification({ type: 'warning', message: 'Call was not answered' });
      handleEndCall();
    });

    // User busy
    signalingService.on('call:error', ({ message, code }) => {
      addNotification({ type: 'error', message });
      if (code !== 'ALREADY_IN_CALL') {
        webRTCService.cleanup();
        endCall();
      }
    });

    return () => {
      ['call:accepted', 'call:ringing', 'call:incoming', 'call:rejected',
        'call:ended', 'call:missed', 'call:error',
        'webrtc:offer', 'webrtc:answer', 'webrtc:ice-candidate'].forEach(event => {
          signalingService.off(event);
        });
    };
  }, []);

  return {
    callState,
    callType,
    callId,
    remoteUser,
    isInitiator,
    isMicMuted,
    isCameraOff,
    incomingCall,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall: handleEndCall,
    toggleMic: handleToggleMic,
    toggleCamera: handleToggleCamera,
  };
}
