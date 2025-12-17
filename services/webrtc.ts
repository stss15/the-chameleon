/**
 * WebRTC Service for The Chameleon
 * Handles peer-to-peer video/audio connections between players
 */

// STUN servers for NAT traversal (using Google's public servers)
const ICE_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ],
};

// Store peer connections and streams
const peerConnections = new Map<string, RTCPeerConnection>();
const remoteStreams = new Map<string, MediaStream>();
let localStream: MediaStream | null = null;

/**
 * Request access to camera and microphone
 */
export async function requestMediaDevices(): Promise<MediaStream> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user',
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
            },
        });
        localStream = stream;
        return stream;
    } catch (error) {
        console.error('Failed to get media devices:', error);
        throw error;
    }
}

/**
 * Get the local media stream (if already acquired)
 */
export function getLocalStream(): MediaStream | null {
    return localStream;
}

/**
 * Stop the local media stream
 */
export function stopLocalStream(): void {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
}

/**
 * Mute/unmute the local audio track
 */
export function setLocalAudioEnabled(enabled: boolean): void {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = enabled;
        });
    }
}

/**
 * Enable/disable the local video track
 */
export function setLocalVideoEnabled(enabled: boolean): void {
    if (localStream) {
        localStream.getVideoTracks().forEach(track => {
            track.enabled = enabled;
        });
    }
}

/**
 * Create a new peer connection for a remote player
 */
export function createPeerConnection(
    peerId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onTrack: (stream: MediaStream) => void
): RTCPeerConnection {
    // Close existing connection if any
    if (peerConnections.has(peerId)) {
        closePeerConnection(peerId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            onIceCandidate(event.candidate);
        }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
            remoteStreams.set(peerId, stream);
            onTrack(stream);
        }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            // Could add reconnection logic here
        }
    };

    // Add local tracks to the connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream!);
        });
    }

    peerConnections.set(peerId, pc);
    return pc;
}

/**
 * Create and send an offer to a remote peer
 */
export async function createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = peerConnections.get(peerId);
    if (!pc) throw new Error(`No peer connection for ${peerId}`);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
}

/**
 * Handle an incoming offer and create an answer
 */
export async function handleOffer(
    peerId: string,
    offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
    const pc = peerConnections.get(peerId);
    if (!pc) throw new Error(`No peer connection for ${peerId}`);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
}

/**
 * Handle an incoming answer from a remote peer
 */
export async function handleAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit
): Promise<void> {
    const pc = peerConnections.get(peerId);
    if (!pc) throw new Error(`No peer connection for ${peerId}`);

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

/**
 * Add an ICE candidate from a remote peer
 */
export async function addIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit
): Promise<void> {
    const pc = peerConnections.get(peerId);
    if (!pc) throw new Error(`No peer connection for ${peerId}`);

    await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

/**
 * Get the remote stream for a peer
 */
export function getRemoteStream(peerId: string): MediaStream | undefined {
    return remoteStreams.get(peerId);
}

/**
 * Get all remote streams
 */
export function getAllRemoteStreams(): Map<string, MediaStream> {
    return new Map(remoteStreams);
}

/**
 * Close a specific peer connection
 */
export function closePeerConnection(peerId: string): void {
    const pc = peerConnections.get(peerId);
    if (pc) {
        pc.close();
        peerConnections.delete(peerId);
    }
    remoteStreams.delete(peerId);
}

/**
 * Close all peer connections
 */
export function closeAllPeerConnections(): void {
    peerConnections.forEach((pc, peerId) => {
        pc.close();
    });
    peerConnections.clear();
    remoteStreams.clear();
}

/**
 * Check if we have an active connection to a peer
 */
export function hasConnectionTo(peerId: string): boolean {
    const pc = peerConnections.get(peerId);
    return pc !== undefined && pc.connectionState === 'connected';
}

/**
 * Get connection state for a peer
 */
export function getConnectionState(peerId: string): RTCPeerConnectionState | null {
    const pc = peerConnections.get(peerId);
    return pc?.connectionState ?? null;
}
