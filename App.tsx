import React, { useState, useEffect } from 'react';
import { GameState, Player, TopicCard } from './types';
import { initFirebase, createRoom, joinRoom, setPlayerName, subscribeToRoom, startGame, submitClue, submitVote, submitChameleonGuess, resetGame, continueAfterElimination, sendChatMessage } from './services/firebase';
import { generateTopic } from './services/gemini';
import { DEFAULT_TOPICS } from './constants';
import { Card, TopicGrid } from './components/Card';
import { CharacterPicker, getCharacterUrl, getCharacterById } from './components/CharacterPicker';
import { LiveChat } from './components/LiveChat';
import { GameTutorial } from './components/GameTutorial';
import { SideMenu, SideMenuToggle } from './components/SideMenu';
import { CountdownTimer, useCountdown } from './components/CountdownTimer';
import { VideoChat } from './components/VideoChat';
import { useWebRTC } from './hooks/useWebRTC';
import { firebaseConfig } from './config/firebase.config';

// Helper for avatars - uses player's selected character style
const getAvatarUrl = (seed: string, style: string = 'adventurer') =>
  `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

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
  const [isVideoEnabled, setIsVideoEnabled] = useState(false); // Video chat enabled

  // Initialize WebRTC for video chat
  const {
    localStream,
    remoteStreams,
    isCameraOn,
    isMicOn,
    isInitialized: isVideoInitialized,
    error: videoError,
    initializeMedia,
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
  }, [isFirebaseReady]);

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
      await setPlayerName(roomCode, playerId, playerName.trim(), char.style, char.seed, isHost);
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

  const handleClueSubmit = async () => {
    if (!clueInput.trim() || !gameState) return;

    // Validate one word (basic check)
    if (clueInput.trim().split(' ').length > 1) {
      setError("Only one word allowed!");
      return;
    }

    const nextIndex = (gameState.currentTurnIndex + 1) % gameState.turnOrder.length;
    const isLast = gameState.currentTurnIndex === gameState.turnOrder.length - 1;

    await submitClue(roomCode, playerId, clueInput.trim(), nextIndex, isLast);
    setClueInput('');
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

  // HOME SCREEN
  if (screen === 'HOME') {
    return (
      <div className="min-h-screen bg-felt flex flex-col items-center justify-center p-4 bg-texture">
        <h1 className="text-5xl font-serif font-bold text-gold mb-8 drop-shadow-lg">🦎 The Chameleon</h1>

        <div className="space-y-4 w-full max-w-xs">
          {error && <div className="bg-red-500/20 text-red-200 p-3 rounded-lg text-center text-sm border border-red-500/30">{error}</div>}

          <button
            onClick={handleCreateRoom}
            className="w-full bg-gold text-feltDark py-4 rounded-xl font-bold text-xl hover:bg-yellow-400 transition shadow-lg"
          >
            Create Room
          </button>

          <button
            onClick={() => { setScreen('JOIN_CODE'); setError(''); }}
            className="w-full bg-white/10 text-white py-4 rounded-xl font-bold text-xl hover:bg-white/20 transition border border-white/20"
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  // JOIN CODE SCREEN
  if (screen === 'JOIN_CODE') {
    return (
      <div className="min-h-screen bg-felt flex flex-col items-center justify-center p-4 bg-texture">
        <h1 className="text-4xl font-serif font-bold text-gold mb-8">Join Game</h1>

        <div className="bg-white/10 p-6 rounded-xl w-full max-w-xs space-y-4 border border-white/20">
          {error && <div className="bg-red-500/20 text-red-200 p-2 rounded text-center text-sm">{error}</div>}

          <div>
            <label className="block text-sm text-white/70 mb-2">Enter Room Code</label>
            <input
              value={joinCodeInput}
              onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
              className="w-full text-3xl font-mono tracking-[0.3em] text-center p-4 rounded-lg bg-white text-gray-900 uppercase"
              placeholder="ABC12"
              maxLength={5}
              autoFocus
            />
          </div>

          <button
            onClick={handleJoinRoom}
            className="w-full bg-gold text-feltDark py-3 rounded-lg font-bold text-lg hover:bg-yellow-400 transition"
          >
            Join
          </button>

          <button
            onClick={() => { setScreen('HOME'); setError(''); }}
            className="w-full text-white/50 text-sm hover:text-white transition"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // WAITING ROOM SCREEN 
  if (screen === 'WAITING_ROOM') {
    const players = gameState?.players ? Object.values(gameState.players) : [];
    const canStart = players.length >= 2 && hasEnteredName;

    return (
      <div className="min-h-screen bg-felt flex flex-col items-center justify-center p-4 bg-texture">
        <div className="bg-white/10 p-6 rounded-xl w-full max-w-md border border-white/20">
          {/* Room Code Display */}
          <div className="text-center mb-6">
            <p className="text-white/50 text-sm mb-1">Room Code</p>
            <p className="text-5xl font-mono font-bold text-gold tracking-[0.2em]">{roomCode}</p>
            <p className="text-white/50 text-xs mt-2">Share this code with friends!</p>
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
              />

              <button
                onClick={handleSetName}
                disabled={!playerName.trim()}
                className="w-full bg-gold text-feltDark py-3 rounded-lg font-bold text-lg hover:bg-yellow-400 transition disabled:opacity-50"
              >
                Join Game
              </button>
            </div>
          ) : (
            <div className="text-center mb-6">
              <p className="text-white/50 text-sm">Playing as</p>
              <p className="text-2xl font-bold text-white">{playerName}</p>

              {/* Enable Camera Button */}
              {!isVideoEnabled ? (
                <button
                  onClick={async () => {
                    try {
                      // Call getUserMedia directly in click handler for browser trust
                      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                      setIsVideoEnabled(true);
                      await initializeMedia();
                    } catch (err) {
                      console.error("Camera permission denied:", err);
                      setError("Camera/microphone access denied");
                    }
                  }}
                  className="mt-4 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg font-medium text-sm transition flex items-center gap-2 mx-auto"
                >
                  <span>📹</span> Enable Camera & Mic
                </button>
              ) : (
                <div className="mt-4 space-y-2">
                  {videoError ? (
                    <p className="text-orange-400 text-xs">{videoError}</p>
                  ) : (
                    <>
                      <p className="text-green-400 text-xs">✓ Camera enabled</p>
                      {/* Camera preview */}
                      {localStream && (
                        <div className="mx-auto w-24 h-24 rounded-lg overflow-hidden bg-gray-900">
                          <video
                            autoPlay
                            playsInline
                            muted
                            ref={(el) => { if (el && localStream) el.srcObject = localStream; }}
                            className="w-full h-full object-cover scale-x-[-1]"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Players List */}
          <div className="mb-6">
            <p className="text-white/50 text-sm mb-2">Players ({players.length})</p>
            <div className="space-y-2">
              {players.map((p: Player) => (
                <div key={p.id} className="flex items-center gap-3 bg-white/5 p-2 rounded-lg">
                  <img src={getAvatarUrl(p.avatarSeed, p.characterStyle)} className="w-8 h-8 rounded-full bg-white" />
                  <span className="text-white font-medium">{p.name}</span>
                  {p.isHost && <span className="text-gold text-xs">(Host)</span>}
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
  // MOBILE-FIRST GAME SCREEN
  // ============================================
  return (
    <div className="min-h-screen bg-felt text-white font-sans bg-texture flex flex-col">

      {/* Tutorial Overlay - shows when game first starts */}
      {showTutorial && gameState.phase !== 'LOBBY' && (
        <GameTutorial onComplete={() => setShowTutorial(false)} />
      )}

      {/* Video Spotlight Overlay - shows during CLUES phase when video is enabled */}
      {isVideoEnabled && gameState.phase === 'CLUES' && !isMyTurn && (
        <VideoChat
          mode="spotlight"
          players={gameState.players}
          currentPlayerId={playerId}
          spotlightPlayerId={gameState.turnOrder[gameState.currentTurnIndex]}
          localStream={localStream || undefined}
          remoteStreams={remoteStreams}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
        />
      )}

      {/* Side Menu */}
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        players={gameState.players}
      />

      {/* Side Menu Toggle Button */}
      {gameState.phase !== 'LOBBY' && !isSideMenuOpen && (
        <SideMenuToggle onClick={() => setIsSideMenuOpen(true)} />
      )}

      {/* Compact Header */}
      <header className="flex justify-between items-center p-3 bg-black/30 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-gold text-xs font-bold">ROOM</span>
          <span className="font-mono text-lg text-white tracking-wider">{roomCode}</span>
        </div>
        <div className="flex items-center gap-2">
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

        {/* PLAYING PHASE */}
        {gameState.phase !== 'LOBBY' && gameState.topic && (
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

            {/* VOTING PHASE */}
            {gameState.phase === 'VOTING' && (
              <div className="space-y-4">
                {/* Video Table for Discussion */}
                {isVideoEnabled && (
                  <VideoChat
                    mode="table"
                    players={gameState.players}
                    currentPlayerId={playerId}
                    localStream={localStream || undefined}
                    remoteStreams={remoteStreams}
                    onToggleMic={toggleMic}
                    onToggleCamera={toggleCamera}
                    isMicOn={isMicOn}
                    isCameraOn={isCameraOn}
                  />
                )}

                <div className="bg-red-900/60 p-4 rounded-xl border border-red-500/30">
                  <p className="text-center text-xs text-white/50 mb-2">Round {gameState.currentRound} of {gameState.maxRounds}</p>
                  <h3 className="text-center text-lg font-bold mb-4">🔍 WHO IS THE CHAMELEON?</h3>
                  {!currentPlayer.votedFor ? (
                    <div className="space-y-2">
                      {Object.values(gameState.players)
                        .filter((p: Player) => !p.isEliminated && p.id !== playerId)
                        .map((p: Player) => (
                          <button
                            key={p.id}
                            onClick={() => submitVote(roomCode, playerId, p.id)}
                            className="w-full bg-white/10 hover:bg-red-500 active:bg-red-600 p-4 rounded-lg flex items-center gap-3 transition"
                          >
                            <img src={getAvatarUrl(p.avatarSeed, p.characterStyle)} className="w-10 h-10 rounded-full bg-white" />
                            <span className="font-bold text-lg">{p.name}</span>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <p className="text-center text-white/60">✓ Vote submitted. Waiting for others...</p>
                  )}
                </div>
              </div>
            )}

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

            {/* GUESSING PHASE - Chameleon guesses after all clues */}
            {gameState.phase === 'GUESSING' && (
              <div className="bg-purple-900/60 p-4 rounded-xl border border-purple-500/30">
                {myRole === 'CHAMELEON' ? (
                  <div className="space-y-4">
                    <h3 className="text-center text-lg font-bold">🦎 YOUR TURN TO GUESS!</h3>
                    <p className="text-center text-sm opacity-70">
                      Guess the secret word to win instantly.
                      {gameState.chameleonGuess && <span className="block text-red-300 mt-1">Wrong! Moving to voting...</span>}
                    </p>
                    {!gameState.chameleonGuess && (
                      <div className="grid grid-cols-4 gap-2">
                        {gameState.topic.words.map((word) => (
                          <button
                            key={word}
                            onClick={() => submitChameleonGuess(roomCode, word, gameState.topic!.words[gameState.secretWordIndex!])}
                            className="bg-white/10 active:bg-purple-500 p-3 rounded text-xs font-bold transition"
                          >
                            {word}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    <h3 className="text-lg font-bold mb-2">🤔 CHAMELEON IS GUESSING...</h3>
                    <p className="animate-pulse opacity-70">Will they figure out the secret word?</p>
                  </div>
                )}
              </div>
            )}

            {/* GAME OVER */}
            {gameState.phase === 'GAME_OVER' && (
              <div className="bg-gold p-6 rounded-xl text-center">
                <h2 className="text-3xl font-black text-feltDark mb-2">
                  {gameState.winner === 'CHAMELEON' ? '🦎 CHAMELEON WINS!' : '👮 INNOCENTS WIN!'}
                </h2>
                <p className="text-feltDark font-medium mb-2">
                  The word was: <strong>{gameState.topic.words[gameState.secretWordIndex!]}</strong>
                </p>
                {gameState.chameleonGuess && (
                  <p className="text-feltDark/70 text-sm mb-4">Chameleon guessed: {gameState.chameleonGuess}</p>
                )}

                {/* Scoreboard */}
                <div className="bg-feltDark/10 rounded-lg p-3 mb-4">
                  <h4 className="text-feltDark font-bold text-sm mb-2">📊 SCORES</h4>
                  <div className="space-y-1">
                    {Object.values(gameState.players)
                      .sort((a: Player, b: Player) => (b.score || 0) - (a.score || 0))
                      .map((p: Player) => (
                        <div key={p.id} className="flex justify-between items-center text-feltDark text-sm">
                          <span className={`${p.role === 'CHAMELEON' ? 'font-bold' : ''} ${p.isEliminated ? 'line-through opacity-50' : ''}`}>
                            {p.name} {p.role === 'CHAMELEON' && '🦎'}
                          </span>
                          <span className="font-bold">{p.score || 0} pts</span>
                        </div>
                      ))}
                  </div>
                </div>

                {currentIsHost && (
                  <button
                    onClick={() => resetGame(roomCode)}
                    className="bg-feltDark text-white px-8 py-3 rounded-full font-bold active:scale-95 transition"
                  >
                    Play Again
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom-Anchored Clue Input */}
      {gameState.phase === 'CLUES' && isMyTurn && (
        <div className="fixed bottom-0 left-0 right-0 bg-feltDark border-t border-white/20 p-4 safe-area-inset-bottom">
          <p className="text-gold text-center text-sm font-bold mb-2">🎤 YOUR TURN!</p>
          <div className="flex gap-2">
            <input
              value={clueInput}
              onChange={e => setClueInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClueSubmit()}
              placeholder="One word clue..."
              className="flex-1 p-4 rounded-xl text-gray-900 font-bold text-lg outline-none"
              maxLength={20}
              autoFocus
            />
            <button
              onClick={handleClueSubmit}
              className="bg-gold text-feltDark font-bold px-6 rounded-xl active:scale-95 transition"
            >
              SEND
            </button>
          </div>
          {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
        </div>
      )}

      {/* Live Chat when not your turn */}
      {gameState.phase === 'CLUES' && !isMyTurn && (
        <div className="fixed bottom-0 left-0 right-0 bg-feltDark border-t border-white/20 p-3 safe-area-inset-bottom">
          <p className="text-white/50 text-center text-xs mb-2">
            Waiting for <strong className="text-gold">{gameState.players[gameState.turnOrder[gameState.currentTurnIndex]]?.name}</strong>...
          </p>
          <LiveChat
            messages={gameState.messages}
            currentPlayerId={playerId}
            onSendMessage={(text) => {
              const char = getCharacterById(selectedCharacterId);
              sendChatMessage(roomCode, playerId, playerName, char.style, text);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default App;