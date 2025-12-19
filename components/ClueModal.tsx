import React, { useEffect, useState } from 'react';
import { Player } from '../types';
import { getCharacterUrl } from './CharacterPicker';

// Helper for avatars - uses local character images
const getAvatarUrl = (seed: string, style: string = 'gentleman') =>
    getCharacterUrl(style, seed);

interface ClueModalProps {
    player: Player;
    clue: string;
    nextPlayer?: Player;
    isMyTurnNext: boolean;
    onClose: () => void;
}

export const ClueModal: React.FC<ClueModalProps> = ({
    player,
    clue,
    nextPlayer,
    isMyTurnNext,
    onClose,
}) => {
    const [countdown, setCountdown] = useState(isMyTurnNext ? 3 : null);

    // Auto-close countdown when it's your turn next
    useEffect(() => {
        if (!isMyTurnNext) return;

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(timer);
                    onClose();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isMyTurnNext, onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
        >
            {/* Full-screen slide-in content */}
            <div className="w-full h-full flex flex-col items-center justify-center p-6 animate-slide-in-left">
                {/* Close button - top right */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-xl transition z-10"
                >
                    ✕
                </button>

                {/* Main content */}
                <div className="text-center max-w-md w-full">
                    {/* Player avatar and name */}
                    <div className="mb-6">
                        <img
                            src={getAvatarUrl(player.avatarSeed, player.characterStyle)}
                            className="w-24 h-24 rounded-full border-4 border-gold mx-auto mb-4 bg-white shadow-2xl"
                            alt={player.name}
                        />
                        <p className="text-xl font-bold text-white">{player.name}</p>
                        <p className="text-sm text-white/60">submitted a clue</p>
                    </div>

                    {/* The clue */}
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-6 mb-8 border border-gold/30">
                        <p className="text-4xl font-black text-gold tracking-wide">"{clue}"</p>
                    </div>

                    {/* Who is next */}
                    {nextPlayer && (
                        <div className="flex items-center justify-center gap-3 mb-6">
                            <div className="h-px w-12 bg-white/30" />
                            <span className="text-white/50 text-sm uppercase tracking-wider">Next up</span>
                            <div className="h-px w-12 bg-white/30" />
                        </div>
                    )}

                    {nextPlayer && (
                        <div className="flex items-center justify-center gap-3">
                            <img
                                src={getAvatarUrl(nextPlayer.avatarSeed, nextPlayer.characterStyle)}
                                className="w-12 h-12 rounded-full border-2 border-white/50 bg-white"
                                alt={nextPlayer.name}
                            />
                            <div className="text-left">
                                <p className="text-lg font-bold text-white">{nextPlayer.name}</p>
                                {isMyTurnNext && (
                                    <p className="text-sm text-gold animate-pulse">That's you!</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Countdown for your turn */}
                    {isMyTurnNext && countdown !== null && (
                        <div className="mt-8">
                            <div className="inline-flex items-center gap-2 bg-gold text-feltDark px-6 py-3 rounded-full font-bold">
                                <span>Your turn in</span>
                                <span className="text-2xl">{countdown}</span>
                            </div>
                        </div>
                    )}

                    {/* Tap to close hint (if not auto-closing) */}
                    {!isMyTurnNext && (
                        <button
                            onClick={onClose}
                            className="mt-8 text-white/50 text-sm hover:text-white transition"
                        >
                            Tap anywhere to continue
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClueModal;
