
import { Type, Schema } from "@google/genai";
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
        
        return { json: JSON.parse(data.response), tokenStats };
    } else {
        const response = await fetch("/api/gemini/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, schema, defaultGeminiModel, worldInfo })
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server Error: ${response.statusText}`);
        }
        
        return await response.json();
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


const SEMANTIC_SYNONYMS: Record<string, string[]> = {
  "garde": ["wache", "wächter", "soldat", "militär", "truppe", "ritter", "krieger", "garrison", "guard", "soldier", "guards", "watch", "watchman"],
  "gilde": ["bündnis", "fraktion", "clique", "orden", "sekte", "bund", "guild", "faction", "alliance"],
  "schenke": ["taverne", "kneipe", "gasthaus", "herberge", "inn", "tavern", "bar", "pub"],
  "tempel": ["schrein", "kirche", "kathedrale", "altar", "heiligtum", "temple", "shrine", "church"],
  "burg": ["schloss", "festung", "palast", "turm", "ruine", "castle", "fortress", "palace"],
  "wald": ["forst", "gehölz", "dschungel", "hain", "forest", "woods", "grove"],
  "markt": ["basar", "handelsplatz", "stand", "laden", "geschäft", "market", "bazaar", "shop"],
  "hafen": ["dock", "kai", "werft", "marina", "port", "harbor", "docks"],
  "akademie": ["schule", "universität", "bibliothek", "archiv", "academy", "school", "library"],
  "könig": ["kaiser", "fürst", "herzog", "graf", "monarch", "herrscher", "thron", "royal", "king", "queen", "empire"],
  "dieb": ["schurke", "bande", "mafia", "schmuggler", "räuber", "thief", "rogue", "bandit", "smuggler", "diebe"]
};

const STOP_WORDS = new Set([
  "aber", "alle", "allem", "allen", "aller", "alles", "als", "also", "am", "an", "and", "auch", "auf", "aus", "bei", "bin", "bis", "bist", "da", "damit", "dann", "das", "dass", "dein", "deine", "dem", "den", "denn", "der", "des", "dessen", "dich", "die", "dies", "diese", "dieser", "dieses", "doch", "dort", "du", "durch", "ein", "eine", "einem", "einen", "einer", "eines", "einige", "einigen", "einiger", "einiges", "einmal", "er", "es", "euch", "euer", "eure", "für", "gegen", "gewesen", "habe", "haben", "hat", "hatte", "ihm", "ihn", "ihr", "ihre", "ihrem", "ihren", "ihrer", "ihres", "im", "in", "ist", "ja", "jede", "jedem", "jeden", "jeder", "jedes", "jene", "jenem", "jenen", "jener", "jenes", "jetzt", "kann", "können", "man", "mit", "nach", "nein", "nicht", "nur", "oder", "seid", "seine", "seinen", "seinem", "seiner", "seines", "selbst", "sich", "sie", "sind", "so", "solche", "solchem", "solchen", "solcher", "solches", "soll", "sollen", "und", "uns", "unser", "unsere", "unserem", "unseren", "unseres", "unter", "vom", "von", "vor", "was", "weg", "weil", "weiter", "welche", "welchem", "welchen", "welcher", "welches", "wenn", "wer", "werde", "werden", "wie", "wieder", "will", "wir", "wird", "wirst", "wo", "wollen", "wollten", "wurde", "wurden", "zu", "zum", "zur", "zusammen"
]);

function calculateLoreScore(
  name: string,
  description: string,
  matchText: string,
  matchWords: string[]
): number {
  let score = 0;
  const nameLower = name.toLowerCase();
  const descLower = description.toLowerCase();

  // 1. Exakter Substring-Match des vollständigen Namens
  if (matchText.includes(nameLower)) {
    score += 25;
  }

  // Kernwörter des Eintrags extrahieren
  const entryNameWords = nameLower
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\"]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  // 2. Wortweises Matching & Synonyme
  for (const entryWord of entryNameWords) {
    // Exakter Wortmatch (oder Teilwortmatch wie "wache" in "königliche wache")
    if (matchWords.includes(entryWord) || matchWords.some(mw => mw.includes(entryWord))) {
      score += 12;
      continue;
    }

    // Semantischer Match über Synonyme
    for (const [key, synonyms] of Object.entries(SEMANTIC_SYNONYMS)) {
      const isKey = entryWord.includes(key) || key.includes(entryWord);
      const inSynonyms = synonyms.some(s => entryWord.includes(s) || s.includes(entryWord));

      if (isKey || inSynonyms) {
        // Prüfen, ob eines der anderen Synonyme oder der Key im Text vorkommt
        const matchFound = matchWords.some(w => 
          w === key || 
          w.includes(key) ||
          synonyms.some(s => w === s || w.includes(s))
        );
        if (matchFound) {
          score += 10;
          break; // Ein Synonymmatch reicht für dieses Wort
        }
      }
    }
  }

  // 3. Beschreibungswortweises Matching (mit geringerer Gewichtung)
  const entryDescWords = descLower
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\"]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 4 && !STOP_WORDS.has(w));

  let descMatches = 0;
  for (const descWord of entryDescWords) {
    if (matchWords.includes(descWord) || matchWords.some(mw => mw.includes(descWord))) {
      descMatches++;
    }
  }
  score += Math.min(descMatches, 5); // Bis zu 5 Punkte max für Beschreibung

  return score;
}

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
    
    // --- SMART LORE SCOPING & DYNAMIC EXTRACTION ENGINE ---
    const recentHistoryText = history.slice(-5).map(msg => msg.text).join(' ');
    const contextStringToSearch = `${currentInput} ${scene.name} ${scene.locationName || ''} ${scene.description} ${recentHistoryText}`;
    const cleanedContextWords = contextStringToSearch
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\"]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3);

    // 1. FACTION SCOPING & DYNAMIC SCANNING
    const explicitlyScopedFactionIds = scene.relevantFactionIds || [];
    const hasExplicitFactions = explicitlyScopedFactionIds.length > 0;

    let factionsToLoad: any[] = [];
    let dynamicFactions: any[] = [];

    if (worldInfo.factions && worldInfo.factions.length > 0) {
      if (hasExplicitFactions) {
        // Explizit ausgewählte Fraktionen immer laden
        factionsToLoad = worldInfo.factions.filter(f => explicitlyScopedFactionIds.includes(f.id));
        // Restliche Fraktionen auf dynamische Relevanz prüfen
        const remainingFactions = worldInfo.factions.filter(f => !explicitlyScopedFactionIds.includes(f.id));
        for (const f of remainingFactions) {
          const score = calculateLoreScore(f.name, f.description, contextStringToSearch.toLowerCase(), cleanedContextWords);
          if (score >= 10) {
            dynamicFactions.push(f);
          }
        }
      } else {
        // Keine explizite Auswahl getroffen -> Smart-Filter alle bzw. Fallback auf alle
        const scoredFactions = worldInfo.factions.map(f => ({
          faction: f,
          score: calculateLoreScore(f.name, f.description, contextStringToSearch.toLowerCase(), cleanedContextWords)
        }));
        
        const relevant = scoredFactions.filter(sf => sf.score >= 10).map(sf => sf.faction);
        if (relevant.length > 0) {
          factionsToLoad = relevant;
        } else {
          // Fallback: alle laden, wenn gar kein Match gefunden wurde
          factionsToLoad = worldInfo.factions;
        }
      }
    }

    if (factionsToLoad && factionsToLoad.length > 0) {
      worldContext += `RELEVANT FACTIONS FOR THIS SCENE:\n${factionsToLoad.map(f => `- ${f.name}: ${f.description}`).join('\n')}\n\n`;
    }
    if (dynamicFactions.length > 0) {
      worldContext += `DYNAMICALLY DETECTED FACTIONS (Contextually Mentioned / Relevant):\n${dynamicFactions.map(f => `- ${f.name} (Detected via Synonym/Keyword): ${f.description}`).join('\n')}\n\n`;
    }
    
    // 2. LOCATION SCOPING & DYNAMIC SCANNING
    const explicitlyScopedLocationIds = scene.relevantLocationIds || [];
    const hasExplicitLocations = explicitlyScopedLocationIds.length > 0;

    let locationsToLoad: any[] = [];
    let dynamicLocations: any[] = [];

    if (worldInfo.loreLocations && worldInfo.loreLocations.length > 0) {
      if (hasExplicitLocations) {
        // Explizit ausgewählte Orte immer laden
        locationsToLoad = worldInfo.loreLocations.filter(l => explicitlyScopedLocationIds.includes(l.id));
        // Restliche Orte auf dynamische Relevanz prüfen
        const remainingLocations = worldInfo.loreLocations.filter(l => !explicitlyScopedLocationIds.includes(l.id));
        for (const l of remainingLocations) {
          const score = calculateLoreScore(l.name, l.description, contextStringToSearch.toLowerCase(), cleanedContextWords);
          if (score >= 10) {
            dynamicLocations.push(l);
          }
        }
      } else {
        // Keine explizite Auswahl getroffen -> Smart-Filter alle bzw. Fallback auf alle
        const scoredLocations = worldInfo.loreLocations.map(l => ({
          location: l,
          score: calculateLoreScore(l.name, l.description, contextStringToSearch.toLowerCase(), cleanedContextWords)
        }));
        
        const relevant = scoredLocations.filter(sl => sl.score >= 10).map(sl => sl.location);
        if (relevant.length > 0) {
          locationsToLoad = relevant;
        } else {
          // Fallback: alle laden, wenn gar kein Match gefunden wurde
          locationsToLoad = worldInfo.loreLocations;
        }
      }
    }

    if (locationsToLoad && locationsToLoad.length > 0) {
      worldContext += `RELEVANT LOCATIONS FOR THIS SCENE:\n${locationsToLoad.map(l => `- ${l.name}: ${l.description}`).join('\n')}\n\n`;
    }
    if (dynamicLocations.length > 0) {
      worldContext += `DYNAMICALLY DETECTED LOCATIONS (Contextually Mentioned / Relevant):\n${dynamicLocations.map(l => `- ${l.name} (Detected via Synonym/Keyword): ${l.description}`).join('\n')}\n\n`;
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

    const { json, tokenStats } = await callLLM(worldInfo, fullPrompt, responseSchema, "gemini-3.5-flash");
    
    return { ...json, tokenStats } as AIResponse;

  } catch (error) {
    console.error("Gemini Error:", error);
    // Fallback in case of error to prevent crash
    return {
      characterResponses: [{ characterId: "system", text: "An error occurred communicating with the AI engine." }],
      sceneGoalReached: false
    };
  }
};
