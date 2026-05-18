
import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Editor } from './components/Editor';
import { Player } from './components/Player';
import { RPGWorld } from './components/RPGWorld';
import { BattleArena } from './components/BattleArena';
import { StoryJournal } from './components/StoryJournal';
import { SettingsOverlay } from './components/SettingsOverlay';
import { audioManager } from './utils/audioManager';
import { Character, Scene, GameSaveData, RPGState, WorldMap, ChatMessage, Battle, WorldInfo, Chapter, StoryLogEntry } from './types';
import { getItem, setItem, getProjectItem, setProjectItem } from './utils/db';
import { loadImage, saveImage } from './utils/imageStorage';
import JSZip from 'jszip';
import { generateSceneSummary } from './services/geminiService';
import { Loader2 } from 'lucide-react';
import { extractImagesFromProject } from './utils/migrateImages';

// Default Data for quick start
const DEFAULT_CHARS: Character[] = [
  { 
    id: '1', 
    name: 'Aiko', 
    defaultDescription: 'A cheerful and curious android girl who loves learning about humans.', 
    lore: 'Created by the Cyber-Lotus corporation, Aiko was discarded for being "too empathetic".',
    playerRelation: 'Curious about the player, treats them like a mentor or older sibling.',
    imageSrc: null,
    mapSpriteSrc: null,
    battleIdleSrc: null,
    battlePrepSrc: null,
    battleHitSrc: null,
    battleScale: 1,
    rpgColor: '#f472b6', 
    bubbleColor: '#db2777', 
    isItalic: false,
    stats: {
        pra: 3, str: 3, wid: 2, ges: 4, wil: 3,
        hp: 18, maxHp: 18, limit: 6,
        recoveryRate: 5,
        weapon: { name: 'Energy Dagger', at: 5, mod: 2, dmg: 1, cap: 3 }
    }
  },
  { 
    id: '2', 
    name: 'Kael', 
    defaultDescription: 'A grumpy but skilled mechanic who fixes robots.', 
    lore: 'An ex-military engineer who left the service after the Neon Wars.',
    playerRelation: 'Distrustful at first, but respects competence. Owes the player a small favor.',
    imageSrc: null,
    mapSpriteSrc: null,
    battleIdleSrc: null,
    battlePrepSrc: null,
    battleHitSrc: null,
    battleScale: 1,
    rpgColor: '#60a5fa', 
    bubbleColor: '#2563eb', 
    isItalic: false,
    stats: {
        pra: 2, str: 5, wid: 4, ges: 2, wil: 4,
        hp: 24, maxHp: 24, limit: 12,
        recoveryRate: 5,
        weapon: { name: 'Giant Wrench', at: 2, mod: -1, dmg: 3, cap: null }
    }
  },
  {
    id: 'narrator',
    name: 'Chronicler',
    defaultDescription: 'The narrator of the story. Observes all but intervenes rarely.',
    imageSrc: null,
    mapSpriteSrc: null,
    battleIdleSrc: null,
    battlePrepSrc: null,
    battleHitSrc: null,
    battleScale: 1,
    rpgColor: '#fbbf24', 
    bubbleColor: '#d97706', 
    isItalic: true
  }
];

const DEFAULT_CHAPTERS: Chapter[] = [
  {
    id: 'ch1',
    name: 'Chapter 1: The Beginning',
    description: 'The heroes meet in the workshop. The world is dark and industrial.'
  }
];

const DEFAULT_SCENES: Scene[] = [
  {
    id: 's1',
    chapterId: 'ch1',
    name: 'The Workshop',
    locationName: 'Kael\'s Garage',
    backgroundSrc: null,
    description: 'A cluttered workshop filled with robot parts. Kael is working on a workbench. Aiko is watching closely.',
    aiInstructions: 'Kael is very busy and should act slightly annoyed by interruptions initially.',
    sensoryDetails: 'The air smells of burnt ozone and machine oil. A rhythmic clanking comes from the back room.',
    environmentDetails: 'Ein rechteckiger Raum mit Betonboden. An der Nordwand steht eine massive Werkbank aus Eichenholz. Links ist ein Regal voller alter Transistoren. Rechts eine schwere Stahltür.',
    goal: 'Convince Kael to fix your broken radio.',
    characters: [
      { characterId: '1', roleInScene: 'Curious onlooker, wants to help but is clumsy.' },
      { characterId: '2', roleInScene: 'Busy, easily annoyed, does not want to be disturbed.' }
    ],
    effects: [],
    isRepeatable: false
  }
];

const DEFAULT_MAPS: WorldMap[] = [
  {
    id: 'map1',
    name: 'Main City',
    backgroundSrc: null,
    spots: [
      { id: 'spot1', type: 'character', characterId: '1', x: 50, y: 50 },
    ]
  }
];

const DEFAULT_BATTLES: Battle[] = [];
const DEFAULT_WORLD: WorldInfo = { 
    description: "A cyberpunk city ruled by corporations. Humans and androids live together but tensions are high.",
    factions: [
        { id: 'f1', name: 'Cyber-Lotus', description: 'The ruling mega-corporation controlling technology.' },
        { id: 'f2', name: 'The Rust', description: 'A resistance group living in the undercity.' }
    ],
    loreLocations: [
        { id: 'l1', name: 'Sector 7', description: 'The industrial district where the poor live.' }
    ],
    diceConfig: { skins: {} }
};

const PROJECT_STORAGE_KEY = 'vn_creator_project';
const GAME_SAVE_KEY = 'vn_creator_savegame';

const App: React.FC = () => {
  const [mode, setMode] = useState<'edit' | 'rpg' | 'vn' | 'battle'>('edit');
  
  // Data State
  const [worldInfo, setWorldInfo] = useState<WorldInfo>(DEFAULT_WORLD);
  const [chapters, setChapters] = useState<Chapter[]>(DEFAULT_CHAPTERS);
  const [characters, setCharacters] = useState<Character[]>(DEFAULT_CHARS);
  const [scenes, setScenes] = useState<Scene[]>(DEFAULT_SCENES);
  const [maps, setMaps] = useState<WorldMap[]>(DEFAULT_MAPS);
  const [battles, setBattles] = useState<Battle[]>(DEFAULT_BATTLES);
  
  // Game Play State
  const [rpgState, setRpgState] = useState<RPGState>({ 
    currentMapId: 'map1', 
    completedSceneIds: [],
    completedBattleIds: [],
    unlockedIds: [],
    hiddenIds: [],
    ongoingScenes: {},
    storyLog: [] // Init empty log
  });
  
  const [activeSceneIndex, setActiveSceneIndex] = useState<number>(-1);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [vnHistory, setVnHistory] = useState<ChatMessage[]>([]); 

  const [hasSaveGame, setHasSaveGame] = useState(false);
  
  // New States for Journal and Loading
  const [showJournal, setShowJournal] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Background Music State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentBgmUrl, setCurrentBgmUrl] = useState<string | undefined>(undefined);

  // Background Music Volume Sync
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = audioManager.bgmVolume;
    }
    const handleVolumeChange = (e: any) => {
        if (audioRef.current && e.detail !== undefined) {
            audioRef.current.volume = e.detail;
        }
    };
    window.addEventListener('bgmVolumeChanged', handleVolumeChange);
    return () => window.removeEventListener('bgmVolumeChanged', handleVolumeChange);
  }, []);

  // Check for save game on mount and migrate from LocalStorage if needed
  useEffect(() => {
    const initLoad = async () => {
        // 1. Check for Save Game
        const savedGame = await getItem<GameSaveData>(GAME_SAVE_KEY);
        if (savedGame) {
            setHasSaveGame(true);
            
            // If saved game has updated character states (relationships), load them into session
            if (savedGame.characterState) {
                setCharacters(prevChars => prevChars.map(c => {
                    const savedState = savedGame.characterState?.[c.id];
                    if (savedState) return { ...c, ...savedState };
                    return c;
                }));
            }
        }
        
        // 2. Load Project Data
        let hasData = false;
        let data: any = {};
        
        try {
            data.worldInfo = await getProjectItem('worldInfo');
            data.chapters = await getProjectItem('chapters');
            data.characters = await getProjectItem('characters');
            data.scenes = await getProjectItem('scenes');
            data.battles = await getProjectItem('battles');
            data.maps = await getProjectItem('maps');
            
            if (data.worldInfo || data.chapters || data.characters || data.scenes) {
                hasData = true;
            }
        } catch (e) {
            console.error("IDB load project error", e);
        }

        if (!hasData) {
            const lsProject = localStorage.getItem(PROJECT_STORAGE_KEY);
            let legacyData = await getItem(PROJECT_STORAGE_KEY); // check old keyval store too
            if (lsProject || legacyData) {
                try {
                    data = legacyData || JSON.parse(lsProject!);
                    hasData = true;
                } catch (e) {}
            }
        }

        // Apply Data
        if (data) {
            // Check for media migration
            const migrated = await getItem('mediaExtracted');
            if (!migrated) {
                console.log("Running media extraction migration...");
                setIsProcessing(true);
                try {
                    // Create backup
                    await setItem(`project_backup_${Date.now()}`, data);
                    
                    data = await extractImagesFromProject(data);
                    await setItem('mediaExtracted', true);
                    
                    // Persist migrated data to IDB immediately
                    await setProjectItem('worldInfo', data.worldInfo);
                    await setProjectItem('chapters', data.chapters);
                    await setProjectItem('characters', data.characters);
                    await setProjectItem('scenes', data.scenes);
                    await setProjectItem('battles', data.battles);
                    await setProjectItem('maps', data.maps);
                    
                } catch (e) {
                    console.error("Migration failed", e);
                } finally {
                    setIsProcessing(false);
                }
            }

            if (data.worldInfo) {
                // Migration: Ensure factions and loreLocations exist
                setWorldInfo({
                    description: data.worldInfo.description || '',
                    factions: data.worldInfo.factions || [],
                    loreLocations: data.worldInfo.loreLocations || [],
                    diceConfig: data.worldInfo.diceConfig || { skins: {} },
                    systemInstruction: data.worldInfo.systemInstruction || ''
                });
            }

            if (data.chapters) setChapters(data.chapters);
            else {
                // Ensure at least one chapter exists for migration
                setChapters(DEFAULT_CHAPTERS);
            }

            if (data.characters) setCharacters(data.characters);
            
            // Migration logic
            if (data.scenes) {
                const migratedScenes = data.scenes.map((s: any) => ({
                    ...s,
                    // If scene doesn't have a chapter, assign to first available chapter
                    chapterId: s.chapterId || DEFAULT_CHAPTERS[0].id,
                    effects: s.effects || s.unlocks || [],
                    isRepeatable: s.isRepeatable || false,
                    locationName: s.locationName || s.name || 'Unknown Location',
                    aiInstructions: s.aiInstructions || '',
                    sensoryDetails: s.sensoryDetails || '',
                    environmentDetails: s.environmentDetails || '',
                    relevantFactionIds: s.relevantFactionIds ?? undefined,
                    relevantLocationIds: s.relevantLocationIds ?? undefined,
                }));
                setScenes(migratedScenes);
            }

            if (data.battles) {
                const migratedBattles = data.battles.map((b: any) => ({
                    ...b,
                    chapterId: b.chapterId || DEFAULT_CHAPTERS[0].id
                }));
                setBattles(migratedBattles);
            }

            if (data.maps) setMaps(data.maps);
            else if (data.mapConfig) setMaps([{ ...data.mapConfig, id: 'map1', name: 'Default Map' }]);
        }
    };
    initLoad();
  }, []);

  const handleQuickSave = async () => {
    const data = { worldInfo, chapters, characters, scenes, maps, battles };
    await setProjectItem('worldInfo', data.worldInfo);
    await setProjectItem('chapters', data.chapters);
    await setProjectItem('characters', data.characters);
    await setProjectItem('scenes', data.scenes);
    await setProjectItem('battles', data.battles);
    await setProjectItem('maps', data.maps);
    return true;
  };

  const handleExportProject = async () => {
    setIsProcessing(true);
    try {
      const data = { worldInfo, chapters, characters, scenes, maps, battles };
      
      const zip = new JSZip();
      zip.file("project.json", JSON.stringify(data, null, 2));

      // Include all media
      const imagesFolder = zip.folder("images");
      const videosFolder = zip.folder("videos");
      const audioFolder = zip.folder("audio");

      if (imagesFolder && videosFolder && audioFolder) {
        const { listImageIds } = await import('./utils/imageStorage');
        const imageIds = await listImageIds();
        
        for (const id of imageIds) {
          const base64 = await loadImage(id);
          if (base64) {
            if (base64.startsWith('data:video/')) {
               videosFolder.file(`${id}.txt`, base64);
            } else if (base64.startsWith('data:audio/')) {
               audioFolder.file(`${id}.txt`, base64);
            } else {
               imagesFolder.file(`${id}.txt`, base64);
            }
          }
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const href = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = href;
      link.download = `vn-project-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (e) {
      console.error("Failed to export project: ", e);
      alert("Failed to export project.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportSave = async () => {
      const savedGame = await getItem<GameSaveData>(GAME_SAVE_KEY);
      if (!savedGame) {
          alert("No save game found!");
          return;
      }
      const jsonString = JSON.stringify(savedGame, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = href;
      link.download = `vn-savegame-${new Date().toISOString().slice(0,10)}.save.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
  };

  const handleImportSave = (file: File) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
            const content = e.target?.result as string;
            const data = JSON.parse(content) as GameSaveData;
            if (data.rpgState) {
                await setItem(GAME_SAVE_KEY, data);
                setHasSaveGame(true);
                alert("Save Game imported successfully! Click 'Continue' to play.");
            } else {
                throw new Error("Invalid Save Data format.");
            }
        } catch(error) {
            console.error("Save Import failed", error);
            alert("Failed to load save file. Invalid or corrupt save game.");
        }
      }
      reader.readAsText(file);
  };

  const handleImportProject = async (file: File) => {
    setIsProcessing(true);
    try {
      let data: any = null;

      if (file.name.endsWith('.zip')) {
        const zip = new JSZip();
        const unzipped = await zip.loadAsync(file);
        
        // Extract project.json
        const projectFile = unzipped.file("project.json");
        if (!projectFile) throw new Error("project.json not found in ZIP.");
        const content = await projectFile.async("text");
        data = JSON.parse(content);

        // Extract media
        const processMediaFolder = async (folderName: string) => {
          const folder = unzipped.folder(folderName);
          if (folder) {
              const promises: Promise<void>[] = [];
              folder.forEach((relativePath, zipObj) => {
                  if (!zipObj.dir && relativePath.endsWith('.txt')) {
                      const id = relativePath.replace('.txt', '');
                      promises.push(
                          zipObj.async("text").then(base64 => saveImage(id, base64))
                      );
                  }
              });
              await Promise.all(promises);
          }
        };
        await processMediaFolder("images");
        await processMediaFolder("videos");
        await processMediaFolder("audio");
      } else {
        // Fallback for legacy JSON imports
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        data = JSON.parse(content);
      }
      
      console.log("Running media extraction migration on imported project...");
      data = await extractImagesFromProject(data);
      // Let's also ensure mediaExtracted gets set so initLoad doesn't re-run it
      await setItem('mediaExtracted', true);
      
      if (data.worldInfo) {
           setWorldInfo({
              description: data.worldInfo.description || '',
              factions: data.worldInfo.factions || [],
              loreLocations: data.worldInfo.loreLocations || [],
              diceConfig: data.worldInfo.diceConfig || { skins: {} },
              systemInstruction: data.worldInfo.systemInstruction || ''
           });
      }
      
      // Handle Chapters import with fallback
      let importedChapters = data.chapters;
      if (!importedChapters || importedChapters.length === 0) {
          importedChapters = DEFAULT_CHAPTERS;
      }
      setChapters(importedChapters);

      if (data.characters) setCharacters(data.characters);
      if (data.scenes) {
          // Migration for import
          const migratedScenes = data.scenes.map((s: any) => ({
              ...s,
              chapterId: s.chapterId || importedChapters[0].id,
              effects: s.effects || s.unlocks || [],
              isRepeatable: s.isRepeatable || false,
              locationName: s.locationName || s.name || 'Unknown Location',
              aiInstructions: s.aiInstructions || '',
              sensoryDetails: s.sensoryDetails || '',
              environmentDetails: s.environmentDetails || '',
              relevantFactionIds: s.relevantFactionIds ?? undefined,
              relevantLocationIds: s.relevantLocationIds ?? undefined,
          }));
          setScenes(migratedScenes);
          data.scenes = migratedScenes;
      }
      
      if (data.battles) {
           const migratedBattles = data.battles.map((b: any) => ({
               ...b,
               chapterId: b.chapterId || importedChapters[0].id
           }));
           setBattles(migratedBattles);
           data.battles = migratedBattles;
      } else {
          setBattles([]);
          data.battles = [];
      }

      if (data.maps) setMaps(data.maps);
      else if (data.mapConfig) setMaps([{ ...data.mapConfig, id: 'map1', name: 'Default Map' }]);
      
      await setProjectItem('worldInfo', data.worldInfo);
      await setProjectItem('chapters', data.chapters);
      await setProjectItem('characters', data.characters);
      await setProjectItem('scenes', data.scenes);
      await setProjectItem('battles', data.battles);
      await setProjectItem('maps', data.maps);
      
      alert("Project loaded successfully!");
    } catch (error) {
      console.error("Import failed", error);
      alert("Failed to load project file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartNewGame = () => {
    // Reset Relationship Values to startValue for a new game
    const resetChars = characters.map(c => {
        if (c.relationship) {
            return { ...c, relationship: { ...c.relationship, currentValue: c.relationship.startValue } };
        }
        return c;
    });
    setCharacters(resetChars);

    setRpgState({ 
        currentMapId: maps[0].id, 
        completedSceneIds: [], 
        completedBattleIds: [],
        unlockedIds: [],
        hiddenIds: [],
        ongoingScenes: {},
        storyLog: [] 
    });
    setVnHistory([]);
    setActiveSceneIndex(-1);
    setActiveBattleId(null);
    setMode('rpg');
  };

  const handleContinueGame = async () => {
    let savedGame = await getItem<GameSaveData>(GAME_SAVE_KEY);
    if (savedGame) {
      try {
        const safeMapId = maps.find(m => m.id === savedGame!.rpgState.currentMapId) ? savedGame!.rpgState.currentMapId : maps[0].id;
        
        setRpgState({ 
            ...savedGame.rpgState, 
            currentMapId: safeMapId,
            completedBattleIds: savedGame.rpgState.completedBattleIds || [],
            unlockedIds: savedGame.rpgState.unlockedIds || [], 
            hiddenIds: savedGame.rpgState.hiddenIds || [], 
            ongoingScenes: savedGame.rpgState.ongoingScenes || {},
            storyLog: savedGame.rpgState.storyLog || []
        });

        // Apply saved character state (relationships)
        if (savedGame.characterState) {
            setCharacters(prevChars => prevChars.map(c => {
                const savedState = savedGame.characterState?.[c.id];
                // Deep merge relationship status
                if (savedState) return { ...c, ...savedState };
                return c;
            }));
        }
        
        if (savedGame.vnState) {
          setActiveSceneIndex(savedGame.vnState.currentSceneIndex);
          setVnHistory(savedGame.vnState.history);
          setMode('vn');
        } else {
          setMode('rpg');
        }
      } catch (e) {
        console.error("Corrupt save file");
        handleStartNewGame();
      }
    }
  };

  const handleSaveGameInternal = async (updatedRpgState: RPGState, vnState: any | null) => {
      // Create a map of character updates (mainly for relationships) to save
      const charStateMap: Record<string, Partial<Character>> = {};
      characters.forEach(c => {
          if (c.relationship) {
              charStateMap[c.id] = { relationship: c.relationship };
          }
      });

      const saveData: GameSaveData = {
        rpgState: updatedRpgState,
        vnState: vnState,
        characterState: charStateMap,
        timestamp: Date.now()
      };
      await setItem(GAME_SAVE_KEY, saveData);
      setHasSaveGame(true);
      return true;
  };

  const handleInteraction = (type: 'scene'|'transition'|'character'|'battle', id: string) => {
      // Check if locked/hidden first
      if (rpgState.hiddenIds.includes(id)) return;

      if (type === 'transition') {
          if (maps.find(m => m.id === id)) {
              setRpgState(prev => ({ ...prev, currentMapId: id }));
          }
      } else if (type === 'character') {
          const charId = id;
          const char = characters.find(c => c.id === charId);
          if (!char) return;

          const availableScenes = scenes.filter(s => s.characters.some(c => c.characterId === charId));
          
          const playableScene = availableScenes.find(s => {
              // Check visibility/lock logic strictly
              const isCompleted = rpgState.completedSceneIds.includes(s.id);
              if (isCompleted && !s.isRepeatable) return false;
              if (rpgState.hiddenIds.includes(s.id)) return false;
              
              const isLockedByOthers = scenes.some(other => other.effects?.some(u => u.type === 'scene' && u.targetId === s.id && u.action === 'unlock'));
              const isUnlocked = rpgState.unlockedIds.includes(s.id);

              return !isLockedByOthers || isUnlocked;
          });

          if (playableScene) {
             startScene(playableScene);
          } else {
             alert(`${char.name} has nothing new to say right now.`);
          }

      } else if (type === 'battle') {
         const battle = battles.find(b => b.id === id);
         if (battle) {
             setActiveBattleId(battle.id);
             setMode('battle');
         }
      } else {
          const scene = scenes.find(s => s.id === id);
          if (scene) startScene(scene);
      }
  };

  const startScene = (scene: Scene) => {
      const realIndex = scenes.findIndex(s => s.id === scene.id);
      setActiveSceneIndex(realIndex);
      
      const existingHistory = rpgState.ongoingScenes?.[scene.id] || [];
      setVnHistory(existingHistory);
      
      setMode('vn');
  };

  const handleSceneExit = async (completed: boolean, history: ChatMessage[]) => {
      const activeScene = scenes[activeSceneIndex];
      const sceneId = activeScene.id;
      
      let newState = { ...rpgState };

      if (completed) {
          // --- SUMMARY GENERATION ---
          setGeneratingSummary(true);
          // Only generate summary if it's the first completion OR repeatable?
          // Let's generate every time for now to keep a log of repeat visits.
          const summaryText = await generateSceneSummary(activeScene, characters, history);
          
          const newEntry: StoryLogEntry = {
              id: crypto.randomUUID(),
              sceneName: activeScene.name,
              locationName: activeScene.locationName || 'Unknown',
              charactersInvolved: activeScene.characters.map(sc => characters.find(c => c.id === sc.characterId)?.name || '?'),
              summary: summaryText,
              timestamp: Date.now()
          };
          
          setGeneratingSummary(false);

          const newCompletedIds = [...rpgState.completedSceneIds];
          if (!newCompletedIds.includes(sceneId)) newCompletedIds.push(sceneId);
          
          const { [sceneId]: _, ...remainingScenes } = newState.ongoingScenes || {};
          
          const newUnlockedIds = [...rpgState.unlockedIds];
          const newHiddenIds = [...rpgState.hiddenIds];

          if (activeScene.effects) {
              activeScene.effects.forEach(effect => {
                  const targetId = effect.targetId;
                  const action = effect.action || 'unlock'; 

                  if (action === 'unlock') {
                      if (!newUnlockedIds.includes(targetId)) newUnlockedIds.push(targetId);
                      const hideIdx = newHiddenIds.indexOf(targetId);
                      if (hideIdx > -1) newHiddenIds.splice(hideIdx, 1);
                  } else if (action === 'lock') {
                      if (!newHiddenIds.includes(targetId)) newHiddenIds.push(targetId);
                  }
              });
          }

          // Append to log without overwriting
          const newStoryLog = [...(rpgState.storyLog || []), newEntry];

          newState = { 
              ...newState, 
              completedSceneIds: newCompletedIds,
              unlockedIds: newUnlockedIds,
              hiddenIds: newHiddenIds,
              ongoingScenes: remainingScenes,
              storyLog: newStoryLog
          };

      } else {
          newState = {
              ...newState,
              ongoingScenes: { ...newState.ongoingScenes, [sceneId]: history }
          };
      }
      
      setRpgState(newState);
      await handleSaveGameInternal(newState, null);
      setMode('rpg');
  };

  const handleBattleFinish = (won: boolean) => {
      if (!activeBattleId) return;
      const battle = battles.find(b => b.id === activeBattleId);

      if (won && battle) {
          const newCompleted = [...rpgState.completedBattleIds];
          if (!newCompleted.includes(battle.id)) newCompleted.push(battle.id);

          const newUnlockedIds = [...rpgState.unlockedIds];
          const newHiddenIds = [...rpgState.hiddenIds];

          // Apply Win Effects
          if (battle.onWinEffect) {
              battle.onWinEffect.forEach(effect => {
                  const targetId = effect.targetId;
                  if (effect.action === 'unlock') {
                      if (!newUnlockedIds.includes(targetId)) newUnlockedIds.push(targetId);
                      const hideIdx = newHiddenIds.indexOf(targetId);
                      if (hideIdx > -1) newHiddenIds.splice(hideIdx, 1);
                  } else if (effect.action === 'lock') {
                      if (!newHiddenIds.includes(targetId)) newHiddenIds.push(targetId);
                  }
              });
          }

          setRpgState(prev => ({ 
              ...prev, 
              completedBattleIds: newCompleted,
              unlockedIds: newUnlockedIds,
              hiddenIds: newHiddenIds 
          }));
      }

      setMode('rpg');
      setActiveBattleId(null);
  };

  const handleUpdateJournal = (entryId: string, newSummary: string) => {
      const updatedLog = rpgState.storyLog.map(entry => 
          entry.id === entryId ? { ...entry, summary: newSummary } : entry
      );
      setRpgState(prev => ({ ...prev, storyLog: updatedLog }));
      // Auto-save changes
      handleSaveGameInternal({ ...rpgState, storyLog: updatedLog }, null);
  };

  const activeMap = maps.find(m => m.id === rpgState.currentMapId) || maps[0];
  const activeBattle = battles.find(b => b.id === activeBattleId);

  // Background Music Logic
  useEffect(() => {
    let targetBgm: string | undefined = undefined;

    if (mode === 'rpg') {
        targetBgm = activeMap?.bgmUrl;
    } else if (mode === 'vn' && activeSceneIndex >= 0) {
        targetBgm = scenes[activeSceneIndex]?.bgmUrl || activeMap?.bgmUrl;
    } else if (mode === 'battle' && activeBattle) {
        targetBgm = activeBattle.bgmUrl || activeMap?.bgmUrl;
    }

    console.log(`BGM Logic - mode: ${mode}, currentBgmUrl: ${currentBgmUrl}, targetBgm: ${targetBgm}`);

    if (targetBgm && targetBgm !== currentBgmUrl && mode !== 'edit') {
        setCurrentBgmUrl(targetBgm);
    } else if (!targetBgm && currentBgmUrl && mode !== 'edit') {
        setCurrentBgmUrl(undefined);
    } else if (mode === 'edit' && currentBgmUrl) {
        setCurrentBgmUrl(undefined);
    }
  }, [mode, activeMap, activeSceneIndex, activeBattle, scenes, currentBgmUrl]);

  const currentResolvedBgm = useRef<string | null>(null);

  useEffect(() => {
      let isMounted = true;
      if (!audioRef.current) return;
      console.log('Audio useEffect triggered, currentBgmUrl:', currentBgmUrl);
      if (currentBgmUrl) {
          loadImage(currentBgmUrl).then(resolvedUrl => {
              if (isMounted && audioRef.current) {
                  if (currentResolvedBgm.current !== resolvedUrl) {
                      console.log('Setting audio src to resolved URL and playing');
                      currentResolvedBgm.current = resolvedUrl;
                      audioRef.current.src = resolvedUrl || '';
                      audioRef.current.play().catch(e => console.log('Audio autoplay blocked', e));
                  } else {
                      console.log('Audio URL resolved to identical source, skipping restart.');
                  }
              }
          });
      } else {
          console.log('Pausing audio and clearing src');
          currentResolvedBgm.current = null;
          audioRef.current.pause();
          audioRef.current.src = '';
      }
      return () => { isMounted = false; };
  }, [currentBgmUrl]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* BACKGROUND AUDIO PLAYER */}
      <audio ref={audioRef} loop className="hidden" />

      {/* PROCESSING OVERLAY */}
      {isProcessing && (
          <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center pointer-events-none">
              <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
              <h2 className="text-xl font-bold text-white tracking-widest animate-pulse">PROCESSING DATA...</h2>
              <p className="text-sm text-gray-400 mt-2">Compressing or unpacking project files, please wait.</p>
          </div>
      )}

      {/* LOADING OVERLAY FOR SUMMARY GENERATION */}
      {generatingSummary && (
          <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center pointer-events-none">
              <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
              <h2 className="text-xl font-bold text-white tracking-widest animate-pulse">WRITING STORY LOG...</h2>
              <p className="text-sm text-gray-400 mt-2">The Chronicler is recording your deeds.</p>
          </div>
      )}

      {/* STORY JOURNAL OVERLAY */}
      {showJournal && (
          <StoryJournal 
              entries={rpgState.storyLog || []}
              onClose={() => setShowJournal(false)}
              onUpdateEntry={handleUpdateJournal}
          />
      )}

      <SettingsOverlay />

      <AnimatePresence mode="wait">
        {mode === 'edit' && (
          <motion.div 
            className="w-full min-h-screen"
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Editor 
              worldInfo={worldInfo}
              chapters={chapters}
              characters={characters}
              scenes={scenes}
              maps={maps}
              battles={battles}
              storyLog={rpgState.storyLog} // PASS STORY LOG TO EDITOR
              onUpdateWorldInfo={setWorldInfo}
              onUpdateChapters={setChapters}
              onUpdateCharacters={setCharacters}
              onUpdateScenes={setScenes}
              onUpdateMaps={setMaps}
              onUpdateBattles={setBattles}
              onPlay={handleStartNewGame}
              onQuickSave={handleQuickSave}
              onExportProject={handleExportProject}
              onImportProject={handleImportProject}
              onExportSave={handleExportSave}
              onImportSave={handleImportSave}
              hasSaveGame={hasSaveGame}
              onContinueGame={handleContinueGame}
            />
          </motion.div>
        )}

        {mode === 'rpg' && (
          <motion.div 
            className="w-full h-screen"
            key={`rpg-${activeMap?.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <RPGWorld 
              characters={characters}
              mapConfig={activeMap}
              maps={maps}
              scenes={scenes}
              battles={battles}
              initialState={rpgState}
              onInteraction={handleInteraction}
              onSave={async (updatedRpgState) => {
                 setRpgState(updatedRpgState);
                 await handleSaveGameInternal(updatedRpgState, null);
                 alert("Game Saved!");
              }}
              onExit={() => setMode('edit')}
              onOpenJournal={() => setShowJournal(true)}
            />
          </motion.div>
        )}

        {mode === 'battle' && activeBattle && (
          <motion.div 
            className="w-full h-screen"
            key={`battle-${activeBattleId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <BattleArena 
               battle={activeBattle}
               characters={characters}
               worldInfo={worldInfo}
               onWin={() => handleBattleFinish(true)}
               onLose={() => handleBattleFinish(false)}
               onExit={() => { setActiveBattleId(null); setMode('rpg'); }}
            />
          </motion.div>
        )}

        {mode === 'vn' && activeSceneIndex >= 0 && (
          <motion.div 
             className="w-full h-screen"
             key={`vn-${activeSceneIndex}`}
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             transition={{ duration: 0.6 }}
          >
            <Player 
              scenes={scenes}
              characters={characters}
              chapters={chapters}
              worldInfo={worldInfo}
              initialState={{
                currentSceneIndex: activeSceneIndex,
                history: vnHistory, 
                timestamp: 0,
                rpgState: rpgState, 
                vnState: null
              }}
              onExit={handleSceneExit}
              onSave={async (vnState) => {
                 await handleSaveGameInternal(rpgState, vnState);
                 return true;
              }}
              onCharacterUpdate={(updatedChar) => {
                  setCharacters(prev => prev.map(c => c.id === updatedChar.id ? updatedChar : c));
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
