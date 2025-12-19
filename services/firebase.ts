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
  // 3-5 players: 1 round, 6-8: 2 rounds, 9 players: 3 rounds
  const playerCount = playerIds.length;
  let maxRounds = 1;
  if (playerCount >= 6 && playerCount <= 8) maxRounds = 2;
  else if (playerCount >= 9) maxRounds = 3;

  // 4. Set Game State - start with TOPIC_VOTE phase
  updates['phase'] = 'TOPIC_VOTE';
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
  updates['topicVotes'] = null; // Clear any previous votes
  updates['timerStartedAt'] = null; // Timer will be set when CLUES phase starts
  updates['clueTimerExpired'] = null; // Reset clue timer tracking
  updates['overallWinner'] = null; // Reset overall winner tracking

  await update(roomRef, updates);
};

// Submit a topic vote (true = keep, false = skip)
export const submitTopicVote = async (roomId: string, playerId: string, keepTopic: boolean) => {
  if (!db) return;

  // Record this player's vote
  await update(ref(db, `rooms/${roomId}/topicVotes`), {
    [playerId]: keepTopic
  });

  // Check if all players have voted
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;
  const playerCount = Object.keys(state.players).length;
  const voteCount = state.topicVotes ? Object.keys(state.topicVotes).length : 0;

  // If all voted, resolve the vote
  if (voteCount >= playerCount) {
    const votes = state.topicVotes || {};
    const skipVotes = Object.values(votes).filter(v => v === false).length;

    // If half or more vote against, signal to swap topic (handled by App.tsx)
    if (skipVotes >= playerCount / 2) {
      // Topic rejected - App.tsx will detect this and pick a new topic
      await update(ref(db, `rooms/${roomId}`), {
        phase: 'SETUP', // Go back to setup to pick a new topic
        topicVotes: null
      });
    } else {
      // Topic approved - proceed to CLUES phase
      await update(ref(db, `rooms/${roomId}`), {
        phase: 'CLUES',
        topicVotes: null,
        timerStartedAt: Date.now() // Start timer for first player's clue
      });
    }
  }
};

export const submitClue = async (roomId: string, playerId: string, clue: string, nextTurnIndex: number, isLast: boolean, wasLate: boolean = false) => {
  if (!db) return;

  // Get current state to check timer and apply penalties
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;

  const updates: any = {};
  updates[`players/${playerId}/clue`] = clue;
  updates[`players/${playerId}/clueSubmittedAt`] = Date.now();

  // Apply -1 point penalty if player went over 60 seconds
  if (wasLate) {
    const currentScore = state.players[playerId]?.score || 0;
    updates[`players/${playerId}/score`] = currentScore - 1;
    updates[`clueTimerExpired/${playerId}`] = true;
  }

  if (isLast) {
    // After all clues, show recap before voting
    updates['phase'] = 'CLUES_RECAP';
    updates['timerStartedAt'] = Date.now(); // Start recap timer
  } else {
    updates['currentTurnIndex'] = nextTurnIndex;
    updates['timerStartedAt'] = Date.now(); // Reset timer for next player
  }

  await update(ref(db, `rooms/${roomId}`), updates);
};

export const submitVote = async (
  roomId: string,
  voterId: string,
  accusedId: string,
  wasLate: boolean = false,
  secretWordGuess?: string // Chameleon's secret word guess (only matters if they evade)
) => {
  if (!db) return;

  // If auto-voting for self due to timeout, apply -2 penalty
  const updates: any = {};

  // 1. Submit the vote
  updates[`players/${voterId}/votedFor`] = accusedId;

  // Store chameleon's secret word guess (will be used if they evade)
  if (secretWordGuess) {
    updates[`players/${voterId}/secretWordGuess`] = secretWordGuess;
  }

  // Apply -2 penalty if voting for self (either by choice or timeout)
  if (accusedId === voterId) {
    const snapshot = await get(ref(db, `rooms/${roomId}/players/${voterId}`));
    const voter = snapshot.val() as Player;
    updates[`players/${voterId}/score`] = (voter?.score || 0) - 2;
  }

  await update(ref(db, `rooms/${roomId}`), updates);

  // 2. Get full game state
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;
  const players = state.players;

  // Count active (non-eliminated) players and their votes (everyone votes including chameleon)
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

  // Find chameleon
  const chameleonId = Object.values(players).find(p => p.role === 'CHAMELEON')?.id || '';

  // 5. Calculate vote scores for NON-CHAMELEON players (+2 correct, -2 incorrect)
  // The chameleon doesn't gain/lose points from voting - they vote to throw others off
  const scoreUpdates: any = {};
  const currentRound = state.currentRound || 1;

  activePlayers.forEach(p => {
    // Skip chameleon - they don't get scored on voting (voting to throw others off)
    if (p.role === 'CHAMELEON') return;

    // Skip if they voted for themselves (already penalized separately)
    if (p.votedFor === p.id) return;

    let scoreChange = 0;
    if (p.votedFor === chameleonId) {
      scoreChange += 2; // Correctly voted for chameleon
    } else {
      scoreChange -= 2; // Incorrectly voted
    }
    scoreUpdates[`players/${p.id}/score`] = (players[p.id].score || 0) + scoreChange;
  });

  // 6. Check if chameleon was caught (most votes)
  if (eliminatedId === chameleonId) {
    // Chameleon caught! Round ends
    await update(ref(db, `rooms/${roomId}`), {
      ...scoreUpdates,
      phase: 'GAME_OVER',
      winner: 'CITIZENS',
      lastEliminated: eliminatedId
    });

    // Check for overall winner (first to 20)
    await checkOverallWinner(roomId);
    return;
  }

  // 7. Chameleon evaded! Give evasion bonus
  // Evasion bonus: Round 1 = +2, Round 2 = +3, Round 3 = +5
  const evasionBonus = currentRound === 1 ? 2 : currentRound === 2 ? 3 : 5;
  let chameleonFinalScore = (players[chameleonId]?.score || 0) + evasionBonus;

  // Check chameleon's secret word guess (submitted during voting)
  const chameleonGuess = players[chameleonId]?.secretWordGuess || '';
  const secretWord = state.topic?.words[state.secretWordIndex || 0] || '';
  const guessCorrect = chameleonGuess.toLowerCase().trim() === secretWord.toLowerCase().trim();

  // +2 bonus for correct word guess
  if (guessCorrect && chameleonGuess) {
    chameleonFinalScore += 2;
  }

  scoreUpdates[`players/${chameleonId}/score`] = chameleonFinalScore;
  scoreUpdates['chameleonGuess'] = chameleonGuess || '(no guess)';

  // Mark who was eliminated (wrong person)
  scoreUpdates[`players/${eliminatedId}/isEliminated`] = true;
  scoreUpdates['lastEliminated'] = eliminatedId;

  // 8. Check if max rounds reached or too few players left
  const maxRounds = state.maxRounds || 1;
  const remainingActive = activePlayers.length - 1; // After this elimination

  if (currentRound >= maxRounds || remainingActive <= 2) {
    // Chameleon wins by surviving all rounds - go to GAME_OVER
    await update(ref(db, `rooms/${roomId}`), {
      ...scoreUpdates,
      phase: 'GAME_OVER',
      winner: 'CHAMELEON'
    });
  } else {
    // More rounds to play - show elimination screen then continue
    await update(ref(db, `rooms/${roomId}`), {
      ...scoreUpdates,
      phase: 'ELIMINATION'
    });
  }

  // Check for overall winner
  await checkOverallWinner(roomId);
};

// Check if any player has reached 20 points (overall game winner)
export const checkOverallWinner = async (roomId: string) => {
  if (!db) return;

  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;

  // Find player with 20+ points
  const winner = Object.values(state.players).find(p => (p.score || 0) >= 20);

  if (winner) {
    await update(ref(db, `rooms/${roomId}`), {
      overallWinner: winner.id
    });
  }
};

// Transition from CLUES_RECAP to VOTING phase
export const startVotingPhase = async (roomId: string) => {
  if (!db) return;
  await update(ref(db, `rooms/${roomId}`), {
    phase: 'VOTING',
    timerStartedAt: Date.now()
  });
};

// Helper to continue after elimination display - start next round
export const continueAfterElimination = async (roomId: string) => {
  if (!db) return;

  // Get current state to reset for next round
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;

  // Get active players
  const activePlayers = Object.values(state.players).filter(p => !p.isEliminated);
  const activeIds = activePlayers.map(p => p.id);

  const updates: any = {
    phase: 'CLUES',
    timerStartedAt: Date.now(),
    currentTurnIndex: 0,
    currentRound: (state.currentRound || 1) + 1,
    turnOrder: shuffleArray(activeIds),
    chameleonGuess: null
  };

  // Reset clues and votes for active players
  activeIds.forEach(pid => {
    updates[`players/${pid}/clue`] = null;
    updates[`players/${pid}/clueSubmittedAt`] = null;
    updates[`players/${pid}/votedFor`] = null;
  });

  await update(ref(db, `rooms/${roomId}`), updates);
};

// Chameleon guesses the secret word (after evading voters)
// If correct → +2 bonus. Then either continue to next round or end game.
export const submitChameleonGuess = async (roomId: string, guessWord: string, actualWord: string) => {
  if (!db) return;

  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;

  const isCorrect = guessWord.toLowerCase().trim() === actualWord.toLowerCase().trim();
  const chameleonId = Object.values(state.players).find(p => p.role === 'CHAMELEON')?.id;

  const updates: any = {
    chameleonGuess: guessWord
  };

  // +2 bonus for correct guess
  if (isCorrect && chameleonId) {
    const chameleonScore = state.players[chameleonId]?.score || 0;
    updates[`players/${chameleonId}/score`] = chameleonScore + 2;
  }

  const currentRound = state.currentRound || 1;
  const maxRounds = state.maxRounds || 1;
  const activePlayers = Object.values(state.players).filter(p => !p.isEliminated);

  // Check if game should end (max rounds reached or too few players)
  if (currentRound >= maxRounds || activePlayers.length <= 2) {
    // Game over - chameleon wins by surviving
    updates['phase'] = 'GAME_OVER';
    updates['winner'] = 'CHAMELEON';
  } else {
    // More rounds - show elimination result then continue
    updates['phase'] = 'ELIMINATION';
  }

  await update(ref(db, `rooms/${roomId}`), updates);

  // Check for overall winner (first to 20)
  await checkOverallWinner(roomId);
};

// Chameleon skips guessing (timeout or chooses not to guess)
export const skipChameleonGuess = async (roomId: string) => {
  if (!db) return;

  const snapshot = await get(ref(db, `rooms/${roomId}`));
  const state = snapshot.val() as GameState;

  const currentRound = state.currentRound || 1;
  const maxRounds = state.maxRounds || 1;
  const activePlayers = Object.values(state.players).filter(p => !p.isEliminated);

  const updates: any = {
    chameleonGuess: '(skipped)'
  };

  // Check if game should end
  if (currentRound >= maxRounds || activePlayers.length <= 2) {
    updates['phase'] = 'GAME_OVER';
    updates['winner'] = 'CHAMELEON';
  } else {
    updates['phase'] = 'ELIMINATION';
  }

  await update(ref(db, `rooms/${roomId}`), updates);
  await checkOverallWinner(roomId);
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

/**
 * End the room completely (host only) - removes the entire room
 */
export const endRoom = async (roomId: string): Promise<void> => {
  if (!db) return;

  // First update phase to 'ENDED' so all clients know
  await update(ref(db, `rooms/${roomId}`), {
    phase: 'ENDED'
  });

  // Then remove the room after a short delay to let clients react
  setTimeout(async () => {
    await remove(ref(db, `rooms/${roomId}`));
  }, 2000);
};

/**
 * Remove a player from the room (for leaving)
 */
export const leaveRoom = async (roomId: string, playerId: string): Promise<void> => {
  if (!db) return;

  // Remove player from room
  await remove(ref(db, `rooms/${roomId}/players/${playerId}`));

  // Remove from turn order if exists
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    const room = snapshot.val();
    if (room.turnOrder) {
      const newTurnOrder = room.turnOrder.filter((id: string) => id !== playerId);
      await update(roomRef, { turnOrder: newTurnOrder });
    }
  }

  // Clear their signals
  await remove(ref(db, `rooms/${roomId}/signals/${playerId}`));
};

function shuffleArray(array: string[]) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}
