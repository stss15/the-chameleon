import React, { useState, useEffect } from 'react';
import { Player } from '../types';

// Helper for avatars
const getAvatarUrl = (seed: string, style: string = 'adventurer') =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

interface VoteRevealProps {
    isVisible: boolean;
    players: Record<string, Player>;
    eliminatedId: string;
    isChameleonCaught: boolean;
    onComplete: () => void;
}

type RevealPhase = 'tally' | 'suspense' | 'result';

export const VoteReveal: React.FC<VoteRevealProps> = ({
    isVisible,
    players,
    eliminatedId,
    isChameleonCaught,
    onComplete
}) => {
    const [phase, setPhase] = useState<RevealPhase>('tally');

    const playerList: Player[] = Object.values(players) as Player[];
    const eliminatedPlayer = players[eliminatedId];

    // Vote tally
    const voteCounts: Record<string, number> = {};
    playerList.forEach(p => {
        if (p.votedFor && !p.isEliminated) {
            voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
        }
    });

    // Auto-progress through phases
    useEffect(() => {
        if (!isVisible) {
            setPhase('tally');
            return;
        }

        if (phase === 'tally') {
            const timer = setTimeout(() => setPhase('suspense'), 2000);
            return () => clearTimeout(timer);
        }

        if (phase === 'suspense') {
            const timer = setTimeout(() => setPhase('result'), 3000);
            return () => clearTimeout(timer);
        }

        if (phase === 'result') {
            const timer = setTimeout(onComplete, 3000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, phase, onComplete]);

    if (!isVisible || !eliminatedPlayer) return null;

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="max-w-md w-full">

                {/* Phase 1: Vote Tally */}
                {phase === 'tally' && (
                    <div className="bg-white/10 rounded-xl p-6 text-center animate-fade-in">
                        <h2 className="text-2xl font-bold text-gold mb-4">📊 VOTE TALLY</h2>
                        <div className="space-y-2">
                            {Object.entries(voteCounts)
                                .sort((a, b) => b[1] - a[1])
                                .map(([playerId, count]) => {
                                    const player = players[playerId];
                                    return (
                                        <div
                                            key={playerId}
                                            className={`flex items-center gap-3 p-3 rounded-lg ${playerId === eliminatedId ? 'bg-red-500/30 ring-2 ring-red-500' : 'bg-white/5'
                                                }`}
                                        >
                                            <img
                                                src={getAvatarUrl(player?.avatarSeed || '', player?.characterStyle)}
                                                className="w-10 h-10 rounded-full bg-white"
                                            />
                                            <span className="flex-1 font-bold">{player?.name}</span>
                                            <span className="text-2xl font-bold text-gold">{count} vote{count > 1 ? 's' : ''}</span>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* Phase 2: Suspense */}
                {phase === 'suspense' && (
                    <div className="text-center">
                        <div className="text-6xl mb-6 animate-bounce">🔍</div>
                        <h2 className="text-3xl font-bold text-white mb-2">
                            The Chameleon is...
                        </h2>
                        <div className="flex justify-center gap-2 mt-4">
                            <span className="w-3 h-3 bg-gold rounded-full animate-pulse" style={{ animationDelay: '0s' }}></span>
                            <span className="w-3 h-3 bg-gold rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></span>
                            <span className="w-3 h-3 bg-gold rounded-full animate-pulse" style={{ animationDelay: '0.6s' }}></span>
                        </div>
                    </div>
                )}

                {/* Phase 3: Result */}
                {phase === 'result' && (
                    <div className="text-center animate-scale-in">
                        <div className="mb-6">
                            <img
                                src={getAvatarUrl(eliminatedPlayer.avatarSeed, eliminatedPlayer.characterStyle)}
                                className="w-24 h-24 rounded-full bg-white mx-auto ring-4 ring-gold"
                            />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">{eliminatedPlayer.name}</h2>
                        {isChameleonCaught ? (
                            <div className="bg-green-500/30 rounded-xl p-6 mt-4">
                                <div className="text-5xl mb-2">🎉</div>
                                <h3 className="text-3xl font-bold text-green-400">WAS THE CHAMELEON!</h3>
                                <p className="text-white/70 mt-2">Well done, you found them!</p>
                            </div>
                        ) : (
                            <div className="bg-red-500/30 rounded-xl p-6 mt-4">
                                <div className="text-5xl mb-2">😱</div>
                                <h3 className="text-3xl font-bold text-red-400">WAS NOT THE CHAMELEON!</h3>
                                <p className="text-white/70 mt-2">The chameleon is still in the game...</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default VoteReveal;
