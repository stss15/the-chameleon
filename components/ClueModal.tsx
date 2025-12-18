import React, { useEffect, useState } from 'react';
import { Player } from '../types';

// Helper for avatars
const getAvatarUrl = (seed: string, style: string = 'adventurer') =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

interface ClueModalProps {
    player: Player;
    clue: string;
    onClose: () => void;
    autoCloseMs?: number;
}

export const ClueModal: React.FC<ClueModalProps> = ({
    player,
    clue,
    onClose,
    autoCloseMs = 5000 // Auto close after 5 seconds by default
}) => {
    const [progress, setProgress] = useState(100);

    // Auto-close timer with progress bar
    useEffect(() => {
        if (autoCloseMs <= 0) return;

        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 100 - (elapsed / autoCloseMs) * 100);
            setProgress(remaining);

            if (remaining <= 0) {
                clearInterval(interval);
                onClose();
            }
        }, 50);

        return () => clearInterval(interval);
    }, [autoCloseMs, onClose]);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-feltDark border-2 border-gold rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-bounce-in relative">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
                >
                    ✕
                </button>

                {/* Player info */}
                <div className="flex flex-col items-center mb-4">
                    <img
                        src={getAvatarUrl(player.avatarSeed, player.characterStyle)}
                        className="w-20 h-20 rounded-full border-4 border-gold bg-white mb-2"
                        alt={player.name}
                    />
                    <h3 className="text-xl font-bold text-white">{player.name}</h3>
                    <p className="text-white/50 text-sm">submitted a clue</p>
                </div>

                {/* The clue */}
                <div className="bg-gold/20 border border-gold/50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-gold">"{clue}"</p>
                </div>

                {/* Progress bar for auto-close */}
                {autoCloseMs > 0 && (
                    <div className="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gold transition-all duration-100"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

// CSS animation (add to your global styles)
// @keyframes bounce-in {
//   0% { transform: scale(0.8); opacity: 0; }
//   50% { transform: scale(1.05); }
//   100% { transform: scale(1); opacity: 1; }
// }
// .animate-bounce-in { animation: bounce-in 0.3s ease-out; }

export default ClueModal;
