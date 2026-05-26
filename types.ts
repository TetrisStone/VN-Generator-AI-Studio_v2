
export interface SceneCharacterConfig {
  characterId: string;
  roleInScene?: string;
}

export interface SceneEffect {
  type: 'scene' | 'transition' | 'battle';
  targetId: string;
  action: 'unlock' | 'lock';
}

export interface RelationshipTrigger {
    id: string;
    description: string;
    valueChange: number;
}

export interface RelationshipThreshold {
    id: string;
    label: string;
    valueStart: number;
    description: string;
}

export interface RelationshipConfig {
    enabled: boolean;
    currentValue: number;
    startValue: number;
    triggers: RelationshipTrigger[];
    thresholds: RelationshipThreshold[];
}

export interface WeaponConfig {
    name: string;
    at: number;
    mod: number;
    dmg: number;
    cap: number | null;
}

export interface CombatStats {
    pra: number;
    str: number;
    wid: number;
    ges: number;
    wil: number;
    hp: number;
    maxHp: number;
    limit: number;
    recoveryRate: number;
    weapon: WeaponConfig;
}

export interface Character {
  id: string;
  name: string;
  defaultDescription: string;
  lore?: string;
  
  // Visuals
  rpgColor: string;
  imageSrc: string | null; // Idle / Standard
  emotions?: {
    happy?: string | null;
    angry?: string | null;
    thoughtful?: string | null;
    shy?: string | null;
    sad?: string | null;
    shocked?: string | null;
    worried?: string | null;
    lustful?: string | null;
  };
  mapSpriteSrc: string | null;
  bubbleColor?: string;
  isItalic?: boolean;
  
  // Relationships
  playerRelation?: string;
  relationship?: RelationshipConfig;

  // Combat / RPG Stats
  stats?: CombatStats;
  
  // Battle Visuals
  battleIdleSrc?: string | null;
  battlePrepSrc?: string | null;
  battleHitSrc?: string | null;
  battleIdleScale?: number;
  battleIdleOffsetX?: number;
  battleIdleOffsetY?: number;
  
  battlePrepScale?: number;
  battlePrepOffsetX?: number;
  battlePrepOffsetY?: number;
  
  battleHitScale?: number;
  battleHitOffsetX?: number;
  battleHitOffsetY?: number;
  
  battleScale?: number; // fallback

  // Battle Audio SFX
  sfxWeaponHit?: string | null;
  sfxWeaponMiss?: string | null;
  sfxVoiceHit?: string | null;
  sfxVoiceCrit?: string | null;
  sfxVoiceDeath?: string | null;

  woozySprites?: string[];
  finishSprite?: string | null;
  finishAnimation?: string[];
}

export interface Scene {
  id: string;
  chapterId?: string;
  name: string;
  
  locationName?: string; 
  backgroundSrc: string | null; 
  introVideoSrc?: string | null;
  description: string; 
  aiInstructions?: string; 
  sensoryDetails?: string; 
  environmentDetails?: string;
  
  goal: string; 
  characters: SceneCharacterConfig[];
  effects?: SceneEffect[]; 
  
  mapIconSrc?: string | null; 
  isRepeatable?: boolean;
  bgmUrl?: string;
  
  // NEU: Szenen-spezifisches Lore-Scoping
  relevantFactionIds?: string[];      // IDs aus WorldInfo.factions
  relevantLocationIds?: string[];     // IDs aus WorldInfo.loreLocations
}

export type CharacterEmotion = 'idle' | 'happy' | 'angry' | 'thoughtful' | 'shy' | 'sad' | 'shocked' | 'worried' | 'lustful';

export interface ChatMessage {
  sender: 'user' | 'model' | 'system';
  characterId?: string;
  emotion?: CharacterEmotion;
  text: string;
  timestamp: number;
}

export interface TokenStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIResponse {
  characterResponses: {
    characterId: string;
    emotion?: CharacterEmotion;
    text: string;
  }[];
  relationshipUpdates?: {
    characterId: string;
    change: number;
    reason: string;
  }[];
  sceneGoalReached: boolean;
  sceneTransitionReason?: string;
  tokenStats?: TokenStats;
  rawResponseText?: string;
}

export interface Faction {
    id: string;
    name: string;
    description: string;
}

export interface WorldLocation {
    id: string;
    name: string;
    description: string;
}

export interface WorldInfo {
  description: string;
  factions: Faction[];
  loreLocations: WorldLocation[];
  systemInstruction?: string;
  diceConfig?: { skins: Record<number, string[]> };
  llmProvider?: 'gemini' | 'ollama';
  llmModel?: string;
  ollamaUrl?: string;
}

export interface Chapter {
  id: string;
  name: string;
  description: string;
}

export interface MapSpot {
  id: string;
  x: number;
  y: number;
  type: 'scene' | 'character' | 'battle' | 'transition';
  sceneId?: string;
  characterId?: string;
  battleId?: string;
  targetMapId?: string;
  visualCharacterId?: string;
}

export interface WorldMap {
  id: string;
  name: string;
  backgroundSrc: string | null;
  bgmUrl?: string;
  spots: MapSpot[];
}

export interface Battle {
  id: string;
  name: string;
  chapterId?: string;
  backgroundSrc: string | null;
  playerCharacterIds: string[];
  enemyCharacterIds: string[];
  isRepeatable: boolean;
  bgmUrl?: string;
  onWinEffect?: SceneEffect[];
}

export interface StoryLogEntry {
    id: string;
    sceneName: string;
    locationName: string;
    charactersInvolved: string[]; // Names
    summary: string;
    timestamp: number;
}

export interface RPGState {
    currentMapId: string;
    completedSceneIds: string[];
    completedBattleIds: string[];
    unlockedIds: string[];
    hiddenIds: string[];
    ongoingScenes: Record<string, ChatMessage[]>;
    storyLog: StoryLogEntry[]; // New history field
}

export interface GameState {
  currentSceneIndex: number;
  history: ChatMessage[];
  isProcessing: boolean;
  gameOver: boolean;
  timestamp?: number;
  rpgState?: RPGState;
  vnState?: any;
}

export interface GameSaveData {
    rpgState: RPGState;
    vnState: any | null;
    characterState?: Record<string, Partial<Character>>;
    timestamp: number;
}

export type Zone = 'head' | 'torso' | 'arm' | 'leg';
