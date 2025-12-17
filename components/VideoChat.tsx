import React, { useRef, useEffect, useState } from 'react';
import { Player } from '../types';

// Helper for avatars - uses player's selected character style
const getAvatarUrl = (seed: string, style: string = 'adventurer') =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

interface VideoTileProps {
    player: Player;
    stream?: MediaStream;
    isLocal?: boolean;
    isSpeaking?: boolean;
    isSpotlight?: boolean;
    isMuted?: boolean;
}

/**
 * Individual video tile showing a player's camera or avatar fallback
 */
export const VideoTile: React.FC<VideoTileProps> = ({
    player,
    stream,
    isLocal = false,
    isSpeaking = false,
    isSpotlight = false,
    isMuted = false,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const hasVideo = stream && stream.getVideoTracks().length > 0;

    return (
        <div
            className={`video-tile relative overflow-hidden bg-gray-900 ${isSpotlight ? 'rounded-2xl' : 'rounded-xl'
                } ${isSpeaking ? 'ring-4 ring-gold animate-pulse-subtle' : ''}`}
            style={isSpotlight ? { aspectRatio: '16/9' } : { aspectRatio: '1/1' }}
        >
            {hasVideo ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal || isMuted}
                    className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
                />
            ) : (
                // Avatar fallback when camera is off or unavailable
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                    <img
                        src={getAvatarUrl(player.avatarSeed, player.characterStyle)}
                        alt={player.name}
                        className={`${isSpotlight ? 'w-32 h-32' : 'w-16 h-16'} rounded-full bg-white`}
                    />
                </div>
            )}

            {/* Player name label */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className={`text-white font-bold truncate ${isSpotlight ? 'text-lg' : 'text-xs'}`}>
                    {player.name}
                    {isLocal && ' (You)'}
                </p>
            </div>

            {/* Muted indicator */}
            {isMuted && (
                <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1">
                    <span className="text-xs">🔇</span>
                </div>
            )}

            {/* Speaking indicator */}
            {isSpeaking && (
                <div className="absolute top-2 left-2 bg-gold rounded-full px-2 py-1">
                    <span className="text-xs text-feltDark font-bold">📢 Speaking</span>
                </div>
            )}
        </div>
    );
};

interface VideoChatProps {
    mode: 'spotlight' | 'table';
    players: Record<string, Player>;
    currentPlayerId: string;
    spotlightPlayerId?: string; // For spotlight mode - who is currently speaking
    localStream?: MediaStream;
    remoteStreams: Map<string, MediaStream>;
    onToggleMic?: () => void;
    onToggleCamera?: () => void;
    isMicOn?: boolean;
    isCameraOn?: boolean;
}

/**
 * Main VideoChat component with two layout modes:
 * - Spotlight: Shows current speaker fullscreen with self in corner
 * - Table: Grid of all players for voting discussion
 */
export const VideoChat: React.FC<VideoChatProps> = ({
    mode,
    players,
    currentPlayerId,
    spotlightPlayerId,
    localStream,
    remoteStreams,
    onToggleMic,
    onToggleCamera,
    isMicOn = true,
    isCameraOn = true,
}) => {
    const playerList = (Object.values(players) as Player[]).filter(p => !p.isEliminated);
    const currentPlayer = players[currentPlayerId];
    const spotlightPlayer = spotlightPlayerId ? players[spotlightPlayerId] : null;

    if (mode === 'spotlight' && spotlightPlayer) {
        const isSpotlightSelf = spotlightPlayerId === currentPlayerId;
        const spotlightStream = isSpotlightSelf
            ? localStream
            : remoteStreams.get(spotlightPlayerId);

        return (
            <div className="video-spotlight fixed inset-0 z-40 bg-black/90 flex flex-col">
                {/* Main spotlight video */}
                <div className="flex-1 p-4 flex items-center justify-center">
                    <div className="w-full max-w-4xl">
                        <VideoTile
                            player={spotlightPlayer}
                            stream={spotlightStream}
                            isLocal={isSpotlightSelf}
                            isSpeaking={true}
                            isSpotlight={true}
                        />
                    </div>
                </div>

                {/* Self preview in corner (if not the spotlight) */}
                {!isSpotlightSelf && currentPlayer && (
                    <div className="absolute bottom-20 right-4 w-32 shadow-2xl">
                        <VideoTile
                            player={currentPlayer}
                            stream={localStream}
                            isLocal={true}
                            isMuted={!isMicOn}
                        />
                    </div>
                )}

                {/* Controls at bottom */}
                <div className="p-4 flex justify-center gap-4 bg-black/50">
                    <button
                        onClick={onToggleMic}
                        className={`p-4 rounded-full transition ${isMicOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'
                            }`}
                    >
                        <span className="text-2xl">{isMicOn ? '🎤' : '🔇'}</span>
                    </button>
                    <button
                        onClick={onToggleCamera}
                        className={`p-4 rounded-full transition ${isCameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'
                            }`}
                    >
                        <span className="text-2xl">{isCameraOn ? '📹' : '📷'}</span>
                    </button>
                </div>
            </div>
        );
    }

    // Table mode - grid of all players
    const gridCols = playerList.length <= 4 ? 2 : playerList.length <= 6 ? 3 : 4;

    return (
        <div className="video-table bg-feltDark/95 rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white/70">📹 Discussion Time</h3>
                <div className="flex gap-2">
                    <button
                        onClick={onToggleMic}
                        className={`p-2 rounded-lg text-sm transition ${isMicOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'
                            }`}
                    >
                        {isMicOn ? '🎤' : '🔇'}
                    </button>
                    <button
                        onClick={onToggleCamera}
                        className={`p-2 rounded-lg text-sm transition ${isCameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'
                            }`}
                    >
                        {isCameraOn ? '📹' : '📷'}
                    </button>
                </div>
            </div>

            <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
                {playerList.map(player => {
                    const isLocal = player.id === currentPlayerId;
                    const stream = isLocal ? localStream : remoteStreams.get(player.id);

                    return (
                        <VideoTile
                            key={player.id}
                            player={player}
                            stream={stream}
                            isLocal={isLocal}
                            isMuted={isLocal ? !isMicOn : false}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default VideoChat;
