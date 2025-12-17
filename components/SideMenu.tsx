import React, { useState } from 'react';
import { Player } from '../types';

// Helper for avatars
const getAvatarUrl = (seed: string, style: string = 'adventurer') =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

interface SideMenuProps {
    isOpen: boolean;
    onClose: () => void;
    players: Record<string, Player>;
    isHost: boolean;
    onLeave: () => void;
    onEndGame: () => void;
}

type TabType = 'leaderboard' | 'clues';

export const SideMenu: React.FC<SideMenuProps> = ({ isOpen, onClose, players, isHost, onLeave, onEndGame }) => {
    const [activeTab, setActiveTab] = useState<TabType>('leaderboard');

    const playerList: Player[] = Object.values(players) as Player[];
    const sortedByScore = [...playerList].sort((a, b) => (b.score || 0) - (a.score || 0));
    const playersWithClues = playerList.filter(p => p.clue);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40"
                    onClick={onClose}
                />
            )}

            {/* Drawer */}
            <div className={`fixed top-0 right-0 h-full w-[85%] max-w-sm bg-feltDark border-l border-white/20 z-50 transform transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-gold">📋 Game Info</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10">
                    <button
                        onClick={() => setActiveTab('leaderboard')}
                        className={`flex-1 py-3 text-sm font-bold transition ${activeTab === 'leaderboard'
                            ? 'text-gold border-b-2 border-gold'
                            : 'text-white/50'
                            }`}
                    >
                        🏆 Leaderboard
                    </button>
                    <button
                        onClick={() => setActiveTab('clues')}
                        className={`flex-1 py-3 text-sm font-bold transition ${activeTab === 'clues'
                            ? 'text-gold border-b-2 border-gold'
                            : 'text-white/50'
                            }`}
                    >
                        💬 Clues
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto flex-1">
                    {activeTab === 'leaderboard' && (
                        <div className="space-y-2">
                            {sortedByScore.map((player, idx) => (
                                <div
                                    key={player.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg ${player.isEliminated ? 'bg-gray-900/50 opacity-50' : 'bg-white/5'
                                        }`}
                                >
                                    <span className="text-2xl font-bold text-gold w-8">#{idx + 1}</span>
                                    <img
                                        src={getAvatarUrl(player.avatarSeed, player.characterStyle)}
                                        className={`w-10 h-10 rounded-full bg-white ${player.isEliminated ? 'grayscale' : ''}`}
                                    />
                                    <div className="flex-1">
                                        <p className={`font-bold ${player.isEliminated ? 'line-through' : ''}`}>
                                            {player.name}
                                        </p>
                                        {player.isEliminated && (
                                            <span className="text-xs text-red-400">Eliminated</span>
                                        )}
                                    </div>
                                    <span className="text-xl font-bold text-gold">{player.score || 0}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'clues' && (
                        <div className="space-y-2">
                            {playersWithClues.length === 0 ? (
                                <p className="text-white/50 text-center py-8">No clues yet...</p>
                            ) : (
                                playersWithClues.map(player => (
                                    <div
                                        key={player.id}
                                        className={`flex items-center gap-3 p-3 rounded-lg bg-white/5 ${player.isEliminated ? 'opacity-50' : ''
                                            }`}
                                    >
                                        <img
                                            src={getAvatarUrl(player.avatarSeed, player.characterStyle)}
                                            className="w-8 h-8 rounded-full bg-white"
                                        />
                                        <div className="flex-1">
                                            <p className="font-bold text-sm">{player.name}</p>
                                            <p className="text-gold text-lg">"{player.clue}"</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Leave/End Game Buttons */}
                <div className="p-4 border-t border-white/10 space-y-2">
                    {isHost ? (
                        <button
                            onClick={onEndGame}
                            className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-lg font-bold transition"
                        >
                            🛑 End Game (All Players)
                        </button>
                    ) : (
                        <button
                            onClick={onLeave}
                            className="w-full bg-orange-600 hover:bg-orange-500 text-white py-3 rounded-lg font-bold transition"
                        >
                            🚪 Leave Game
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

// Toggle button for opening the side menu
export const SideMenuToggle: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        onClick={onClick}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-gold text-feltDark px-2 py-4 rounded-l-lg font-bold text-xs z-30 shadow-lg"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
    >
        📋 INFO
    </button>
);

export default SideMenu;
