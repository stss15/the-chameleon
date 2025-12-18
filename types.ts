export type PlayerRole = 'CHAMELEON' | 'CITIZEN';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  role?: PlayerRole;
  score: number;
  avatarSeed: string; // For generating consistent avatars
  characterStyle: string; // DiceBear style (adventurer, pixel-art, etc.)
  clue?: string;
  votedFor?: string; // ID of player they voted for
  isEliminated?: boolean; // For multi-round elimination
  mediaState?: MediaState; // Camera/mic status for video chat
}

// Media state for video chat
export interface MediaState {
  isCameraOn: boolean;
  isMicOn: boolean;
}

// WebRTC signaling data stored in Firebase
export interface RTCSignalData {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

export interface TopicCard {
  category: string;
  words: string[]; // Should be 16 words (4x4)
}

export type GamePhase =
  | 'LOBBY'
  | 'SETUP'
  | 'TOPIC_VOTE'  // New: players vote on whether to keep the topic
  | 'CLUES'
  | 'VOTING'
  | 'ELIMINATION' // New: showing who was eliminated
  | 'GUESSING' // Chameleon guesses the word
  | 'GAME_OVER'
  | 'ENDED'; // Host ended the session

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Record<string, Player>;
  topic?: TopicCard;
  secretCode?: string; // e.g., "A3"
  secretWordIndex?: number; // 0-15
  turnOrder: string[];
  currentTurnIndex: number;
  currentRound: number; // 1, 2, 3, etc.
  maxRounds: number; // Based on player count
  lastEliminated?: string; // Player ID of last eliminated player
  winner?: 'CHAMELEON' | 'CITIZENS';
  chameleonGuess?: string;
  messages?: Record<string, ChatMessage>; // Live chat messages
  topicVotes?: Record<string, boolean>; // playerId -> true (keep) or false (skip)
}

// Chat message for live feed
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  characterStyle: string;
  text: string;
  timestamp: number;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}