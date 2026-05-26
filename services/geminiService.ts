
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Scene, Character, ChatMessage, AIResponse, WorldInfo, Chapter, StoryLogEntry, SceneCharacterConfig } from "../types";

export const EMOTION_ENUM = ['idle', 'happy', 'angry', 'thoughtful', 'shy', 'sad', 'shocked', 'worried', 'lustful'] as const;

function buildResponseSchema(activeCharacterIds: string[]): Schema {
  // 'narrator' and 'system' always allowed for narration and system messages
  const allowedCharacterIds = Array.from(new Set([...activeCharacterIds, 'narrator', 'system']));
  
  return {
    type: Type.OBJECT,
    properties: {
      characterResponses: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            characterId: {
              type: Type.STRING,
              enum: allowedCharacterIds,
              description: "ID of the speaking character. Must be one of the active characters in the scene, or 'narrator' for descriptive narration.",
            },
            emotion: {
              type: Type.STRING,
              enum: [...EMOTION_ENUM],
              description: "Emotion of the character during this line. Use 'idle' for normal/neutral state.",
            },
            text: { type: Type.STRING, description: "The dialogue line or narration." },
          },
          required: ["characterId", "text"],
        },
        description: "List of responses from characters in the scene. Can be empty if only narrator speaks or no one speaks.",
      },
      relationshipUpdates: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            characterId: {
              type: Type.STRING,
              enum: allowedCharacterIds,
              description: "ID of the character whose relationship changed.",
            },
            change: { type: Type.NUMBER, description: "Numeric change (e.g., +5, -10)." },
            reason: { type: Type.STRING, description: "Short reason for the change (e.g., 'Player was rude')." }
          },
          required: ["characterId", "change", "reason"]
        },
        description: "Optional list of relationship changes triggered by player's last action."
      },
      sceneGoalReached: {
        type: Type.BOOLEAN,
        description: "True ONLY if the specific win condition is met. If no win condition is provided, this MUST be false.",
      },
      sceneTransitionReason: {
        type: Type.STRING,
        description: "Brief explanation if the scene is ending.",
      },
    },
    required: ["characterResponses", "sceneGoalReached"],
  };
}

// Schema for Scene Summarization
const SUMMARY_SCHEMA: Schema = {
    type: Type.OBJECT,
    properties: {
        summary: { type: Type.STRING, description: "A concise summary (3-5 sentences) of the events, key decisions, and outcome of the scene." }
    },
    required: ["summary"]
};

function buildSceneGenSchema(allCharacterIds: string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Creative name for the scene." },
      locationName: { type: Type.STRING, description: "Where this takes place (e.g. 'The Rusty Tavern')." },
      description: { type: Type.STRING, description: "Visible description for the player." },
      goal: { type: Type.STRING, description: "Objective for the player (or empty if it's a chill scene)." },
      aiInstructions: { type: Type.STRING, description: "Hidden instructions for the AI on how to play the characters." },
      sensoryDetails: { type: Type.STRING, description: "Smells, sounds, lighting." },
      environmentDetails: { type: Type.STRING, description: "Physical layout description." },
      characters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            characterId: { 
              type: Type.STRING, 
              enum: allCharacterIds,
              description: "Must be one of the provided Character IDs." 
            },
            roleInScene: { type: Type.STRING, description: "What is this character doing here?" }
          },
          required: ["characterId", "roleInScene"]
        }
      }
    },
    required: ["name", "locationName", "description", "goal", "aiInstructions", "characters"]
  };
}

export function normalizeAIResponse(raw: any): Omit<AIResponse, 'tokenStats'> {
  if (!raw || typeof raw !== 'object') {
    return {
      characterResponses: [],
      sceneGoalReached: false
    };
  }

  // Find characterResponses under any common casing (camelCase, snake_case, etc)
  let characterResponses: any[] = [];
  const rawResponses = raw.characterResponses || raw.character_responses || raw.characterResponsesList || raw.responses || [];
  if (Array.isArray(rawResponses)) {
    characterResponses = rawResponses.map((r: any) => {
      if (!r) return null;
      if (typeof r === 'string') {
        return {
          characterId: 'narrator',
          emotion: 'idle',
          text: r
        };
      }
      return {
        characterId: r.characterId || r.character_id || r.id || r.character || r.characterID || 'narrator',
        emotion: r.emotion || r.mood || r.state || 'idle',
        text: r.text || r.dialogue || r.speech || r.message || r.line || ''
      };
    }).filter(Boolean);
  } else if (rawResponses && typeof rawResponses === 'object') {
    // If it's a single response object
    characterResponses = [{
      characterId: rawResponses.characterId || rawResponses.character_id || rawResponses.id || 'narrator',
      emotion: rawResponses.emotion || 'idle',
      text: rawResponses.text || rawResponses.dialogue || rawResponses.message || ''
    }];
  }

  // Find relationshipUpdates
  let relationshipUpdates: any[] = [];
  const rawUpdates = raw.relationshipUpdates || raw.relationship_updates || raw.relationshipUpdatesList || [];
  if (Array.isArray(rawUpdates)) {
    relationshipUpdates = rawUpdates.map((u: any) => {
      if (!u || typeof u !== 'object') return null;
      return {
        characterId: u.characterId || u.character_id || u.id || u.character || '',
        change: Number(u.change || u.valueChange || u.value_change || 0),
        reason: u.reason || u.why || ''
      };
    }).filter((u: any) => u && u.characterId);
  }

  // sceneGoalReached
  const sceneGoalReached = !!(raw.sceneGoalReached || raw.scene_goal_reached || raw.goalReached || raw.goal_reached || false);
  const sceneTransitionReason = raw.sceneTransitionReason || raw.scene_transition_reason || raw.transitionReason || raw.transition_reason || '';

  return {
    characterResponses,
    relationshipUpdates,
    sceneGoalReached,
    sceneTransitionReason
  };
}

async function callLLM(worldInfo: WorldInfo | undefined, prompt: string, schema: Schema, defaultGeminiModel: string) {
    const isOllama = worldInfo?.llmProvider === 'ollama';
    if (isOllama) {
        const url = (worldInfo?.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
        const model = worldInfo?.llmModel || 'llama3';
        
        let ollamaPrompt = prompt + `\n\nCRITICAL: You must output strictly valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`;
        
        const res = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: ollamaPrompt,
                stream: false,
                format: 'json'
            })
        });
        
        if (!res.ok) {
            throw new Error(`Ollama Error: ${res.statusText}`);
        }
        
        const data = await res.json();
        
        const tokenStats = {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count || 0,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        };
        
        console.log("Ollama Response Raw:", data.response);

        let parsedJson: any = {};
        try {
            parsedJson = JSON.parse(data.response || "{}");
        } catch (err: any) {
            console.error("Failed to parse Ollama JSON:", err, "Raw response content:", data.response);
            parsedJson = {
                characterResponses: [{
                    characterId: 'narrator',
                    emotion: 'idle',
                    text: data.response || "No text responses were captured."
                }],
                sceneGoalReached: false
            };
        }
        
        return { json: parsedJson, tokenStats, rawResponseText: data.response || "" };
    } else {
        if (!process.env.API_KEY) throw new Error("API Key not found");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const model = worldInfo?.llmModel || defaultGeminiModel;
        
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini generateContent timed out after 60s")), 60000));
        const res = await Promise.race([
            ai.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    temperature: 1
                }
            }),
            timeoutPromise
        ]) as any;
        
        const tokenStats = {
            promptTokens: res.usageMetadata?.promptTokenCount || 0,
            completionTokens: res.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: res.usageMetadata?.totalTokenCount || 0
        };
        
        const textValue = res.text || "{}";
        return { json: JSON.parse(textValue), tokenStats, rawResponseText: textValue };
    }
}

export const generateSceneSummary = async (
    scene: Scene,
    characters: Character[],
    history: ChatMessage[],
    worldInfo?: WorldInfo
): Promise<string> => {
    // Identify characters by name for the prompt
    const charNames = scene.characters
        .map(sc => characters.find(c => c.id === sc.characterId)?.name)
        .filter(Boolean)
        .join(", ");

    const chatLog = history.map(msg => {
        const senderName = msg.sender === 'user' ? 'Player' : 
                           msg.sender === 'system' ? 'System' : 
                           characters.find(c => c.id === msg.characterId)?.name || 'Unknown';
        return `${senderName}: ${msg.text}`;
    }).join('\n');

    const prompt = `
        Task: Summarize the following Visual Novel scene for a persistent Story Log.
        Scene Name: ${scene.name}
        Location: ${scene.locationName}
        Characters Present: ${charNames}

        Conversation History:
        ${chatLog}

        Instructions:
        - Write a concise summary (3-5 sentences).
        - Focus on what happened, what information was revealed, and any major decisions made by the player.
        - Write in past tense.
    `;

    try {
        const { json } = await callLLM(worldInfo, prompt, SUMMARY_SCHEMA, "gemini-3.5-flash");
        return json.summary || "No summary available.";
    } catch (e) {
        console.error("Summary Generation Failed", e);
        return "Summary generation failed.";
    }
};

export const generateAutoScene = async (
    allCharacters: Character[],
    storyLog: StoryLogEntry[],
    worldInfo: WorldInfo,
    customPrompt?: string
): Promise<Partial<Scene>> => {
    const charList = allCharacters.map(c => `ID: ${c.id} | Name: ${c.name} | Role: ${c.defaultDescription}`).join('\n');
    
    const recentEvents = storyLog.slice(-5).map(e => `[${e.sceneName}] ${e.summary}`).join('\n');

    const prompt = `
        Task: Create a NEW scene for a Visual Novel RPG.
        
        WORLD SETTING:
        ${worldInfo.description}
        
        AVAILABLE ASSETS (CHARACTERS):
        ${charList}
        
        RECENT STORY EVENTS (Context):
        ${recentEvents || "The story is just beginning."}
        
        ${customPrompt ? `\nUSER'S CUSTOM REQUEST/PROMPT FOR THIS SCENE:\n${customPrompt}\n` : ""}

        INSTRUCTIONS:
        1. Design a scene that logically follows the recent events OR creates a "Quality of Life" bonding moment / side quest.
        2. DO NOT invent new characters. Use ONLY the IDs provided in the list above.
        3. Pick 1-3 characters to include.
        4. Define a clear location, description, and goal.
        5. If it's a chill scene, the goal can be "Chat with X" or "Relax".
        6. Provide hidden AI instructions on how the characters should behave in this specific context.
        7. The output must be valid JSON matching the schema.
        ${customPrompt ? '8. **VERY IMPORTANT**: You MUST honor the USER\'S CUSTOM REQUEST specified above when designing this scene.' : ''}
    `;

    try {
        const allCharacterIds = allCharacters.map(c => c.id);
        const sceneGenSchema = buildSceneGenSchema(allCharacterIds);

        const { json } = await callLLM(worldInfo, prompt, sceneGenSchema, "gemini-3.5-flash");
        return json;
    } catch (e) {
        console.error("Scene Generation Failed", e);
        throw e;
    }
};

export const generateGameTurn = async (
  currentInput: string,
  history: ChatMessage[],
  scene: Scene,
  allCharacters: Character[],
  worldInfo?: WorldInfo,
  chapter?: Chapter,
  storyLog: StoryLogEntry[] = [] // New Parameter
): Promise<AIResponse> => {
  // 1. Construct the Context
  const activeChars = scene.characters.map(sc => {
    const baseChar = allCharacters.find(c => c.id === sc.characterId);
    if (!baseChar) return null;

    // --- Format Relationship Logic if enabled ---
    let relContext = '';
    if (baseChar.relationship && baseChar.relationship.enabled) {
        const rc = baseChar.relationship;
        // Sort thresholds descending to find the current active one
        const activeThreshold = [...rc.thresholds]
            .sort((a,b) => b.valueStart - a.valueStart)
            .find(t => rc.currentValue >= t.valueStart);

        relContext = `
        **RELATIONSHIP SYSTEM ACTIVE**
        - Current Value: ${rc.currentValue} (Start: ${rc.startValue})
        - Current Status/Behavior: ${activeThreshold ? `${activeThreshold.label}: ${activeThreshold.description}` : 'Normal'}
        
        **RULES FOR CHANGING VALUE (Evaluate User's Action):**
        ${rc.triggers.map(t => `- ${t.description}: ${t.valueChange > 0 ? '+' : ''}${t.valueChange}`).join('\n')}
        
        **THRESHOLDS:**
        ${rc.thresholds.map(t => `- >= ${t.valueStart} (${t.label}): ${t.description}`).join('\n')}

        INSTRUCTION: If the player's current action matches a trigger, include a 'relationshipUpdates' entry in the JSON response.
        `;
    } else {
        relContext = `Relation to Player: ${baseChar.playerRelation || 'Neutral'}`;
    }

    return {
      name: baseChar.name,
      id: baseChar.id,
      basePersona: baseChar.defaultDescription,
      lore: baseChar.lore || '',
      relContext: relContext,
      sceneRole: sc.roleInScene
    };
  }).filter(Boolean);

  // Handle Logic for empty goals
  const hasSpecificGoal = scene.goal && scene.goal.trim().length > 0;
  
  const goalInstruction = hasSpecificGoal 
    ? `WIN CONDITION / GOAL: ${scene.goal}
       CRITICAL: Evaluate if this specific "WIN CONDITION" has been met by the user's actions or words. If yes, set 'sceneGoalReached' to true.`
    : `WIN CONDITION: NONE / SANDBOX. 
       CRITICAL: This is an open-ended roleplay. Do NOT set 'sceneGoalReached' to true under any circumstances. The player will exit manually when they are done.`;

  // --- World Building Context ---
  let worldContext = '';
  if (worldInfo) {
    worldContext += `WORLD VIEW / GLOBAL SETTING:\n${worldInfo.description}\n\n`;
    
    // Faction-Scoping: Wenn die Szene relevante Fraktionen explizit auswählt, nur diese laden.
    // Fallback: alle Fraktionen (für Backwards-Kompatibilität mit alten Szenen ohne Auswahl).
    const factionsToLoad = scene.relevantFactionIds && scene.relevantFactionIds.length > 0
      ? worldInfo.factions?.filter(f => scene.relevantFactionIds!.includes(f.id))
      : worldInfo.factions;

    if (factionsToLoad && factionsToLoad.length > 0) {
      worldContext += `RELEVANT FACTIONS FOR THIS SCENE:\n${factionsToLoad.map(f => `- ${f.name}: ${f.description}`).join('\n')}\n\n`;
    }
    
    // Location-Scoping: gleiches Prinzip
    const locationsToLoad = scene.relevantLocationIds && scene.relevantLocationIds.length > 0
      ? worldInfo.loreLocations?.filter(l => scene.relevantLocationIds!.includes(l.id))
      : worldInfo.loreLocations;

    if (locationsToLoad && locationsToLoad.length > 0) {
      worldContext += `RELEVANT LOCATIONS FOR THIS SCENE:\n${locationsToLoad.map(l => `- ${l.name}: ${l.description}`).join('\n')}\n\n`;
    }

    if (worldInfo.systemInstruction) {
        worldContext += `SYSTEM DIRECTIVES (Must Follow):\n${worldInfo.systemInstruction}\n\n`;
    }
  }

  const chapterContext = chapter 
    ? `CURRENT CHAPTER: ${chapter.name}
       CHAPTER CONTEXT: ${chapter.description}`
    : '';

  // --- STORY HISTORY CONTEXT ---
  let historyContext = '';
  if (storyLog && storyLog.length > 0) {
      historyContext = `
      PREVIOUS STORY EVENTS (Chronological Order):
      ${storyLog.map(entry => `[Scene: ${entry.sceneName} @ ${entry.locationName}] ${entry.summary}`).join('\n')}
      
      INSTRUCTION: Use this history to maintain consistency. Refer to past events if relevant.
      `;
  }

  const aiHiddenInstructions = scene.aiInstructions 
    ? `HIDDEN GAME MASTER INSTRUCTIONS (Do not reveal to player): 
       ${scene.aiInstructions}` 
    : '';

  const aiSensoryDetails = scene.sensoryDetails
    ? `SENSORY DETAILS (Atmosphere, Smells, Sounds):
       ${scene.sensoryDetails}`
    : '';

  const aiEnvironmentLayout = scene.environmentDetails
    ? `INTERNAL ENVIRONMENT & LAYOUT (Room structure, visible objects, architecture):
       ${scene.environmentDetails}`
    : '';

  const systemPrompt = `
    You are the Game Master and Engine for a Visual Novel.
    
    ${worldContext}
    ${chapterContext}
    ${historyContext}

    CURRENT SCENARIO CONFIGURATION:
    - Scene Name: ${scene.name}
    - Location: ${scene.locationName || 'Unknown Location'}
    - Visible Description (Player Context): ${scene.description}
    
    ${aiHiddenInstructions}
    ${aiSensoryDetails}
    ${aiEnvironmentLayout}

    ${goalInstruction}
    
    ACTIVE CHARACTERS IN SCENE:
    ${activeChars.map(c => `- ID: ${c?.id}, Name: ${c?.name}
       Persona/Behavior: ${c?.basePersona}
       Lore/History: ${c?.lore}
       RELATIONSHIP CONTEXT:
       ${c?.relContext}
       CURRENT SCENE ROLE: ${c?.sceneRole}`).join('\n')}
    
    INSTRUCTIONS:
    1. Analyze the user's input and the chat history.
    2. Determine which character(s) should respond based on their personas, lore, relationship status, and the conversation flow. Multiple characters can speak in sequence.
    3. Use the internal environment and sensory details to respond more accurately.
    4. CHECK RELATIONSHIP TRIGGERS: If the relationship system is active for a character, check if the user's input triggers a value change.
    5. Respond strictly in JSON.
  `;

  // 2. Format History for Gemini
  const recentHistory = history.slice(-10).map(msg => 
    `${msg.sender === 'user' ? 'Player' : (allCharacters.find(c => c.id === msg.characterId)?.name || 'Narrator')}: ${msg.text}`
  ).join('\n');

  const fullPrompt = `
    ${systemPrompt}

    RECENT CHAT HISTORY:
    ${recentHistory}

    CURRENT PLAYER INPUT:
    "${currentInput}"
  `;

  try {
    const activeCharacterIds = activeChars.map(c => c!.id);
    const responseSchema = buildResponseSchema(activeCharacterIds);

    const { json, tokenStats, rawResponseText } = await callLLM(worldInfo, fullPrompt, responseSchema, "gemini-3.5-flash");
    
    const normalized = normalizeAIResponse(json);
    
    return { ...normalized, tokenStats, rawResponseText } as AIResponse;

  } catch (error) {
    console.error("Gemini Error:", error);
    // Fallback in case of error to prevent crash
    return {
      characterResponses: [{ characterId: "system", text: "An error occurred communicating with the AI engine." }],
      sceneGoalReached: false
    };
  }
};
