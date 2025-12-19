import React, { useState, useEffect } from 'react';
import { GameState, Player, TopicCard } from './types';
import { initFirebase, createRoom, joinRoom, setPlayerName, subscribeToRoom, startGame, submitClue, submitVote, startVotingPhase, resetGame, continueAfterElimination, sendChatMessage, endRoom, leaveRoom, submitTopicVote } from './services/firebase';
import { generateTopic } from './services/gemini';
import { DEFAULT_TOPICS } from './constants';
import { Card, TopicGrid } from './components/Card';
import { CharacterPicker, getCharacterUrl, getCharacterById } from './components/CharacterPicker';
import { LiveChat } from './components/LiveChat';
import { GameTutorial } from './components/GameTutorial';
import { SideMenu, SideMenuToggle } from './components/SideMenu';
import { CountdownTimer, useCountdown } from './components/CountdownTimer';
import { ClueModal } from './components/ClueModal';
import { useWebRTC } from './hooks/useWebRTC';
import { firebaseConfig } from './config/firebase.config';

// Helper for avatars - uses player's selected character style
const getAvatarUrl = (seed: string, style: string = 'gentleman') =>
  getCharacterUrl(style, seed);

// Screen states for the app flow
type ScreenState = 'HOME' | 'JOIN_CODE' | 'WAITING_ROOM' | 'GAME';

const App: React.FC = () => {
  // Firebase initialized flag
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);

  // Screen/flow state
  const [screen, setScreen] = useState<ScreenState>('HOME');

  // Game Connectivity State
  const [roomCode, setRoomCode] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [playerName, setPlayerNameState] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [hasEnteredName, setHasEnteredName] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Local UI State
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [clueInput, setClueInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [isRoleRevealed, setIsRoleRevealed] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState('char1'); // Fixed character ID
  const [showTutorial, setShowTutorial] = useState(true); // Show tutorial when game starts
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false); // Side menu toggle
  const [isVideoEnabled, setIsVideoEnabled] = useState(false); // Audio chat enabled
  const [shownClue, setShownClue] = useState<{ player: Player; clue: string; nextPlayer?: Player } | null>(null); // For clue modal
  const [lastClueCount, setLastClueCount] = useState(0); // Track clue submissions
  const [lastShownCluePlayerId, setLastShownCluePlayerId] = useState<string | null>(null); // Prevent duplicate modals
  const [clueTimerExpired, setClueTimerExpired] = useState(false); // Track if clue timer ran out
  const [selectedVote, setSelectedVote] = useState<string | null>(null); // Selected vote target
  const [selectedWordGuess, setSelectedWordGuess] = useState<string | null>(null); // Chameleon's secret word guess
  const [currentTime, setCurrentTime] = useState(Date.now()); // For live timer updates

  // Initialize WebRTC for video chat
  const {
    localStream,
    remoteStreams,
    isCameraOn,
    isMicOn,
    isInitialized: isVideoInitialized,
    error: videoError,
    initializeMedia,
    initializeWithStream,
    toggleCamera,
    toggleMic,
    cleanup: cleanupVideo,
  } = useWebRTC({
    roomCode,
    playerId,
    players: gameState?.players || {},
    isEnabled: isVideoEnabled,
  });

  // Initialize Firebase on mount
  useEffect(() => {
    try {
      initFirebase(firebaseConfig);
      setIsFirebaseReady(true);
    } catch (e) {
      console.error("Failed to initialize Firebase:", e);
      setError("Failed to connect to game server");
    }
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    if (!isFirebaseReady) return;

    const savedSession = localStorage.getItem('chameleon_session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        if (session.roomCode && session.playerId && session.playerName) {
          console.log("Restoring session:", session.roomCode);
          setRoomCode(session.roomCode);
          setPlayerId(session.playerId);
          setPlayerNameState(session.playerName);
          setSelectedCharacterId(session.characterId || 'char1');
          setIsHost(session.isHost || false);
          setHasEnteredName(true);
          setScreen('WAITING_ROOM');
        }
      } catch (e) {
        console.error("Failed to restore session:", e);
        localStorage.removeItem('chameleon_session');
      }
    }

    // Check URL for room code (for share links)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl && !roomCode) {
      console.log("Room code from URL:", roomFromUrl);
      setJoinCodeInput(roomFromUrl.toUpperCase());
      // Clear the URL param to avoid confusion on refresh
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isFirebaseReady]);

  // Live timer - update every second during timed phases
  useEffect(() => {
    if (!gameState) return;

    const timedPhases = ['CLUES', 'VOTING', 'CLUES_RECAP'];
    if (!timedPhases.includes(gameState.phase)) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.phase]);

  // Save session to localStorage when it changes
  const saveSession = (code: string, pId: string, name: string, charId: string, host: boolean) => {
    localStorage.setItem('chameleon_session', JSON.stringify({
      roomCode: code,
      playerId: pId,
      playerName: name,
      characterId: charId,
      isHost: host,
      timestamp: Date.now()
    }));
  };

  // Clear session (on leave or game end)
  const clearSession = () => {
    localStorage.removeItem('chameleon_session');
  };


  // Subscribe to room updates
  useEffect(() => {
    if (roomCode && isFirebaseReady) {
      const unsub = subscribeToRoom(roomCode, (state) => {
        // Handle room ended by host
        if (state === null || state.phase === 'ENDED') {
          clearSession();
          cleanupVideo();
          setScreen('HOME');
          setRoomCode('');
          setPlayerId('');
          setGameState(null);
          setHasEnteredName(false);
          setIsHost(false);
          return;
        }

        setGameState(state);
        // Auto-transition to game when game starts
        if (state.phase !== 'LOBBY') {
          setScreen('GAME');
          setIsRoleRevealed(false);
        }
      });
      return () => unsub();
    }
  }, [roomCode, isFirebaseReady]);

  // Detect new clue submissions and show modal
  useEffect(() => {
    if (!gameState?.players || !gameState.turnOrder || gameState.phase !== 'CLUES') return;

    const playersWithClues = (Object.values(gameState.players) as Player[])
      .filter((p) => p.clue && !p.isEliminated);

    if (playersWithClues.length === 0) return;

    // Find the most recently submitted clue by timestamp
    const sortedBySubmission = [...playersWithClues].sort((a, b) =>
      (b.clueSubmittedAt || 0) - (a.clueSubmittedAt || 0)
    );
    const latestCluePlayer = sortedBySubmission[0];

    // Don't show if it's my own clue or if we already showed this player's clue
    if (!latestCluePlayer ||
      latestCluePlayer.id === playerId ||
      latestCluePlayer.id === lastShownCluePlayerId) {
      return;
    }

    // Get the next player (current turn) - only if still in CLUES phase
    const nextPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    const nextPlayer = nextPlayerId ? gameState.players[nextPlayerId] : undefined;

    setShownClue({
      player: latestCluePlayer,
      clue: latestCluePlayer.clue!,
      nextPlayer: nextPlayer?.isEliminated ? undefined : nextPlayer
    });
    setLastShownCluePlayerId(latestCluePlayer.id);
  }, [gameState?.players, gameState?.turnOrder, gameState?.currentTurnIndex, gameState?.phase, playerId, lastShownCluePlayerId]);

  // Auto-pick new topic when current topic is rejected (phase goes back to SETUP)
  useEffect(() => {
    if (!gameState || !isHost) return;

    // When phase is SETUP and there's already a topic, it means the topic was rejected
    if (gameState.phase === 'SETUP' && gameState.topic) {
      // Pick a new random topic that's different from the current one
      const otherTopics = DEFAULT_TOPICS.filter(t => t.category !== gameState.topic?.category);
      const newTopic = otherTopics[Math.floor(Math.random() * otherTopics.length)];

      // Restart with the new topic
      startGame(roomCode, newTopic);
    }
  }, [gameState?.phase, gameState?.topic, isHost, roomCode]);


  // Create a new room
  const handleCreateRoom = async () => {
    try {
      setError('');
      const res = await createRoom();
      console.log("Room created:", res.roomCode);
      setRoomCode(res.roomCode);
      setPlayerId(`p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
      setIsHost(true);
      setScreen('WAITING_ROOM');
    } catch (e: any) {
      console.error("Create room error:", e);
      setError(e.message);
    }
  };

  // Join an existing room
  const handleJoinRoom = async () => {
    try {
      if (!joinCodeInput.trim()) return setError("Enter room code");
      setError('');
      const res = await joinRoom(joinCodeInput.trim());
      console.log("Joined room:", res.roomCode);
      setRoomCode(res.roomCode);
      setPlayerId(res.playerId);
      setIsHost(false);
      setScreen('WAITING_ROOM');
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Set player name and join the game
  const handleSetName = async () => {
    try {
      if (!playerName.trim()) return setError("Enter your name");
      setError('');
      const char = getCharacterById(selectedCharacterId);
      await setPlayerName(roomCode, playerId, playerName.trim(), char.id, char.id, isHost);
      setHasEnteredName(true);
      // Save session for reconnection on refresh
      saveSession(roomCode, playerId, playerName.trim(), selectedCharacterId, isHost);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleStartGame = async () => {
    if (!gameState) return;
    try {
      let topic = DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];

      const hasApiKey = !!process.env.API_KEY;

      if (customTopic.trim() && hasApiKey) {
        setIsGenerating(true);
        try {
          topic = await generateTopic(customTopic);
        } catch (e) {
          console.error(e);
          setError("Failed to generate topic with AI. Using default.");
        } finally {
          setIsGenerating(false);
        }
      } else if (customTopic.trim() && !hasApiKey) {
        setError("API Key required for custom AI topics.");
        return;
      }

      await startGame(roomCode, topic);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Handle host ending the game
  const handleEndGame = async () => {
    if (!roomCode || !isHost) return;

    try {
      await endRoom(roomCode);
      clearSession();
      cleanupVideo();
      setScreen('HOME');
      setRoomCode('');
      setPlayerId('');
      setGameState(null);
      setHasEnteredName(false);
    } catch (e: any) {
      console.error('Failed to end game:', e);
      setError(e.message);
    }
  };

  // Handle player leaving the game
  const handleLeaveGame = async () => {
    if (!roomCode || !playerId) return;

    try {
      await leaveRoom(roomCode, playerId);
      clearSession();
      cleanupVideo();
      setScreen('HOME');
      setRoomCode('');
      setPlayerId('');
      setGameState(null);
      setHasEnteredName(false);
      setIsHost(false);
    } catch (e: any) {
      console.error('Failed to leave game:', e);
      setError(e.message);
    }
  };

  const handleClueSubmit = async (forceSubmit: boolean = false) => {
    if (!gameState) return;

    // Allow empty clue on force submit (timer expired)
    const clueText = clueInput.trim() || (forceSubmit ? '...' : '');
    if (!clueText && !forceSubmit) return;

    // Validate one word (basic check) - skip if forced
    if (!forceSubmit && clueText.split(' ').length > 1) {
      setError("Only one word allowed!");
      return;
    }

    const nextIndex = (gameState.currentTurnIndex + 1) % gameState.turnOrder.length;
    const isLast = gameState.currentTurnIndex === gameState.turnOrder.length - 1;

    await submitClue(roomCode, playerId, clueText, nextIndex, isLast, clueTimerExpired);
    setClueInput('');
    setClueTimerExpired(false); // Reset timer expired state
  };

  // Render Helpers
  if (!isFirebaseReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-felt bg-texture">
        <div className="text-center">
          <h1 className="text-4xl font-serif font-bold text-gold mb-4">The Chameleon</h1>
          <div className="animate-pulse text-white/70">Connecting to game server...</div>
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  // HOME SCREEN - Rusty Lake Cigar Lounge Style
  if (screen === 'HOME') {
    return (
      <div className="min-h-screen bg-lounge flex flex-col items-center justify-center p-4 bg-texture relative vignette">
        {/* Ornate frame border */}
        <div className="absolute inset-4 border border-brass/30 rounded-lg pointer-events-none" />

        {/* Presents text */}
        <p className="text-parchment/50 text-xs uppercase tracking-[0.4em] mb-3 font-serif">
          Steven Stewart presents
        </p>

        {/* Main title - vintage display font */}
        <h1 className="text-5xl md:text-6xl font-display font-black text-antiqueGold mb-2 drop-shadow-lg text-center tracking-tight" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 30px rgba(184,134,11,0.3)' }}>
          THE CHAMELEON
        </h1>

        {/* Ornate divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-px bg-gradient-to-r from-transparent via-brass to-transparent" />
          <span className="text-3xl">🦎</span>
          <div className="w-12 h-px bg-gradient-to-r from-transparent via-brass to-transparent" />
        </div>

        {/* Tagline */}
        <p className="text-parchment/60 text-sm italic mb-10 text-center max-w-xs font-serif">
          "Can you spot the imposter... or are you the one blending in?"
        </p>

        {/* Vintage brass buttons */}
        <div className="space-y-4 w-full max-w-xs">
          {error && <div className="bg-red-900/30 text-red-200 p-3 rounded-lg text-center text-sm border border-red-800/50">{error}</div>}

          <button
            onClick={handleCreateRoom}
            className="w-full bg-gradient-to-b from-antiqueGold to-brass text-loungeDark py-4 rounded-lg font-bold text-xl hover:from-yellow-600 hover:to-brass transition shadow-lg uppercase tracking-wide font-serif border border-brass/50"
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)' }}
          >
            🎬 Host a Game
          </button>

          <button
            onClick={() => { setScreen('JOIN_CODE'); setError(''); }}
            className="w-full bg-shadow/50 text-parchment py-4 rounded-lg font-bold text-xl hover:bg-shadow/70 transition border border-brass/30 uppercase tracking-wide font-serif"
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
          >
            🎟️ Join a Game
          </button>
        </div>

        {/* Footer */}
        <p className="absolute bottom-6 text-parchment/30 text-xs font-serif">
          A party game for 3-9 players
        </p>
      </div>
    );
  }

  // JOIN CODE SCREEN
  if (screen === 'JOIN_CODE') {
    return (
      <div className="min-h-screen bg-lounge flex flex-col items-center justify-center p-4 bg-texture vignette">
        <h1 className="text-4xl font-display font-bold text-antiqueGold mb-8">Join Game</h1>

        <div className="bg-shadow/50 p-6 rounded-lg w-full max-w-xs space-y-4 border border-brass/30">
          {error && <div className="bg-red-900/30 text-red-200 p-2 rounded text-center text-sm">{error}</div>}

          <div>
            <label className="block text-sm text-parchment/70 mb-2 font-serif">Enter Room Code</label>
            <input
              value={joinCodeInput}
              onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
              className="w-full text-3xl font-mono tracking-[0.3em] text-center p-4 rounded-lg bg-parchment text-loungeDark uppercase border-2 border-brass"
              placeholder="ABC12"
              maxLength={5}
              autoFocus
            />
          </div>

          <button
            onClick={handleJoinRoom}
            className="w-full bg-gradient-to-b from-antiqueGold to-brass text-loungeDark py-3 rounded-lg font-bold text-lg hover:from-yellow-600 hover:to-brass transition font-serif"
          >
            Join
          </button>

          <button
            onClick={() => { setScreen('HOME'); setError(''); }}
            className="w-full text-parchment/50 text-sm hover:text-parchment transition font-serif"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // WAITING ROOM SCREEN 
  if (screen === 'WAITING_ROOM') {
    const players = gameState?.players ? Object.values(gameState.players) as Player[] : [];
    const canStart = players.length >= 3 && players.length <= 9 && hasEnteredName;
    const takenCharacterIds = players.map((p: Player) => p.characterStyle || p.avatarSeed).filter(Boolean);

    return (
      <div className="min-h-screen bg-lounge flex flex-col items-center p-4 bg-texture overflow-y-auto pb-20">
        <div className="bg-shadow/50 p-4 rounded-lg w-full max-w-md border border-brass/30 mt-4 mb-8">
          {/* Room Code Display */}
          <div className="text-center mb-6">
            <p className="text-white/50 text-sm mb-1">Room Code</p>
            <p className="text-5xl font-mono font-bold text-gold tracking-[0.2em]">{roomCode}</p>
            <p className="text-white/50 text-xs mt-2">Share this code with friends!</p>

            {/* Share Buttons */}
            <div className="flex justify-center gap-2 mt-3">
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
                  navigator.clipboard.writeText(shareUrl).then(() => {
                    setError('');
                    alert('Link copied to clipboard!');
                  }).catch(() => {
                    // Fallback: copy just the room code
                    navigator.clipboard.writeText(roomCode);
                    alert('Room code copied!');
                  });
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                📋 Copy Link
              </button>
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
                  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Join my Chameleon game! 🦎\n\nRoom Code: ${roomCode}\n\nClick to join: ${shareUrl}`)}`;
                  window.open(whatsappUrl, '_blank');
                }}
                className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                💬 WhatsApp
              </button>
            </div>
          </div>

          {error && <div className="bg-red-500/20 text-red-200 p-2 rounded text-center text-sm mb-4">{error}</div>}

          {/* Name Entry & Character Selection */}
          {!hasEnteredName ? (
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm text-white/70 mb-2">Your Name</label>
                <input
                  value={playerName}
                  onChange={e => setPlayerNameState(e.target.value)}
                  className="w-full text-xl p-3 rounded-lg bg-white text-gray-900 text-center"
                  placeholder="Enter your name..."
                  maxLength={20}
                  autoFocus
                />
              </div>

              {/* Character Selection */}
              <CharacterPicker
                selectedCharacterId={selectedCharacterId}
                onSelect={setSelectedCharacterId}
                takenCharacterIds={takenCharacterIds}
              />

              <button
                onClick={handleSetName}
                disabled={!playerName.trim()}
                className="w-full bg-gradient-to-b from-antiqueGold to-brass text-loungeDark py-3 rounded-lg font-bold text-lg hover:brightness-110 transition disabled:opacity-50 font-serif uppercase tracking-wide"
              >
                Join Game
              </button>
            </div>
          ) : (
            <div className="text-center mb-6">
              <p className="text-white/50 text-sm">Playing as</p>
              <p className="text-2xl font-bold text-white">{playerName}</p>
            </div>
          )}

          {/* Players List */}
          <div className="mb-6">
            <p className="text-white/50 text-sm mb-2">Players ({players.length})</p>
            <div className="space-y-2">
              {players.map((p: Player) => (
                <div key={p.id} className="flex items-center gap-3 bg-white/5 p-2 rounded-lg">
                  <img src={getAvatarUrl(p.avatarSeed, p.characterStyle)} className="w-8 h-8 rounded-full bg-white" />
                  <span className="text-white font-medium flex-1">{p.name}</span>
                  {p.isHost && <span className="text-gold text-xs">(Host)</span>}
                  {/* Kick button - host only, can't kick self */}
                  {isHost && !p.isHost && hasEnteredName && (
                    <button
                      onClick={() => leaveRoom(roomCode, p.id)}
                      className="w-6 h-6 rounded-full bg-red-600/50 hover:bg-red-600 flex items-center justify-center text-white text-xs transition"
                      title="Remove player"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {players.length === 0 && (
                <div className="text-white/30 text-center py-4">Waiting for players...</div>
              )}
            </div>
          </div>

          {/* Start Button (Host only) */}
          {isHost && hasEnteredName && (
            <button
              onClick={handleStartGame}
              disabled={!canStart || isGenerating}
              className="w-full bg-green-500 text-white py-3 rounded-lg font-bold text-lg hover:bg-green-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Starting...' : canStart ? 'Start Game' : `Need ${2 - players.length} more player(s)`}
            </button>
          )}

          {!isHost && hasEnteredName && (
            <div className="text-center text-white/50 text-sm">
              Waiting for host to start the game...
            </div>
          )}

          {/* Leave Room Button - visible once name is entered */}
          {hasEnteredName && (
            <button
              onClick={handleLeaveGame}
              className="mt-4 w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-lg font-medium text-sm transition"
            >
              🚪 Leave Room
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentPlayer = gameState?.players[playerId];

  // Wait for the player data to be available in gameState
  if (!currentPlayer || !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-felt bg-texture">
        <div className="text-center">
          <h1 className="text-4xl font-serif font-bold text-gold mb-4">The Chameleon</h1>
          <div className="animate-pulse text-white/70">Loading...</div>
        </div>
      </div>
    );
  }

  const currentIsHost = currentPlayer.isHost;
  const myRole = currentPlayer.role;
  const isMyTurn = gameState.turnOrder?.length > 0 && gameState.turnOrder[gameState.currentTurnIndex] === playerId;

  // ============================================
  // MOBILE-FIRST GAME SCREEN - Rusty Lake Style
  // ============================================
  return (
    <div className="min-h-screen bg-lounge text-parchment font-sans bg-texture flex flex-col vignette">

      {/* Tutorial Overlay - shows when game first starts */}
      {showTutorial && gameState.phase !== 'LOBBY' && (
        <GameTutorial onComplete={() => setShowTutorial(false)} />
      )}

      {/* Hidden audio elements for WebRTC voice chat */}
      {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
        <audio
          key={peerId}
          autoPlay
          playsInline
          ref={(audio) => {
            if (audio && audio.srcObject !== stream) {
              audio.srcObject = stream;
            }
          }}
        />
      ))}

      {/* Clue Modal - shows when other players submit clues */}
      {shownClue && (
        <ClueModal
          player={shownClue.player}
          clue={shownClue.clue}
          nextPlayer={shownClue.nextPlayer}
          isMyTurnNext={shownClue.nextPlayer?.id === playerId}
          onClose={() => setShownClue(null)}
        />
      )}

      {/* Side Menu */}
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        players={gameState.players}
        isHost={isHost}
        currentPlayerId={playerId}
        onLeave={handleLeaveGame}
        onEndGame={handleEndGame}
        onKickPlayer={(kickPlayerId) => leaveRoom(roomCode, kickPlayerId)}
      />

      {/* Side Menu Toggle Button */}
      {gameState.phase !== 'LOBBY' && !isSideMenuOpen && (
        <SideMenuToggle onClick={() => setIsSideMenuOpen(true)} />
      )}

      {/* Compact Header - Rusty Lake Style */}
      <header className="flex justify-between items-center p-3 bg-loungeDark/80 border-b border-brass/30">
        <div className="flex items-center gap-2">
          <span className="text-antiqueGold text-xs font-bold font-serif">ROOM</span>
          <span className="font-mono text-lg text-parchment tracking-wider">{roomCode}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Mic Toggle Button */}
          {gameState.phase !== 'LOBBY' && (
            <button
              onClick={async () => {
                // Always check if we have an actual active stream
                // This ensures permission is requested if stream doesn't exist
                if (!localStream || localStream.getAudioTracks().length === 0) {
                  // No stream or no audio tracks - request fresh permission
                  try {
                    console.log('Requesting microphone permission...');
                    const stream = await navigator.mediaDevices.getUserMedia({
                      audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                      }
                    });
                    console.log('Microphone permission granted, tracks:', stream.getAudioTracks().length);
                    setIsVideoEnabled(true);
                    await initializeWithStream(stream);
                  } catch (err) {
                    console.error("Mic permission denied:", err);
                    alert('Microphone permission was denied. Please enable it in your browser settings.');
                  }
                } else {
                  // We have an active stream - toggle mic on/off
                  toggleMic();
                }
              }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition ${isVideoEnabled && isMicOn
                ? 'bg-green-600 text-white'
                : isVideoEnabled
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-600 text-white/50'
                }`}
              title={isVideoEnabled ? (isMicOn ? 'Mute mic' : 'Unmute mic') : 'Enable mic'}
            >
              {isVideoEnabled && isMicOn ? '🎤' : '🔇'}
            </button>
          )}
          <span className="text-sm font-medium">{currentPlayer.name}</span>
          <img src={getAvatarUrl(currentPlayer.avatarSeed, currentPlayer.characterStyle)} className="w-8 h-8 rounded-full border-2 border-white bg-white" />
        </div>
      </header>

      {/* Main Content - Scrollable */}
      <main className="flex-1 overflow-y-auto p-4 pb-32">

        {/* LOBBY PHASE */}
        {gameState.phase === 'LOBBY' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <h2 className="text-xl font-bold text-white/80 mb-6">Waiting for host to start...</h2>
            {currentIsHost && (
              <button
                disabled={isGenerating}
                onClick={handleStartGame}
                className="bg-gold text-feltDark text-xl font-bold py-4 px-8 rounded-xl shadow-xl active:scale-95 transition disabled:opacity-50"
              >
                {isGenerating ? 'Starting...' : '🎮 Start Game'}
              </button>
            )}
          </div>
        )}

        {/* TOPIC VOTE PHASE */}
        {gameState.phase === 'TOPIC_VOTE' && gameState.topic && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
            <h2 className="text-xl font-bold text-gold">Vote on This Topic!</h2>

            {/* Topic Preview */}
            <div className="bg-white/10 p-6 rounded-xl border border-white/20 w-full max-w-md">
              <p className="text-2xl font-bold text-gold mb-4">{gameState.topic.category}</p>
              <div className="grid grid-cols-4 gap-2">
                {gameState.topic.words.map((word) => (
                  <div key={word} className="bg-white/5 p-2 rounded text-xs text-white/70">
                    {word}
                  </div>
                ))}
              </div>
            </div>

            {/* Vote Status */}
            {(() => {
              const votes = gameState.topicVotes || {};
              const playerCount = Object.keys(gameState.players).length;
              const voteCount = Object.keys(votes).length;
              const hasVoted = votes[playerId] !== undefined;
              const keepVotes = Object.values(votes).filter(v => v === true).length;
              const skipVotes = Object.values(votes).filter(v => v === false).length;

              return (
                <>
                  <p className="text-white/50 text-sm">
                    Votes: {voteCount} / {playerCount}
                    {voteCount > 0 && <span className="ml-2">(👍 {keepVotes} | 👎 {skipVotes})</span>}
                  </p>

                  {/* Vote Buttons */}
                  {!hasVoted ? (
                    <div className="flex gap-4">
                      <button
                        onClick={() => submitTopicVote(roomCode, playerId, true)}
                        className="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition flex items-center gap-2"
                      >
                        👍 Keep It
                      </button>
                      <button
                        onClick={() => submitTopicVote(roomCode, playerId, false)}
                        className="bg-red-600 hover:bg-red-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition flex items-center gap-2"
                      >
                        👎 Skip It
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white/10 px-6 py-3 rounded-lg">
                      <p className="text-white">✅ You voted {votes[playerId] ? 'to keep' : 'to skip'} this topic</p>
                      <p className="text-white/50 text-sm mt-1">Waiting for others...</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* PLAYING PHASE */}
        {gameState.phase !== 'LOBBY' && gameState.phase !== 'TOPIC_VOTE' && gameState.topic && (
          <div className="space-y-6">

            {/* Topic Grid - Card Style */}
            <div className="w-full">
              <div className="text-center mb-3">
                <span className="text-embossed font-bold text-lg uppercase tracking-wider">{gameState.topic.category}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {gameState.topic.words.map((word, idx) => {
                  const isSecret = myRole !== 'CHAMELEON' && isRoleRevealed && gameState.secretWordIndex === idx;
                  return (
                    <div
                      key={word}
                      className={`playing-card p-2 text-center text-xs font-bold transition-all ${isSecret
                        ? 'bg-gold text-feltDark ring-2 ring-yellow-400 scale-105 glow-gold'
                        : 'text-gray-800'
                        }`}
                    >
                      {word}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tap-to-Reveal Role Card */}
            <button
              onClick={() => setIsRoleRevealed(!isRoleRevealed)}
              className={`w-full p-5 rounded-xl shadow-lg transition-all duration-300 active:scale-95 ${isRoleRevealed
                ? (myRole === 'CHAMELEON' ? 'bg-green-600' : 'bg-blue-600')
                : 'bg-gray-800 border-2 border-dashed border-white/30'
                }`}
            >
              {!isRoleRevealed ? (
                <div className="text-center">
                  <div className="text-4xl mb-2">🔒</div>
                  <p className="text-lg font-bold">TAP TO REVEAL YOUR ROLE</p>
                </div>
              ) : myRole === 'CHAMELEON' ? (
                <div className="text-center">
                  <div className="text-4xl mb-2">🦎</div>
                  <p className="text-xl font-black">YOU'RE THE CHAMELEON!</p>
                  <p className="text-sm opacity-70 mt-1">Blend in. Don't get caught.</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-2">👀</div>
                  <p className="text-sm opacity-70">The secret word is:</p>
                  <p className="text-2xl font-black mt-1">{gameState.topic.words[gameState.secretWordIndex!]}</p>
                </div>
              )}
            </button>

            {/* Players & Their Clues */}
            <div className="space-y-2">
              <p className="text-xs text-white/50 uppercase tracking-wider">
                Players & Clues {gameState.currentRound > 1 && `(Round ${gameState.currentRound})`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(gameState.players).map((p: Player) => {
                  const isTurn = gameState.phase === 'CLUES' && gameState.turnOrder[gameState.currentTurnIndex] === p.id;
                  const isEliminated = p.isEliminated;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 p-2 rounded-lg text-sm ${isEliminated ? 'bg-gray-900/50 opacity-50' :
                        isTurn ? 'bg-gold text-feltDark' : 'bg-white/5'
                        }`}
                    >
                      <img src={getAvatarUrl(p.avatarSeed, p.characterStyle)} className={`w-6 h-6 rounded-full bg-white ${isEliminated ? 'grayscale' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold truncate text-xs ${isEliminated ? 'line-through' : ''}`}>{p.name}</p>
                        {p.clue && <p className="text-xs opacity-70 truncate">"{p.clue}"</p>}
                        {isEliminated && <span className="text-[10px] text-red-400">OUT</span>}
                      </div>
                      {isTurn && !isEliminated && <span className="text-xs">📢</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CLUES_RECAP PHASE - Show all clues before voting */}
            {gameState.phase === 'CLUES_RECAP' && (() => {
              const activePlayers = Object.values(gameState.players).filter((p: Player) => !p.isEliminated);
              const sortedByTurn = gameState.turnOrder
                .map(id => gameState.players[id])
                .filter(p => p && !p.isEliminated);

              return (
                <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}>
                  <div className="w-full max-w-lg p-6 animate-slide-in-left">
                    <h2 className="text-2xl font-bold text-gold text-center mb-6">📜 All Clues Revealed</h2>

                    <div className="space-y-3 mb-8">
                      {sortedByTurn.map((p: Player, idx: number) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-4 bg-white/10 rounded-xl p-4 animate-fade-in"
                          style={{ animationDelay: `${idx * 150}ms` }}
                        >
                          <img
                            src={getAvatarUrl(p.avatarSeed, p.characterStyle)}
                            className="w-12 h-12 rounded-full border-2 border-gold bg-white"
                          />
                          <div className="flex-1">
                            <p className="font-bold text-white">{p.name}</p>
                            <p className="text-xl text-gold font-bold">"{p.clue || '...'}"</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="text-center">
                      <p className="text-white/50 text-sm mb-4">Who said something suspicious? 🤔</p>
                      <button
                        onClick={() => startVotingPhase(roomCode)}
                        className="bg-gold text-feltDark px-8 py-3 rounded-full font-bold active:scale-95 transition"
                      >
                        Start Voting 🗳️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* VOTING PHASE - Everyone votes, chameleon also secretly guesses the word */}
            {gameState.phase === 'VOTING' && (() => {
              const activePlayers = Object.values(gameState.players).filter((p: Player) => !p.isEliminated);
              const voteCount = activePlayers.filter((p: Player) => p.votedFor).length;
              const timerStarted = gameState.timerStartedAt || Date.now();
              const elapsedSeconds = Math.floor((currentTime - timerStarted) / 1000);
              const remainingSeconds = Math.max(0, 60 - elapsedSeconds);
              const isChameleon = myRole === 'CHAMELEON';
              const canSubmit = selectedVote && (!isChameleon || selectedWordGuess);

              const handleSubmitVote = async () => {
                if (!selectedVote) return;
                await submitVote(roomCode, playerId, selectedVote, false, selectedWordGuess || undefined);
                setSelectedVote(null);
                setSelectedWordGuess(null);
              };

              // Auto-vote for self when timer expires
              if (remainingSeconds <= 0 && !currentPlayer.votedFor) {
                // Trigger auto-vote for self with penalty
                submitVote(roomCode, playerId, playerId, true, undefined);
              }

              return (
                <div className="space-y-4">
                  <div className="bg-red-900/60 p-4 rounded-xl border border-red-500/30">
                    {/* Timer and Round Info */}
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-xs text-white/50">Round {gameState.currentRound} of {gameState.maxRounds}</p>
                      <CountdownTimer
                        seconds={remainingSeconds}
                        label="Vote"
                        warning={15}
                      />
                    </div>

                    <h3 className="text-center text-lg font-bold mb-2">🔍 WHO IS THE CHAMELEON?</h3>

                    {/* Show different UI for eliminated players (spectators) */}
                    {currentPlayer.isEliminated ? (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-3">👁️</div>
                        <p className="text-white/70 mb-2">You are watching this round</p>
                        <p className="text-white/50 text-sm">You were eliminated and cannot vote</p>
                        <p className="text-sm text-white/70 mt-4">
                          Votes: {voteCount} / {activePlayers.length}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-center text-xs text-white/50 mb-4">
                          +2 pts correct vote • -2 pts incorrect vote • Everyone votes!
                        </p>

                        <p className="text-center text-sm text-white/70 mb-3">
                          Votes: {voteCount} / {activePlayers.length}
                        </p>

                        {!currentPlayer.votedFor ? (
                          <div className="space-y-4">
                            {/* Vote Selection */}
                            <div className="space-y-2">
                              <p className="text-xs text-white/60 text-center mb-2">Select who you think is the chameleon:</p>
                              {activePlayers.map((p: Player) => (
                                <button
                                  key={p.id}
                                  onClick={() => setSelectedVote(p.id)}
                                  className={`w-full p-3 rounded-lg flex items-center gap-3 transition ${selectedVote === p.id
                                    ? 'bg-red-600 border-2 border-white'
                                    : p.id === playerId
                                      ? 'bg-gray-700/50 border border-dashed border-white/30'
                                      : 'bg-white/10 hover:bg-white/20'
                                    }`}
                                >
                                  <img src={getAvatarUrl(p.avatarSeed, p.characterStyle)} className="w-8 h-8 rounded-full bg-white" />
                                  <span className="font-bold flex-1 text-left">{p.name}</span>
                                  {selectedVote === p.id && <span className="text-lg">✓</span>}
                                </button>
                              ))}
                            </div>

                            {/* Chameleon's Secret Word Guess - Only visible to chameleon */}
                            {isChameleon && (
                              <div className="bg-purple-900/60 p-4 rounded-xl border border-purple-500/30 mt-4">
                                <h4 className="text-sm font-bold text-center mb-2">🦎 Your Secret Guess</h4>
                                <p className="text-xs text-center text-white/50 mb-3">
                                  Also guess the secret word (+2 pts if you evade & guess correctly)
                                </p>
                                <div className="grid grid-cols-4 gap-2">
                                  {gameState.topic?.words.map((word) => (
                                    <button
                                      key={word}
                                      onClick={() => setSelectedWordGuess(word)}
                                      className={`p-2 rounded text-xs font-bold transition ${selectedWordGuess === word
                                        ? 'bg-purple-600 border-2 border-white'
                                        : 'bg-white/10 hover:bg-purple-500'
                                        }`}
                                    >
                                      {word}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Submit Button */}
                            <button
                              onClick={handleSubmitVote}
                              disabled={!canSubmit}
                              className={`w-full py-4 rounded-xl font-bold text-lg transition shadow-lg ${canSubmit
                                ? 'bg-gradient-to-b from-gold to-brass text-loungeDark border-2 border-yellow-300/50 active:scale-95 hover:shadow-xl hover:shadow-gold/30'
                                : 'bg-gray-700 text-gray-400 cursor-not-allowed border border-gray-600'
                                }`}
                            >
                              {!selectedVote
                                ? '👆 Select a player to vote'
                                : isChameleon && !selectedWordGuess
                                  ? '🦎 Also select your word guess'
                                  : '🗳️ Submit Vote'}
                            </button>
                          </div>
                        ) : (
                          <p className="text-center text-white/60">✓ Vote submitted. Waiting for others...</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ELIMINATION PHASE - Brief pause to show who was eliminated */}
            {gameState.phase === 'ELIMINATION' && (
              <div className="bg-orange-900/60 p-6 rounded-xl border border-orange-500/30 text-center">
                <div className="text-5xl mb-4">❌</div>
                <h3 className="text-xl font-bold mb-2">
                  {gameState.lastEliminated && gameState.players[gameState.lastEliminated]?.name} Was Eliminated!
                </h3>
                <p className="text-white/70 text-sm mb-4">
                  They were NOT the Chameleon. The hunt continues!
                </p>
                <p className="text-xs text-white/50 mb-4">
                  Round {gameState.currentRound} of {gameState.maxRounds}
                </p>
                {currentIsHost && (
                  <button
                    onClick={() => continueAfterElimination(roomCode)}
                    className="bg-gold text-feltDark px-6 py-3 rounded-lg font-bold active:scale-95 transition"
                  >
                    Continue to Round {gameState.currentRound}
                  </button>
                )}
                {!currentIsHost && (
                  <p className="text-white/50 text-sm animate-pulse">Waiting for host to continue...</p>
                )}
              </div>
            )}

            {/* GUESSING phase removed - chameleon now guesses during VOTING */}

            {/* GAME OVER - Full screen parchment overlay */}
            {gameState.phase === 'GAME_OVER' && (() => {
              const sortedPlayers = Object.values(gameState.players)
                .sort((a: Player, b: Player) => (b.score || 0) - (a.score || 0)) as Player[];
              const leader: Player | undefined = sortedPlayers[0];
              const hasOverallWinner = gameState.overallWinner || ((leader?.score || 0) >= 20);
              const overallWinner = hasOverallWinner
                ? (gameState.overallWinner ? gameState.players[gameState.overallWinner] : leader)
                : null;
              const chameleonPlayer = (Object.values(gameState.players) as Player[]).find(p => p.role === 'CHAMELEON');
              const secretWord = gameState.topic?.words[gameState.secretWordIndex!] || '???';
              const chameleonGuessedCorrect = gameState.chameleonGuess?.toLowerCase().trim() === secretWord.toLowerCase().trim();

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in">
                  <div className="w-full max-w-lg mx-4 bg-gradient-to-b from-parchment to-parchmentDark rounded-2xl shadow-2xl p-6 animate-slide-in-left border-4 border-brass">
                    {/* Header - Round Result */}
                    {hasOverallWinner && overallWinner ? (
                      <div className="text-center mb-6">
                        <div className="text-6xl mb-3">🏆</div>
                        <h2 className="text-3xl font-black text-loungeDark">
                          {overallWinner.name} WINS!
                        </h2>
                        <p className="text-loungeDark/70 font-medium">
                          First to reach 20 points!
                        </p>
                      </div>
                    ) : (
                      <div className="text-center mb-6">
                        <div className="text-6xl mb-3">
                          {gameState.winner === 'CHAMELEON' ? '🦎' : '👮'}
                        </div>
                        <h2 className="text-2xl font-black text-loungeDark">
                          {gameState.winner === 'CHAMELEON' ? 'CHAMELEON EVADED!' : 'CHAMELEON CAUGHT!'}
                        </h2>
                        <p className="text-loungeDark/60 text-sm mt-1">
                          Round {gameState.currentRound} of {gameState.maxRounds}
                        </p>
                      </div>
                    )}

                    {/* Secret Word Reveal */}
                    {!hasOverallWinner && (
                      <div className="bg-loungeDark/10 rounded-xl p-4 mb-4 text-center">
                        <p className="text-xs text-loungeDark/60 uppercase tracking-wider mb-1">The Secret Word Was</p>
                        <p className="text-3xl font-black text-loungeDark">{secretWord}</p>

                        {/* Chameleon Info */}
                        <div className="mt-3 pt-3 border-t border-loungeDark/20">
                          <p className="text-xs text-loungeDark/60 mb-1">The Chameleon was</p>
                          <div className="flex items-center justify-center gap-2">
                            {chameleonPlayer && (
                              <>
                                <img
                                  src={getAvatarUrl(chameleonPlayer.avatarSeed, chameleonPlayer.characterStyle)}
                                  className="w-8 h-8 rounded-full border-2 border-brass bg-white"
                                />
                                <span className="text-lg font-bold text-loungeDark">{chameleonPlayer.name}</span>
                              </>
                            )}
                          </div>

                          {/* Chameleon's Guess */}
                          {gameState.chameleonGuess && gameState.chameleonGuess !== '(no guess)' && (
                            <p className={`text-sm mt-2 ${chameleonGuessedCorrect ? 'text-green-700' : 'text-red-700'}`}>
                              Guessed: "{gameState.chameleonGuess}"
                              {chameleonGuessedCorrect ? ' ✓ +2 bonus!' : ' ✗ Wrong!'}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Scoreboard */}
                    <div className="bg-loungeDark/10 rounded-xl p-4 mb-4">
                      <h4 className="text-loungeDark font-bold text-sm mb-3 text-center">
                        📊 SCOREBOARD {!hasOverallWinner && <span className="font-normal text-loungeDark/60">(First to 20 wins)</span>}
                      </h4>
                      <div className="space-y-2">
                        {sortedPlayers.map((p: Player, idx: number) => (
                          <div key={p.id} className={`flex justify-between items-center ${idx === 0 ? '' : ''}`}>
                            <div className="flex items-center gap-2">
                              <img
                                src={getAvatarUrl(p.avatarSeed, p.characterStyle)}
                                className={`w-6 h-6 rounded-full border border-brass bg-white ${p.isEliminated ? 'opacity-50 grayscale' : ''}`}
                              />
                              <span className={`text-sm text-loungeDark ${p.isEliminated ? 'line-through opacity-50' : ''} ${idx === 0 ? 'font-bold' : ''}`}>
                                {idx === 0 && !hasOverallWinner && '👑 '}
                                {p.name}
                                {p.role === 'CHAMELEON' && ' 🦎'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-loungeDark">{p.score || 0}</span>
                              {!hasOverallWinner && (
                                <div className="w-12 h-2 bg-loungeDark/20 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-brass transition-all"
                                    style={{ width: `${Math.min(100, ((p.score || 0) / 20) * 100)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="text-center">
                      {currentIsHost ? (
                        <button
                          onClick={() => resetGame(roomCode)}
                          className="bg-gradient-to-b from-loungeDark to-lounge text-parchment px-8 py-3 rounded-full font-bold active:scale-95 transition shadow-lg border-2 border-brass"
                        >
                          {hasOverallWinner ? '🎮 New Game' : '➡️ Next Round'}
                        </button>
                      ) : (
                        <p className="text-loungeDark/60 text-sm animate-pulse">
                          Waiting for host to {hasOverallWinner ? 'start new game' : 'continue'}...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )
        }
      </main>

      {/* Bottom-Anchored Clue Input - Your Turn */}
      {gameState.phase === 'CLUES' && isMyTurn && (() => {
        const timerStarted = gameState.timerStartedAt || Date.now();
        const elapsedSeconds = Math.floor((currentTime - timerStarted) / 1000);
        // Give 63 seconds total: 3 for modal countdown + 60 for typing
        const remainingSeconds = Math.max(0, 63 - elapsedSeconds);
        // Only show penalty after the full 63 seconds (modal + typing time)
        const isPenaltyTime = elapsedSeconds > 63;

        // Mark timer as expired when we go over 63 seconds
        if (elapsedSeconds > 63 && !clueTimerExpired) {
          setClueTimerExpired(true);
        }

        return (
          <div className="fixed bottom-0 left-0 right-0 bg-loungeDark border-t border-brass/30 p-4 safe-area-inset-bottom toast-enter z-30">
            {/* Timer and Banner */}
            <div className="flex justify-between items-center mb-3">
              <div className="your-turn-banner text-loungeDark text-sm font-bold py-2 px-4 rounded-lg font-serif uppercase tracking-wide">
                🎤 YOUR TURN!
              </div>
              <div className="flex items-center gap-2">
                {isPenaltyTime && (
                  <span className="text-red-400 text-xs animate-pulse">-1 pt penalty!</span>
                )}
                <CountdownTimer
                  seconds={remainingSeconds}
                  label="Time"
                  warning={15}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={clueInput}
                onChange={e => setClueInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleClueSubmit()}
                placeholder="One word clue..."
                className="flex-1 p-4 rounded-lg text-loungeDark font-bold text-lg outline-none bg-parchment border-2 border-brass"
                maxLength={20}
                autoFocus
              />
              <button
                onClick={() => handleClueSubmit()}
                className="bg-gradient-to-b from-antiqueGold to-brass text-loungeDark font-bold px-6 rounded-lg btn-press font-serif uppercase"
              >
                SEND
              </button>
            </div>
            {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
          </div>
        );
      })()}

      {/* Live Chat - Collapsible at bottom during gameplay (hidden when entering clue) */}
      {((gameState.phase === 'CLUES' && !isMyTurn) || gameState.phase === 'VOTING') && (
        <LiveChat
          messages={gameState.messages}
          currentPlayerId={playerId}
          onSendMessage={(text) => {
            const char = getCharacterById(selectedCharacterId);
            sendChatMessage(roomCode, playerId, playerName, char.id, text);
          }}
          isMicEnabled={isVideoEnabled}
          isMicOn={isMicOn}
          onToggleMic={toggleMic}
          onMicEnable={async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
              setIsVideoEnabled(true);
              await initializeWithStream(stream);
            } catch (err) {
              console.error("Mic permission denied:", err);
            }
          }}
        />
      )}
    </div>
  );
};

export default App;