import { useState, useEffect, useCallback, useRef } from 'react';
import { Player, RTCSignalData } from '../types';
import {
    requestMediaDevices,
    getLocalStream,
    stopLocalStream,
    setLocalAudioEnabled,
    setLocalVideoEnabled,
    createPeerConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    getRemoteStream,
    closePeerConnection,
    closeAllPeerConnections,
} from '../services/webrtc';
import {
    sendSignal,
    subscribeToSignals,
    updateMediaState,
} from '../services/firebase';

interface UseWebRTCProps {
    roomCode: string;
    playerId: string;
    players: Record<string, Player>;
    isEnabled: boolean;
}

interface UseWebRTCReturn {
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    isCameraOn: boolean;
    isMicOn: boolean;
    isInitialized: boolean;
    error: string | null;
    initializeMedia: () => Promise<void>;
    initializeWithStream: (stream: MediaStream) => Promise<void>;
    toggleCamera: () => void;
    toggleMic: () => void;
    cleanup: () => void;
}

/**
 * Custom hook for managing WebRTC connections in the game
 */
export function useWebRTC({
    roomCode,
    playerId,
    players,
    isEnabled,
}: UseWebRTCProps): UseWebRTCReturn {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pendingConnectionsRef = useRef<Set<string>>(new Set());
    const signalUnsubscribeRef = useRef<(() => void) | null>(null);

    // Initialize local media
    const initializeMedia = useCallback(async () => {
        if (isInitialized || !isEnabled) return;

        try {
            setError(null);
            const stream = await requestMediaDevices();
            setLocalStream(stream);
            setIsInitialized(true);

            // Update media state in Firebase
            await updateMediaState(roomCode, playerId, {
                isCameraOn: true,
                isMicOn: true,
            });
        } catch (err) {
            console.error('Failed to initialize media:', err);
            setError('Camera/microphone access denied or unavailable');
            setIsInitialized(true); // Still mark as initialized, just without stream
        }
    }, [roomCode, playerId, isEnabled, isInitialized]);

    // Initialize with an existing stream (bypasses guards for direct click handlers)
    const initializeWithStream = useCallback(async (stream: MediaStream) => {
        if (isInitialized) return;

        try {
            setError(null);
            setLocalStream(stream);
            setIsInitialized(true);

            // Update media state in Firebase
            if (roomCode && playerId) {
                await updateMediaState(roomCode, playerId, {
                    isCameraOn: true,
                    isMicOn: true,
                });
            }
            console.log('WebRTC initialized with existing stream');
        } catch (err) {
            console.error('Failed to initialize with stream:', err);
            setError('Failed to initialize video');
        }
    }, [roomCode, playerId, isInitialized]);

    // Toggle camera
    const toggleCamera = useCallback(() => {
        setLocalVideoEnabled(!isCameraOn);
        setIsCameraOn(!isCameraOn);

        if (roomCode && playerId) {
            updateMediaState(roomCode, playerId, {
                isCameraOn: !isCameraOn,
                isMicOn,
            });
        }
    }, [isCameraOn, isMicOn, roomCode, playerId]);

    // Toggle microphone
    const toggleMic = useCallback(() => {
        setLocalAudioEnabled(!isMicOn);
        setIsMicOn(!isMicOn);

        if (roomCode && playerId) {
            updateMediaState(roomCode, playerId, {
                isCameraOn,
                isMicOn: !isMicOn,
            });
        }
    }, [isCameraOn, isMicOn, roomCode, playerId]);

    // Handle incoming signaling data
    const handleSignal = useCallback(
        async (signal: RTCSignalData) => {
            try {
                if (signal.type === 'offer') {
                    // Received an offer - create peer connection and answer
                    const pc = createPeerConnection(
                        signal.from,
                        async (candidate) => {
                            await sendSignal(roomCode, playerId, signal.from, 'ice-candidate', candidate.toJSON());
                        },
                        (stream) => {
                            setRemoteStreams((prev) => new Map(prev).set(signal.from, stream));
                        }
                    );

                    const answer = await handleOffer(signal.from, signal.payload as RTCSessionDescriptionInit);
                    await sendSignal(roomCode, playerId, signal.from, 'answer', answer);
                } else if (signal.type === 'answer') {
                    // Received an answer
                    await handleAnswer(signal.from, signal.payload as RTCSessionDescriptionInit);
                } else if (signal.type === 'ice-candidate') {
                    // Received an ICE candidate
                    await addIceCandidate(signal.from, signal.payload as RTCIceCandidateInit);
                }
            } catch (err) {
                console.error('Error handling signal:', err);
            }
        },
        [roomCode, playerId]
    );

    // Setup connections to other players
    useEffect(() => {
        if (!isEnabled || !isInitialized || !roomCode || !playerId) return;

        // Subscribe to incoming signals
        signalUnsubscribeRef.current = subscribeToSignals(roomCode, playerId, handleSignal);

        // Initiate connections to players with lower IDs (deterministic ordering)
        const otherPlayers = Object.values(players).filter(
            (p) => p.id !== playerId && !p.isEliminated
        );

        otherPlayers.forEach(async (player) => {
            // Only initiate if our ID is "greater" (to avoid both sides initiating)
            if (playerId > player.id && !pendingConnectionsRef.current.has(player.id)) {
                pendingConnectionsRef.current.add(player.id);

                try {
                    const pc = createPeerConnection(
                        player.id,
                        async (candidate) => {
                            await sendSignal(roomCode, playerId, player.id, 'ice-candidate', candidate.toJSON());
                        },
                        (stream) => {
                            setRemoteStreams((prev) => new Map(prev).set(player.id, stream));
                        }
                    );

                    const offer = await createOffer(player.id);
                    await sendSignal(roomCode, playerId, player.id, 'offer', offer);
                } catch (err) {
                    console.error(`Failed to connect to ${player.id}:`, err);
                    pendingConnectionsRef.current.delete(player.id);
                }
            }
        });

        return () => {
            if (signalUnsubscribeRef.current) {
                signalUnsubscribeRef.current();
                signalUnsubscribeRef.current = null;
            }
        };
    }, [isEnabled, isInitialized, roomCode, playerId, players, handleSignal]);

    // Handle player leaving - close their connection
    useEffect(() => {
        const currentPlayerIds = new Set(Object.keys(players));

        remoteStreams.forEach((_, peerId) => {
            if (!currentPlayerIds.has(peerId)) {
                closePeerConnection(peerId);
                setRemoteStreams((prev) => {
                    const next = new Map(prev);
                    next.delete(peerId);
                    return next;
                });
            }
        });
    }, [players, remoteStreams]);

    // Cleanup function
    const cleanup = useCallback(() => {
        closeAllPeerConnections();
        stopLocalStream();

        if (signalUnsubscribeRef.current) {
            signalUnsubscribeRef.current();
            signalUnsubscribeRef.current = null;
        }

        setLocalStream(null);
        setRemoteStreams(new Map());
        setIsInitialized(false);
        pendingConnectionsRef.current.clear();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    return {
        localStream,
        remoteStreams,
        isCameraOn,
        isMicOn,
        isInitialized,
        error,
        initializeMedia,
        initializeWithStream,
        toggleCamera,
        toggleMic,
        cleanup,
    };
}

export default useWebRTC;
