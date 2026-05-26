
import React, { useState, useEffect, useRef } from 'react';
import { Scene, Character, ChatMessage, GameState, GameSaveData, Chapter, WorldInfo, CharacterEmotion } from '../types';
import { generateGameTurn } from '../services/geminiService';
import { Button } from './ui/Button';
import { ArrowLeft, RefreshCw, Send, Save, Map, CheckCircle, Play, MapPin, Heart, SkipForward, Target, Cpu } from 'lucide-react';
import { AsyncImage } from './ui/AsyncImage';
import { AsyncVideo } from './ui/AsyncVideo';

interface PlayerProps {
  scenes: Scene[];
  characters: Character[];
  chapters: Chapter[];
  worldInfo: WorldInfo;
  initialState: any; // Using any loosely here because we are mixing save data types
  onExit: (success: boolean, history: ChatMessage[]) => void; 
  onSave: (vnState: any) => Promise<boolean>;
  onCharacterUpdate?: (updatedChar: Character) => void; // New prop to persist changes
}

export const Player: React.FC<PlayerProps> = ({ scenes, characters, chapters, worldInfo, initialState, onExit, onSave, onCharacterUpdate }) => {
  const [state, setState] = useState<GameState>({
    currentSceneIndex: initialState?.currentSceneIndex || 0,
    history: initialState?.history || [],
    isProcessing: false,
    gameOver: false,
  });
  const [userInput, setUserInput] = useState('');
  
  // Track goal reached state locally to show UI elements
  const [goalReached, setGoalReached] = useState(false);
  const [goalReason, setGoalReason] = useState<string | null>(null);

  // Dev Tools State
  const [showDevTools, setShowDevTools] = useState(false);
  const [lastTokenStats, setLastTokenStats] = useState<{promptTokens?: number, completionTokens?: number, totalTokens?: number} | null>(null);
  const [lastRawResponse, setLastRawResponse] = useState<string | null>(null);

  // Notifications for Relationship Updates
  const [notifications, setNotifications] = useState<{ id: string, text: string, type: 'good' | 'bad' }[]>([]);

  // VIDEO STATE
  const [playingVideo, setPlayingVideo] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentScene = scenes[state.currentSceneIndex];
  
  // Find current chapter
  const currentChapter = currentScene?.chapterId ? chapters.find(c => c.id === currentScene.chapterId) : undefined;
  
  // Logic: Active characters are those present in the scene logic (for AI context)
  const activeCharacters = currentScene?.characters
    .map(sc => characters.find(c => c.id === sc.characterId))
    .filter((c): c is Character => !!c) || [];

  // Logic: Visible characters are strictly those with an imageSrc or any emotion image.
  const visibleCharacters = activeCharacters.filter(c => !!c.imageSrc || (c.emotions && Object.values(c.emotions).some(v => !!v)));

  // Derive latest emotion for each character from chat history
  const latestEmotions = React.useMemo(() => {
    const emotions: Record<string, CharacterEmotion> = {};
    for (const msg of state.history) {
      if (msg.characterId) {
        emotions[msg.characterId] = msg.emotion || 'idle';
      }
    }
    return emotions;
  }, [state.history]);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.history]);

  // Initial greeting from System/Narrator when scene starts (only if history is empty)
  useEffect(() => {
    if (!currentScene) return;

    // Check for Intro Video
    // Only play if there is no history yet (fresh entry to scene) OR allow replay?
    // Usually only on fresh entry.
    if (state.history.length === 0 && currentScene.introVideoSrc) {
        setPlayingVideo(true);
    } else {
        setPlayingVideo(false);
    }

    if (state.history.length > 0) return;
    setState(prev => ({
      ...prev,
      history: [{
        sender: 'system',
        text: currentScene.description,
        timestamp: Date.now(),
      }]
    }));
  }, [state.currentSceneIndex, currentScene]); // Trigger when index changes

  const addNotification = (text: string, type: 'good' | 'bad') => {
      const id = crypto.randomUUID();
      setNotifications(prev => [...prev, { id, text, type }]);
      setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== id));
      }, 4000);
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || state.isProcessing || !currentScene || playingVideo) return;

    const newMessage: ChatMessage = {
      sender: 'user',
      text: userInput,
      timestamp: Date.now(),
    };

    // Optimistic update
    setState(prev => ({
      ...prev,
      history: [...prev.history, newMessage],
      isProcessing: true,
    }));
    setUserInput('');

    try {
      const aiResponse = await generateGameTurn(
        newMessage.text,
        state.history, // send previous history
        currentScene,
        characters,
        worldInfo,
        currentChapter,
        initialState?.rpgState?.storyLog || [] // PASS STORY HISTORY HERE
      );

      const validEmotions: CharacterEmotion[] = ['idle','happy','angry','thoughtful','shy','sad','shocked','worried','lustful'];
      const safeEmotion = (e: string | undefined): CharacterEmotion | undefined =>
        e && validEmotions.includes(e as CharacterEmotion) ? (e as CharacterEmotion) : 'idle';

      const characterResponses = aiResponse?.characterResponses || [];
      const newMessages: ChatMessage[] = characterResponses.map((resp: any) => ({
        sender: 'model',
        characterId: resp.characterId,
        emotion: safeEmotion(resp.emotion),
        text: resp.text,
        timestamp: Date.now(),
      }));

      setState(prev => ({
        ...prev,
        history: [...prev.history, ...newMessages],
        isProcessing: false,
      }));

      // Handle Relationship Updates
      if (aiResponse?.relationshipUpdates && aiResponse.relationshipUpdates.length > 0 && onCharacterUpdate) {
          aiResponse.relationshipUpdates.forEach((update: any) => {
              const char = characters.find(c => c.id === update.characterId);
              if (char && char.relationship) {
                  // Calculate new value
                  const newVal = (char.relationship.currentValue || 0) + update.change;
                  // Persist change
                  onCharacterUpdate({
                      ...char,
                      relationship: { ...char.relationship, currentValue: newVal }
                  });
                  // Show Notification
                  const sign = update.change > 0 ? '+' : '';
                  addNotification(`${char.name}: Relationship ${sign}${update.change} (${update.reason})`, update.change > 0 ? 'good' : 'bad');
              }
          });
      }

      if (aiResponse?.sceneGoalReached) {
        setGoalReached(true);
        setGoalReason(aiResponse.sceneTransitionReason || "Objective Completed.");
      }
      
      if (aiResponse?.tokenStats) {
          setLastTokenStats(aiResponse.tokenStats);
      }
      if (aiResponse?.rawResponseText != null) {
          setLastRawResponse(aiResponse.rawResponseText);
      }

    } catch (error: any) {
      console.error("Turn error", error);
      addNotification(`Error: ${error.message}`, 'bad');
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const handleManualExit = (complete: boolean) => {
      onExit(complete, state.history);
  };

  const handleSaveGame = async () => {
    if (isSaving) return;
    setIsSaving(true);
    
    const vnState = {
       currentSceneIndex: state.currentSceneIndex,
       history: state.history,
       isProcessing: false,
       gameOver: false
    };

    const btn = document.getElementById('save-btn');
    if (btn) btn.innerHTML = '...';

    await onSave(vnState);
    
    if (btn) {
      btn.innerHTML = 'Saved!';
      setTimeout(() => btn.innerHTML = '', 2000); 
      setTimeout(() => setIsSaving(false), 1500);
    } else {
        setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!currentScene) {
    return <div className="flex items-center justify-center h-full">Scene Data Error. <button onClick={() => handleManualExit(false)}>Back</button></div>;
  }

  return (
    // Fixed container filling the screen
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden flex flex-col">
      
      {/* VIDEO OVERLAY */}
      {playingVideo && currentScene.introVideoSrc && (
          <div className="absolute inset-0 z-[200] bg-black flex items-center justify-center">
              <AsyncVideo 
                  src={currentScene.introVideoSrc} 
                  autoPlay 
                  onEnded={() => setPlayingVideo(false)}
                  className="w-full h-full object-contain"
              />
              <button 
                  onClick={() => setPlayingVideo(false)}
                  className="absolute bottom-10 right-10 bg-white/20 hover:bg-white/40 text-white px-4 py-2 rounded-full backdrop-blur-md flex items-center gap-2 border border-white/30 transition-all hover:scale-105"
              >
                  <SkipForward size={20} fill="currentColor"/> SKIP VIDEO
              </button>
          </div>
      )}

      {/* Background Layer - Original Full Screen Cover Mode */}
      <div className="absolute inset-0 z-0 bg-gray-950">
        {currentScene.backgroundSrc ? (
             <AsyncImage 
                src={currentScene.backgroundSrc} 
                alt="bg" 
                className="w-full h-full object-cover"
             />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900" />
        )}
        {/* Dark Overlay for UI readability */}
        <div className="absolute inset-0 bg-black/20 z-10 pointer-events-none" />
      </div>

      {/* Top Bar Navigation */}
      <div className="absolute top-2 left-2 right-2 md:top-4 md:left-4 md:right-4 z-50 flex justify-between items-start pointer-events-none gap-2">
        
        {/* Left Side Controls */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          {/* Back / Pause Button */}
          <button 
             onClick={() => handleManualExit(false)}
             className="flex items-center gap-1 md:gap-2 bg-black/50 hover:bg-black/70 text-gray-200 px-3 py-1.5 md:px-4 md:py-2 rounded-full backdrop-blur-md border border-white/10 transition-all hover:scale-105 shadow-lg group flex-shrink-0"
          >
             <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
             <span className="font-semibold text-xs md:text-sm hidden sm:inline">Resume</span>
          </button>
          
          {/* Dev Tools Toggle */}
          <button 
             onClick={() => setShowDevTools(!showDevTools)}
             className={`flex items-center gap-1 md:gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full backdrop-blur-md border transition-all shadow-lg flex-shrink-0 ${showDevTools ? 'bg-indigo-600/80 border-indigo-400 text-white' : 'bg-black/50 hover:bg-black/70 border-white/10 text-gray-300'}`}
          >
             <Cpu size={14} />
             <span className="font-semibold text-xs md:text-sm hidden sm:inline">Dev Tools</span>
          </button>

          {/* Dev Tools Panel */}
          {showDevTools && (
             <div className="bg-black/95 backdrop-blur-md border border-indigo-500/30 p-3 rounded-xl min-w-[280px] max-w-[320px] text-xs font-mono text-gray-300 shadow-xl animate-in fade-in slide-in-from-left-4 flex flex-col gap-2">
                <div className="font-bold text-indigo-400 border-b border-indigo-500/30 pb-1 flex justify-between items-center">
                   <span>Token Usage</span>
                   {lastTokenStats && <span className="text-[10px] text-gray-400 font-normal">Last Turn</span>}
                </div>
                {lastTokenStats ? (
                  <div className="flex flex-col gap-1 text-[11px]">
                     <div className="flex justify-between"><span>Prompt:</span> <span className="text-gray-100 font-bold">{lastTokenStats.promptTokens || 0}</span></div>
                     <div className="flex justify-between"><span>Completion:</span> <span className="text-gray-100 font-bold">{lastTokenStats.completionTokens || 0}</span></div>
                     <div className="flex justify-between border-t border-gray-700/50 pt-1 mt-1 font-bold text-indigo-300"><span>Total:</span> <span className="text-indigo-200">{lastTokenStats.totalTokens || 0}</span></div>
                  </div>
                ) : (
                  <div className="text-gray-500 italic text-[11px]">No token usage data yet.</div>
                )}

                <div className="font-bold text-indigo-400 border-b border-indigo-500/30 pb-1 pt-1">Raw Response Text</div>
                {lastRawResponse ? (
                  <div className="relative">
                    <pre className="text-[10px] bg-gray-950/85 p-2 rounded border border-gray-850 text-gray-400 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
                      {lastRawResponse}
                    </pre>
                  </div>
                ) : (
                  <div className="text-gray-500 italic text-[11px]">No local LLM response recorded yet.</div>
                )}
             </div>
          )}
        </div>

        {/* Location / Chapter Display & Goal */}
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-full text-indigo-200 font-bold shadow-lg flex flex-col items-center max-w-[50%] md:max-w-md w-full">
            <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-center">
               <MapPin size={12} className="text-indigo-400 flex-shrink-0" />
               <span className="truncate">{currentScene.locationName || 'Unknown Location'}</span>
            </div>
            {currentChapter && <span className="text-[9px] md:text-[10px] text-gray-400 font-normal uppercase tracking-widest truncate max-w-full">{currentChapter.name}</span>}
            {!goalReached && (
                <div className="mt-1 flex items-center gap-1 md:gap-2 text-[10px] md:text-xs text-green-400 border-t border-white/10 pt-1 w-full justify-center">
                   <Target size={10} className="flex-shrink-0" />
                   <span className="truncate text-center">Goal: {currentScene.goal}</span>
                </div>
            )}
        </div>

        {/* Goal Indicator */}
        <div className={`pointer-events-auto flex flex-col items-end gap-1 md:gap-2 transition-all duration-500 flex-shrink-0 ${goalReached ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
           {goalReached && (
             <>
               <div className="bg-emerald-900/90 text-emerald-100 px-3 py-1.5 md:px-4 md:py-2 rounded-lg border border-emerald-500/50 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-4 hidden sm:block">
                  <div className="flex items-center gap-1 md:gap-2 font-bold mb-0.5 md:mb-1 text-xs md:text-sm">
                      <CheckCircle size={14} className="text-emerald-400" /> Goal Reached!
                  </div>
                  <p className="text-[10px] md:text-xs opacity-90 max-w-[150px] md:max-w-[200px]">{goalReason}</p>
               </div>
               
               <button 
                  onClick={() => handleManualExit(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 md:px-5 md:py-3 rounded-full font-bold shadow-lg shadow-emerald-900/50 flex items-center gap-1 md:gap-2 animate-pulse hover:animate-none transition-all transform hover:scale-105 text-xs md:text-md"
               >
                  Finish <span className="hidden sm:inline">Scenario</span> <Play size={14} fill="currentColor" />
               </button>
             </>
           )}
        </div>
      </div>
      
      {/* NOTIFICATION LAYER (Center-Top) */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none w-full max-w-md items-center">
          {notifications.map(n => (
              <div 
                  key={n.id}
                  className={`px-6 py-2 rounded-full shadow-xl backdrop-blur-md animate-in slide-in-from-top-4 fade-in duration-500 border flex items-center gap-2 font-bold
                    ${n.type === 'good' ? 'bg-pink-500/80 border-pink-400 text-white' : 'bg-gray-800/90 border-gray-600 text-gray-300'}
                  `}
              >
                  {n.type === 'good' ? <Heart size={16} fill="currentColor"/> : <Heart size={16} className="text-gray-500"/>}
                  {n.text}
              </div>
          ))}
      </div>

      {/* Character Layer - Positioned above the background, below UI */}
      {/* We use visibleCharacters map to ensure characters without portraits don't take up layout space */}
      <div className="absolute bottom-[36vh] left-0 right-0 z-20 flex justify-center items-end px-10 h-[60vh] pointer-events-none">
        {visibleCharacters.map((char, idx) => {
           const currentEmotion = latestEmotions[char.id] || 'idle';
           let currentSrc = char.imageSrc;
           if (currentEmotion !== 'idle' && char.emotions && char.emotions[currentEmotion as keyof typeof char.emotions]) {
               currentSrc = char.emotions[currentEmotion as keyof typeof char.emotions] || char.imageSrc;
           }

           return (
             <div 
                key={char.id} 
                className="relative transition-transform duration-500 transform"
                style={{ 
                   zIndex: 20 + idx, 
                   marginLeft: idx > 0 ? '-50px' : '0',
                   filter: state.isProcessing ? 'brightness(0.7)' : 'brightness(1)' 
                }}
             >
                {currentSrc && (
                  <AsyncImage 
                    src={currentSrc} 
                    alt={char.name} 
                    className="max-h-[60vh] w-auto object-contain drop-shadow-2xl"
                  />
                )}
               <div className="absolute bottom-2 left-0 right-0 text-center">
                  <span className="bg-black/60 text-white px-2 py-0.5 rounded text-xs md:text-sm backdrop-blur-sm">{char.name}</span>
               </div>
             </div>
           );
        })}
      </div>

      {/* UI Layer - Chat Box */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-2 md:p-8 bg-gradient-to-t from-black via-black/90 to-transparent pt-16 md:pt-24">
        <div className="max-w-4xl mx-auto bg-black/80 border border-gray-700 rounded-xl backdrop-blur-md shadow-2xl overflow-hidden flex flex-col h-[35vh] md:h-[35vh]">
          
          {/* Chat History */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3 md:space-y-4">
            {state.history.map((msg, i) => {
              const char = characters.find(c => c.id === msg.characterId);
              const isUser = msg.sender === 'user';
              const isSystem = msg.sender === 'system';
              
              if (isSystem) return (
                <div key={i} className="text-center text-yellow-500 italic text-xs md:text-sm my-2 md:my-4 px-4 md:px-8">
                  {msg.text}
                </div>
              );

              // Apply custom visual styles
              const bubbleStyle: React.CSSProperties = {};
              
              if (!isUser && char) {
                  const bgColor = char.bubbleColor || char.rpgColor;
                  if (bgColor) bubbleStyle.backgroundColor = bgColor;
                  bubbleStyle.color = 'white'; 
                  if (char.isItalic) bubbleStyle.fontStyle = 'italic';
              }

              return (
                <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                   <div className="text-[10px] md:text-xs text-gray-400 mb-0.5 md:mb-1 px-1">
                     {isUser ? 'You' : (char?.name || 'Unknown')}
                   </div>
                   <div 
                      className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg max-w-[90%] md:max-w-[85%] text-xs md:text-sm leading-relaxed ${
                        isUser 
                          ? 'bg-indigo-600 text-white rounded-br-none' 
                          : 'bg-gray-800 text-white rounded-bl-none border border-gray-700'
                      }`}
                      style={!isUser ? bubbleStyle : undefined}
                   >
                     {msg.text}
                   </div>
                </div>
              );
            })}
            {state.isProcessing && (
              <div className="flex items-center gap-1.5 text-gray-500 text-xs md:text-sm px-2 md:px-4">
                <RefreshCw className="animate-spin" size={12} /> AI is thinking...
              </div>
            )}
            
            {/* System Message inside chat when goal reached */}
            {goalReached && (
                <div className="text-center my-2 md:my-4 animate-in fade-in zoom-in duration-300">
                    <span className="bg-emerald-900/50 text-emerald-300 border border-emerald-600/50 px-2 py-1 md:px-3 rounded-full text-[10px] md:text-xs font-bold">
                        ★ Objective Complete
                    </span>
                </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-2 md:p-4 border-t border-gray-700 bg-gray-900/50 flex gap-2">
             <button 
               id="save-btn"
               onClick={handleSaveGame} 
               disabled={isSaving}
               className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 p-2 md:p-3 rounded-lg transition-colors flex items-center justify-center min-w-[40px] md:min-w-[50px]"
               title="Save Current Progress"
             >
               {!isSaving && <Save size={16} />}
             </button>
             
             <input
               type="text"
               className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 md:px-4 md:py-3 text-xs md:text-sm text-white focus:border-indigo-500 outline-none transition-colors"
               placeholder={goalReached ? "Keep chatting or leave..." : "What do you say/do?"}
               value={userInput}
               onChange={(e) => setUserInput(e.target.value)}
               onKeyDown={handleKeyDown}
               autoFocus
               disabled={state.isProcessing}
             />
             <button 
                onClick={handleSendMessage}
                disabled={!userInput.trim() || state.isProcessing}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white p-2 md:p-3 rounded-lg transition-colors"
             >
               <Send size={16} />
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};
