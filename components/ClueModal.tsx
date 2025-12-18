import React from 'react';
import { Player } from '../types';

// Helper for avatars
const getAvatarUrl = (seed: string, style: string = 'adventurer') =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

interface ClueModalProps {
    player: Player;
    clue: string;
    onClose: () => void;
}

export const ClueModal: React.FC<ClueModalProps> = ({
    player,
    clue,
    onClose,
}) => {
    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
            <div className="bg-feltDark border-2 border-gold rounded-2xl p-4 max-w-xs w-full shadow-2xl animate-bounce-in relative pointer-events-auto">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition text-sm"
                >
                    ✕
                </button>

                {/* Player info + clue in compact layout */}
                <div className="flex items-center gap-3">
                    <img
                        src={getAvatarUrl(player.avatarSeed, player.characterStyle)}
                        className="w-12 h-12 rounded-full border-2 border-gold bg-white flex-shrink-0"
                        alt={player.name}
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{player.name}</p>
                        <p className="text-lg font-bold text-gold truncate">"{clue}"</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClueModal;

