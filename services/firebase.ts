import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, update, push, Database, child, get, remove, onChildAdded } from 'firebase/database';
import { GameState, Player, TopicCard, GamePhase, RTCSignalData, MediaState } from '../types';
import { GRID_COORDS } from '../constants';

let app: FirebaseApp | undefined;
let db: Database | undefined;

export const initFirebase = (config: any) => {
  try {
    if (!getApps().length) {
      console.log("Initializing Firebase with config:", config.projectId);
      app = initializeApp(config);
      db = getDatabase(app);
      console.log("Firebase initialized successfully");
    } else {
      app = getApps()[0];
      db = getDatabase(app);
      console.log("Firebase already initialized");
    }
    return db;
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    throw error;
  }
};
// Generate a short, human-friendly room code (5 chars)
const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

// Create a new room (host doesn't need name yet)
export const createRoom = async (): Promise<{ roomCode: string }> => {
  if (!db) throw new Error("Database not initialized");

  // Generate short code and check for collision (rare but possible)
  let roomCode = generateRoomCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await get(ref(db, `rooms/${roomCode}`));
    if (!existing.exists()) break;
    roomCode = generateRoomCode();
    attempts++;
  }

  const initialState: GameState = {
    roomId: roomCode,
    phase: 'LOBBY',
    players: {},
    turnOrder: [],
    currentTurnIndex: 0,
    currentRound: 0,
    maxRounds: 1
  };

  await set(ref(db, `rooms/${roomCode}`), initialState);
  return { roomCode };
};

// Join a room (just enters the room, name comes later)
export const joinRoom = async (roomCode: string): Promise<{ roomCode: string, playerId: string }> => {
  if (!db) throw new Error("Database not initialized");

  const roomRef = ref(db, `rooms/${roomCode.toUpperCase()}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error("Room not found. Check the code and try again.");
  }

  // Generate a player ID but don't add to room yet (name comes later)
  const playerId = `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  return { roomCode: roomCode.toUpperCase(), playerId };
};

// Set player name and add them to the room
export const setPlayerName = async (
  roomCode: string,
  playerId: string,
  playerName: string,
  characterStyle: string = 'adventurer',
  avatarSeed: string = 'default',
  isHost: boolean = false
): Promise<void> => {
  if (!db) throw new Error("Database not initialized");

  const player: Player = {
    id: playerId,
    name: playerName,
    isHost,
    score: 0,
    avatarSeed, // Now uses the fixed seed from character
    characterStyle
  };

  await update(ref(db, `rooms/${roomCode}/players`), {
    [playerId]: player
  });
};

export const subscribeToRoom = (roomId: string, callback: (state: GameState) => void) => {
  if (!db) return () => { };
  const roomRef = ref(db, `rooms/${roomId}`);
  const unsubscribe = onValue(roomRef, (snapshot) => {
    const val = snapshot.val();
    if (val) callback(val);
  });
  return unsubscribe;
};

export const startGame = async (roomId: string, topic: TopicCard) => {
  if (!db) return;

  // 1. Determine Roles
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  const state = snapshot.val() as GameState;

  const playerIds = Object.keys(state.players);
  const chameleonIndex = Math.floor(Math.random() * playerIds.length);
  const chameleonId = playerIds[chameleonIndex];

  const updates: any = {};

  // Update Roles
  playerIds.forEach(pid => {
    updates[`players/${pid}/role`] = pid === chameleonId ? 'CHAMELEON' : 'CITIZEN';
    updates[`players/${pid}/clue`] = null; // Reset clues
    updates[`players/${pid}/votedFor`] = null; // Reset votes
    updates[`players/${pid}/isEliminated`] = false; // Everyone starts active
  });

  // 2. Determine Secret Word
  const secretIndex = Math.floor(Math.random() * 16);
  const secretCode = GRID_COORDS[secretIndex];

  // 3. Calculate max rounds based on player count
  // 3-4 players: 1 round, 5-6: 2 rounds, 7+: 3 rounds (capped)
  const playerCount = playerIds.length;
  let maxRounds = 1;
  if (playerCount >= 5 && playerCount <= 6) maxRounds = 2;
  else if (playerCount >= 7) maxRounds = 3;

  // 4. Set Game State
  updates['phase'] = 'CLUES';
  updates['topic'] = topic;
  updates['secretWordIndex'] = secretIndex;
  updates['secretCode'] = secretCode;
  updates['turnOrder'] = shuffleArray(playerIds);
  updates['currentTurnIndex'] = 0;
  updates['currentRound'] = 1;
  updates['maxRounds'] = maxRounds;
  updates['lastEliminated'] = null;
  updates['winner'] = null;
  updates['chameleonGuess'] = null;

  await update(roomRef, updates);
};

export const submitClue = async (roomId: string, playerId: string, clue: string, nextTurnIndex: number, isLast: boolean) => {
  if (!db) return;
  const updates: any = {};
  updates[`players/${playerId}/clue`] = clue;

  if (isLast) {
    // After clues, chameleon gets to guess the word first
    updates['phase'] = 'GUESSING';
  } else {
    updates['currentTurnIndex'] = nextTurnIndex;
  }

  await update(ref(db, `rooms/${roomId}`), updates);
};

export const submitVote = async (roomId: string, voterId: string, accusedId: string) => {
  if (!db) return;

  // 1. Submit the vote
  await update(ref(db, `rooms/${roomId}/players/${voterId}`), { votedFor: accusedId });

  // 2. Get full game state
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;
  const players = state.players;

  // Count active (non-eliminated) players and their votes
  const activePlayers = Object.values(players).filter(p => !p.isEliminated);
  const activeVotes = activePlayers.filter(p => p.votedFor).length;

  // Only process if everyone has voted
  if (activeVotes < activePlayers.length) return;

  // 3. Tally votes (only count votes from active players)
  const voteCounts: Record<string, number> = {};
  let maxVotes = 0;

  activePlayers.forEach(p => {
    if (p.votedFor) {
      voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
      if (voteCounts[p.votedFor] > maxVotes) maxVotes = voteCounts[p.votedFor];
    }
  });

  // 4. Find who got the most votes (handle ties by picking random)
  const topVotedIds = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);
  const eliminatedId = topVotedIds[Math.floor(Math.random() * topVotedIds.length)];
  const eliminatedPlayer = players[eliminatedId];

  // Find chameleon
  const chameleonId = Object.values(players).find(p => p.role === 'CHAMELEON')?.id || '';

  // 5. Check if chameleon was caught
  if (eliminatedId === chameleonId) {
    // Chameleon caught! Innocents win (chameleon already had their guess chance)
    // Calculate scores
    const scoreUpdates: any = {};
    Object.keys(players).forEach(pid => {
      const player = players[pid];
      let scoreChange = 0;

      if (player.role === 'CHAMELEON') {
        scoreChange -= 3; // Caught penalty
      } else {
        if (player.isEliminated) {
          scoreChange -= 1; // Was voted out
        }
        if (player.votedFor === chameleonId) {
          scoreChange += 2; // Correctly voted for chameleon
        }
      }
      scoreUpdates[`players/${pid}/score`] = (player.score || 0) + scoreChange;
    });

    await update(ref(db, `rooms/${roomId}`), {
      ...scoreUpdates,
      phase: 'GAME_OVER',
      winner: 'CITIZENS',
      lastEliminated: eliminatedId
    });
    return;
  }

  // 6. Innocent was eliminated - mark them as eliminated
  const updates: any = {};
  updates[`players/${eliminatedId}/isEliminated`] = true;
  updates['lastEliminated'] = eliminatedId;

  // 7. Check end conditions
  const remainingActive = activePlayers.length - 1; // After this elimination
  const currentRound = state.currentRound || 1;
  const maxRounds = state.maxRounds || 1;

  // Chameleon wins if: only 2 players left OR max rounds reached
  if (remainingActive <= 2 || currentRound >= maxRounds) {
    // Calculate chameleon winning scores
    Object.keys(players).forEach(pid => {
      const player = players[pid];
      let scoreChange = 0;
      if (player.role === 'CHAMELEON') {
        scoreChange += currentRound * 2; // Survival bonus per round
      } else if (player.isEliminated || eliminatedId === pid) {
        scoreChange -= 1; // Was voted out
      }
      updates[`players/${pid}/score`] = (player.score || 0) + scoreChange;
    });

    updates['phase'] = 'GAME_OVER';
    updates['winner'] = 'CHAMELEON';
    await update(ref(db, `rooms/${roomId}`), updates);
    return;
  }

  // 8. Continue to next round - reset votes and clues, update turn order
  const stillActiveIds = Object.keys(players).filter(
    pid => pid !== eliminatedId && !players[pid].isEliminated
  );

  // Reset votes and clues for all active players
  stillActiveIds.forEach(pid => {
    updates[`players/${pid}/votedFor`] = null;
    updates[`players/${pid}/clue`] = null;
  });

  updates['turnOrder'] = shuffleArray(stillActiveIds);
  updates['currentTurnIndex'] = 0;
  updates['currentRound'] = currentRound + 1;
  updates['phase'] = 'ELIMINATION'; // Brief pause to show who was eliminated

  await update(ref(db, `rooms/${roomId}`), updates);
};

// Helper to continue after elimination display
export const continueAfterElimination = async (roomId: string) => {
  if (!db) return;
  await update(ref(db, `rooms/${roomId}`), { phase: 'CLUES' });
};

// Chameleon guesses the word (after clues phase)
// If correct → Chameleon wins, if wrong → continue to voting
export const submitChameleonGuess = async (roomId: string, guessWord: string, actualWord: string) => {
  if (!db) return;

  const isCorrect = guessWord.toLowerCase().trim() === actualWord.toLowerCase().trim();

  if (isCorrect) {
    // Chameleon wins by guessing correctly!
    // Calculate scores at game end
    const snapshot = await get(ref(db, `rooms/${roomId}`));
    const state = snapshot.val() as GameState;

    const scoreUpdates: any = {};
    Object.keys(state.players).forEach(pid => {
      const player = state.players[pid];
      let scoreChange = 0;
      if (player.role === 'CHAMELEON') {
        scoreChange += 5; // Guessed word correctly
        scoreChange += (state.currentRound - 1) * 2; // +2 per round survived
      }
      // Innocents get no points when chameleon guesses correctly
      scoreUpdates[`players/${pid}/score`] = (player.score || 0) + scoreChange;
    });

    await update(ref(db, `rooms/${roomId}`), {
      ...scoreUpdates,
      phase: 'GAME_OVER',
      winner: 'CHAMELEON',
      chameleonGuess: guessWord
    });
  } else {
    // Wrong guess - continue to voting phase
    await update(ref(db, `rooms/${roomId}`), {
      chameleonGuess: guessWord,
      phase: 'VOTING'
    });
  }
};

// Calculate and apply scores at game end
const calculateEndGameScores = async (roomId: string, winner: 'CHAMELEON' | 'CITIZENS', caughtChameleonId: string | null) => {
  if (!db) return;

  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;

  const scoreUpdates: any = {};
  const chameleonId = Object.values(state.players).find(p => p.role === 'CHAMELEON')?.id;

  Object.keys(state.players).forEach(pid => {
    const player = state.players[pid];
    let scoreChange = 0;

    if (player.role === 'CHAMELEON') {
      if (winner === 'CHAMELEON') {
        scoreChange += (state.currentRound - 1) * 2; // Survival bonus per round
      } else {
        scoreChange -= 3; // Caught penalty
      }
    } else {
      // Innocent
      if (player.isEliminated) {
        scoreChange -= 1; // Was voted out
      }
      if (player.votedFor === chameleonId && winner === 'CITIZENS') {
        scoreChange += 2; // Correctly voted for chameleon
      }
    }

    scoreUpdates[`players/${pid}/score`] = (player.score || 0) + scoreChange;
  });

  return scoreUpdates;
};

// Send a chat message
export const sendChatMessage = async (
  roomId: string,
  playerId: string,
  playerName: string,
  characterStyle: string,
  text: string
) => {
  if (!db || !text.trim()) return;

  const messageRef = push(ref(db, `rooms/${roomId}/messages`));
  await set(messageRef, {
    id: messageRef.key,
    playerId,
    playerName,
    characterStyle,
    text: text.trim(),
    timestamp: Date.now()
  });
};

export const resetGame = async (roomId: string) => {
  if (!db) return;
  await update(ref(db, `rooms/${roomId}`), { phase: 'LOBBY', topic: null, secretCode: null, messages: null });
};

// ============================================
// WebRTC Signaling Functions
// ============================================

/**
 * Send a WebRTC signaling message to another player
 */
export const sendSignal = async (
  roomId: string,
  fromId: string,
  toId: string,
  type: 'offer' | 'answer' | 'ice-candidate',
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit
): Promise<void> => {
  if (!db) return;

  const signalData: RTCSignalData = {
    type,
    from: fromId,
    to: toId,
    payload,
    timestamp: Date.now()
  };

  const signalRef = push(ref(db, `rooms/${roomId}/signals/${toId}`));
  await set(signalRef, signalData);
};

/**
 * Subscribe to incoming signals for a player
 */
export const subscribeToSignals = (
  roomId: string,
  playerId: string,
  callback: (signal: RTCSignalData) => void
): (() => void) => {
  if (!db) return () => { };

  const signalsRef = ref(db, `rooms/${roomId}/signals/${playerId}`);

  const unsubscribe = onChildAdded(signalsRef, async (snapshot) => {
    const signal = snapshot.val() as RTCSignalData;
    if (signal) {
      callback(signal);
      // Remove the signal after processing
      await remove(snapshot.ref);
    }
  });

  return unsubscribe;
};

/**
 * Update a player's media state (camera/mic on/off)
 */
export const updateMediaState = async (
  roomId: string,
  playerId: string,
  mediaState: MediaState
): Promise<void> => {
  if (!db) return;

  await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
    mediaState
  });
};

/**
 * Clear all signals for a room (cleanup on game end)
 */
export const clearSignals = async (roomId: string): Promise<void> => {
  if (!db) return;
  await remove(ref(db, `rooms/${roomId}/signals`));
};

function shuffleArray(array: string[]) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}
