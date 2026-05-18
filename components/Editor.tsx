import React, { useState, useRef } from 'react';
import { Character, Scene, WorldMap, Battle, WorldInfo, Chapter, SceneEffect, MapSpot, WorldLocation, Faction, RelationshipTrigger, RelationshipThreshold, StoryLogEntry } from '../types';
import { Button } from './ui/Button';
import { Trash, Sword, Scaling, Plus, Save, Play, Download, Upload, Monitor, Map as MapIcon, Users, Target, Book, Layout, MessageSquare, Unlock, Lock, Waypoints, Image as ImageIcon, XCircle, Terminal, MapPin, Heart, EyeOff, Video, Music, Sparkles, Loader2, ArrowLeft } from 'lucide-react';
import { generateAutoScene } from '../services/geminiService';
import { AsyncImage } from './ui/AsyncImage';
import { AsyncVideo } from './ui/AsyncVideo';

import { saveImage, loadImage, deleteImage } from '../utils/imageStorage';

interface ImageFieldProps {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
}

const ImageField: React.FC<ImageFieldProps> = ({ label, value, onChange }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [imgSrc, setImgSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    React.useEffect(() => {
        let isMounted = true;
        const fetchImage = async () => {
            if (value) {
                setIsLoading(true);
                try {
                    const data = await loadImage(value);
                    if (isMounted) setImgSrc(data);
                } catch (e) {
                    console.error('Failed to load image', e);
                } finally {
                    if (isMounted) setIsLoading(false);
                }
            } else {
                setImgSrc(null);
            }
        };
        fetchImage();
        return () => { isMounted = false; };
    }, [value]);

    const processFile = (file: File) => {
        setIsLoading(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const base64 = ev.target?.result as string;
                let newId = value || crypto.randomUUID();
                await saveImage(newId, base64);
                setImgSrc(base64); // show immediately
                onChange(newId);
                if (inputRef.current) inputRef.current.value = "";
            } catch (e) {
                console.error('Failed to save image', e);
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            processFile(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleRemove = async () => {
        if (value) {
            // Optional: delete from storage here, or leave it orphaned and garbage collect later.
            // await deleteImage(value);
        }
        onChange(null);
        setImgSrc(null);
    };

    return (
        <div className="w-full">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{label}</label>
            <input 
                ref={inputRef}
                type="file" 
                onChange={handleFile} 
                className="hidden" 
                accept="image/*"
            />
            
            {value && imgSrc ? (
                <div 
                    className={`relative group w-full h-24 rounded border flex items-center justify-center overflow-hidden transition-colors ${
                        isDragging ? 'bg-indigo-900 border-indigo-500' : 'bg-gray-900 border-gray-700'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    <img src={imgSrc} className="w-full h-full object-contain" alt={label} />
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                         <button onClick={() => inputRef.current?.click()} className="p-2 bg-indigo-600 rounded text-white hover:bg-indigo-500 transition-colors shadow-lg" title="Change Image">
                            <Upload size={16}/>
                         </button>
                         <button onClick={handleRemove} className="p-2 bg-red-600 rounded text-white hover:bg-red-500 transition-colors shadow-lg" title="Remove Image">
                            <Trash size={16}/>
                         </button>
                    </div>
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <Loader2 size={24} className="animate-spin text-white" />
                        </div>
                    )}
                </div>
            ) : (
                <button 
                    onClick={() => inputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`w-full h-24 flex flex-col items-center justify-center transition-all gap-2 group rounded border border-dashed ${
                        isDragging 
                            ? 'bg-indigo-900/50 border-indigo-400 text-indigo-300' 
                            : 'bg-gray-800/50 hover:bg-gray-800 border-gray-600 hover:border-gray-500 text-gray-500'
                    }`}
                >
                    {isLoading ? (
                        <Loader2 size={24} className="animate-spin text-gray-400" />
                    ) : (
                        <>
                            <ImageIcon size={20} className="group-hover:text-gray-300 transition-colors"/>
                            <span className="text-[10px] uppercase font-bold group-hover:text-gray-300 transition-colors">Select or Drop</span>
                        </>
                    )}
                </button>
            )}
        </div>
    );
};

interface VideoFieldProps {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
}

const VideoField: React.FC<VideoFieldProps> = ({ label, value, onChange }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Limit video size roughly to prevent crashes (optional, purely UX)
            if (file.size > 50 * 1024 * 1024) {
                alert("Video file is too large (Max ~50MB recommended for browser storage)");
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                onChange(ev.target?.result as string);
                if (inputRef.current) inputRef.current.value = "";
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="w-full">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{label}</label>
            <input 
                ref={inputRef}
                type="file" 
                onChange={handleFile} 
                className="hidden" 
                accept="video/*"
            />
            
            {value ? (
                <div className="relative group w-full h-24 bg-gray-900 rounded border border-gray-700 flex items-center justify-center overflow-hidden">
                    <AsyncVideo src={value} className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Video size={24} className="text-white opacity-80"/>
                    </div>
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                         <button onClick={() => inputRef.current?.click()} className="p-2 bg-indigo-600 rounded text-white hover:bg-indigo-500 transition-colors shadow-lg" title="Change Video">
                            <Upload size={16}/>
                         </button>
                         <button onClick={() => onChange(null)} className="p-2 bg-red-600 rounded text-white hover:bg-red-500 transition-colors shadow-lg" title="Remove Video">
                            <Trash size={16}/>
                         </button>
                    </div>
                </div>
            ) : (
                <button 
                    onClick={() => inputRef.current?.click()}
                    className="w-full h-24 bg-gray-800/50 hover:bg-gray-800 border border-dashed border-gray-600 hover:border-gray-500 rounded flex flex-col items-center justify-center text-gray-500 transition-all gap-2 group"
                >
                    <Video size={20} className="group-hover:text-gray-300 transition-colors"/>
                    <span className="text-[10px] uppercase font-bold group-hover:text-gray-300 transition-colors">Select Video (Intro)</span>
                </button>
            )}
        </div>
    );
};

interface AudioFieldProps {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
}

const AudioField: React.FC<AudioFieldProps> = ({ label, value, onChange }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 20 * 1024 * 1024) {
                alert("Audio file is too large (Max ~20MB recommended for browser storage)");
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                onChange(ev.target?.result as string);
                if (inputRef.current) inputRef.current.value = "";
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="w-full">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{label}</label>
            <input 
                ref={inputRef}
                type="file" 
                onChange={handleFile} 
                className="hidden" 
                accept="audio/*"
            />
            
            {value ? (
                <div className="relative group w-full h-12 bg-gray-900 rounded border border-gray-700 flex items-center justify-between px-3 overflow-hidden">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Music size={16} className="text-blue-400 flex-shrink-0" />
                        <span className="text-xs text-gray-300 truncate">Audio Selected</span>
                    </div>
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 px-2 border border-blue-500/50 rounded">
                         <button onClick={() => inputRef.current?.click()} className="p-1.5 bg-indigo-600 rounded text-white hover:bg-indigo-500 transition-colors shadow-lg flex items-center gap-1" title="Change Audio">
                            <Upload size={14}/>
                         </button>
                         <button onClick={() => onChange(null)} className="p-1.5 bg-red-600 rounded text-white hover:bg-red-500 transition-colors shadow-lg flex items-center gap-1" title="Remove Audio">
                            <Trash size={14}/>
                         </button>
                    </div>
                </div>
            ) : (
                <button 
                    onClick={() => inputRef.current?.click()}
                    className="w-full h-12 bg-gray-800/50 hover:bg-gray-800 border border-dashed border-gray-600 hover:border-gray-500 rounded flex items-center justify-center text-gray-500 transition-all gap-2 group"
                >
                    <Music size={16} className="group-hover:text-gray-300 transition-colors"/>
                    <span className="text-xs font-bold group-hover:text-gray-300 transition-colors">Select Audio File</span>
                </button>
            )}
        </div>
    );
};

interface CharacterEditorProps {
  character: Character;
  onChange: (u: Partial<Character>) => void;
  onDelete: () => void;
}

const CharacterEditor: React.FC<CharacterEditorProps> = ({ character, onChange, onDelete }) => {
    // Helper for arrays (sprites)
    const updateSpriteArray = (arrName: 'woozySprites' | 'finishAnimation', index: number, val: string | null) => {
        const arr = character[arrName] ? [...character[arrName]!] : [];
        if (val) arr[index] = val;
        else arr.splice(index, 1);
        onChange({ [arrName]: arr });
    };

    // Helper for Relationship
    const updateRelationship = (u: any) => {
        const rel = character.relationship || { enabled: false, currentValue: 0, startValue: 0, triggers: [], thresholds: [] };
        onChange({ relationship: { ...rel, ...u } });
    };

    return (
        <div className="space-y-6 max-w-2xl bg-gray-900/50 p-6 rounded-xl border border-gray-800">
            <div className="flex justify-between items-start">
                <div>
                     <h3 className="text-xl font-bold text-white">{character.name}</h3>
                     <div className="text-xs text-gray-500">ID: {character.id}</div>
                </div>
                <button onClick={onDelete} className="text-red-500 hover:text-red-400 bg-red-900/20 p-2 rounded"><Trash size={18}/></button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                    <input className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" value={character.name} onChange={e => onChange({ name: e.target.value })} />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">RPG Color</label>
                    <div className="flex gap-2">
                        <input type="color" className="h-10 w-10 bg-gray-800 border border-gray-700 rounded cursor-pointer" value={character.rpgColor} onChange={e => onChange({ rpgColor: e.target.value })} />
                        <input className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" value={character.rpgColor} onChange={e => onChange({ rpgColor: e.target.value })} />
                    </div>
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Persona / Description</label>
                <textarea className="w-full bg-gray-800 border border-gray-700 rounded p-2 h-24 text-white" value={character.defaultDescription} onChange={e => onChange({ defaultDescription: e.target.value })} />
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Lore / Backstory</label>
                <textarea 
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 h-20 text-sm text-gray-300" 
                    placeholder="Hidden context for the AI about this character's past..."
                    value={character.lore || ''} 
                    onChange={e => onChange({ lore: e.target.value })} 
                />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <ImageField label="Portrait (Idle/Standard)" value={character.imageSrc} onChange={val => onChange({ imageSrc: val })} />
                <ImageField label="Map Sprite (Small)" value={character.mapSpriteSrc} onChange={val => onChange({ mapSpriteSrc: val })} />
            </div>

            <div className="bg-gray-800 p-4 rounded border border-gray-700">
                <h4 className="font-bold text-gray-400 mb-4 text-xs uppercase">Additional Emotions (Visual Novel)</h4>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <ImageField label="Happy" value={character.emotions?.happy || null} onChange={val => onChange({ emotions: { ...character.emotions, happy: val } })} />
                    <ImageField label="Angry" value={character.emotions?.angry || null} onChange={val => onChange({ emotions: { ...character.emotions, angry: val } })} />
                    <ImageField label="Thoughtful" value={character.emotions?.thoughtful || null} onChange={val => onChange({ emotions: { ...character.emotions, thoughtful: val } })} />
                    <ImageField label="Shy" value={character.emotions?.shy || null} onChange={val => onChange({ emotions: { ...character.emotions, shy: val } })} />
                    <ImageField label="Sad" value={character.emotions?.sad || null} onChange={val => onChange({ emotions: { ...character.emotions, sad: val } })} />
                    <ImageField label="Shocked" value={character.emotions?.shocked || null} onChange={val => onChange({ emotions: { ...character.emotions, shocked: val } })} />
                    <ImageField label="Worried" value={character.emotions?.worried || null} onChange={val => onChange({ emotions: { ...character.emotions, worried: val } })} />
                    <ImageField label="Lustful" value={character.emotions?.lustful || null} onChange={val => onChange({ emotions: { ...character.emotions, lustful: val } })} />
                </div>
            </div>

            {/* RELATIONSHIP SYSTEM EDITOR */}
            <div className="bg-gray-800 p-4 rounded border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                     <h4 className="font-bold text-pink-400 flex items-center gap-2"><Heart size={16}/> Relationship System</h4>
                     <label className="flex items-center gap-2 text-xs bg-gray-900 px-2 py-1 rounded border border-gray-600">
                         <input 
                            type="checkbox" 
                            checked={character.relationship?.enabled || false} 
                            onChange={e => updateRelationship({ enabled: e.target.checked })} 
                         />
                         Enabled
                     </label>
                </div>
                
                {character.relationship?.enabled ? (
                    <div className="space-y-6">
                        {/* Basic Values */}
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                 <label className="text-xs font-bold text-gray-500 uppercase">Start Value</label>
                                 <input type="number" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" value={character.relationship.startValue} onChange={e => updateRelationship({ startValue: parseInt(e.target.value), currentValue: parseInt(e.target.value) })} />
                             </div>
                             <div>
                                 <label className="text-xs font-bold text-gray-500 uppercase">Current (Debug)</label>
                                 <input type="number" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" value={character.relationship.currentValue} onChange={e => updateRelationship({ currentValue: parseInt(e.target.value) })} />
                             </div>
                        </div>

                        {/* TRIGGERS */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">Interaction Triggers (AI Rules)</label>
                                <Button onClick={() => updateRelationship({ triggers: [...character.relationship!.triggers, { id: crypto.randomUUID(), description: 'New Trigger', valueChange: 5 }] })} className="px-2 py-0 text-xs"><Plus size={12}/></Button>
                            </div>
                            <div className="space-y-2">
                                {character.relationship.triggers.map((t, i) => (
                                    <div key={t.id} className="flex items-center gap-2 bg-gray-900 p-2 rounded">
                                        <input 
                                            className="flex-1 bg-transparent border-b border-gray-700 text-xs text-white outline-none" 
                                            value={t.description} 
                                            onChange={e => {
                                                const newTriggers = [...character.relationship!.triggers];
                                                newTriggers[i] = { ...t, description: e.target.value };
                                                updateRelationship({ triggers: newTriggers });
                                            }}
                                            placeholder="e.g. Player is rude..."
                                        />
                                        <input 
                                            type="number"
                                            className={`w-12 bg-gray-800 text-xs text-center rounded border ${t.valueChange > 0 ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}`}
                                            value={t.valueChange}
                                            onChange={e => {
                                                const newTriggers = [...character.relationship!.triggers];
                                                newTriggers[i] = { ...t, valueChange: parseInt(e.target.value) };
                                                updateRelationship({ triggers: newTriggers });
                                            }}
                                        />
                                        <button onClick={() => updateRelationship({ triggers: character.relationship!.triggers.filter(x => x.id !== t.id) })} className="text-gray-500 hover:text-red-500"><Trash size={12}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* THRESHOLDS */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">Stages / Thresholds</label>
                                <Button onClick={() => updateRelationship({ thresholds: [...character.relationship!.thresholds, { id: crypto.randomUUID(), label: 'Neutral', valueStart: 0, description: 'Acts politely.' }] })} className="px-2 py-0 text-xs"><Plus size={12}/></Button>
                            </div>
                            <div className="space-y-3">
                                {character.relationship.thresholds.sort((a,b) => b.valueStart - a.valueStart).map((t, i) => (
                                    <div key={t.id} className="bg-gray-900 p-3 rounded border border-gray-700">
                                        <div className="flex gap-2 mb-2">
                                             <div className="w-20">
                                                 <label className="text-[10px] text-gray-500 block">Min Value</label>
                                                 <input 
                                                    type="number"
                                                    className="w-full bg-gray-800 text-xs p-1 rounded border border-gray-600 text-white"
                                                    value={t.valueStart}
                                                    onChange={e => {
                                                        const newThresholds = [...character.relationship!.thresholds];
                                                        const idx = newThresholds.findIndex(x => x.id === t.id);
                                                        newThresholds[idx] = { ...t, valueStart: parseInt(e.target.value) };
                                                        updateRelationship({ thresholds: newThresholds });
                                                    }}
                                                 />
                                             </div>
                                             <div className="flex-1">
                                                 <label className="text-[10px] text-gray-500 block">Label</label>
                                                  <input 
                                                    className="w-full bg-gray-800 text-xs p-1 rounded border border-gray-600 text-white"
                                                    value={t.label}
                                                    onChange={e => {
                                                        const newThresholds = [...character.relationship!.thresholds];
                                                        const idx = newThresholds.findIndex(x => x.id === t.id);
                                                        newThresholds[idx] = { ...t, label: e.target.value };
                                                        updateRelationship({ thresholds: newThresholds });
                                                    }}
                                                 />
                                             </div>
                                             <button onClick={() => updateRelationship({ thresholds: character.relationship!.thresholds.filter(x => x.id !== t.id) })} className="text-gray-500 hover:text-red-500 mt-4"><Trash size={14}/></button>
                                        </div>
                                        <textarea 
                                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-xs text-gray-300 h-16"
                                            placeholder="Behavior description for this stage..."
                                            value={t.description}
                                            onChange={e => {
                                                const newThresholds = [...character.relationship!.thresholds];
                                                const idx = newThresholds.findIndex(x => x.id === t.id);
                                                newThresholds[idx] = { ...t, description: e.target.value };
                                                updateRelationship({ thresholds: newThresholds });
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="mb-4">
                        <label className="text-xs font-bold text-gray-500 uppercase">Legacy / Simple Relation</label>
                        <input 
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white" 
                            placeholder="e.g. Secretly admires them, Suspicious of them..."
                            value={character.playerRelation || ''} 
                            onChange={e => onChange({ playerRelation: e.target.value })} 
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Enable the full system above for numerical tracking.</p>
                    </div>
                )}
            </div>
            
            {/* Stats Editor for Combat */}
            <div className="bg-gray-800 p-4 rounded border border-gray-700">
                <h4 className="font-bold text-indigo-400 mb-4 flex items-center gap-2"><Sword size={16}/> Combat Stats</h4>
                {!character.stats ? (
                    <Button onClick={() => onChange({ stats: { pra: 3, str: 3, wid: 3, ges: 3, wil: 3, hp: 20, maxHp: 20, limit: 10, recoveryRate: 5, weapon: { name: 'Fists', at: 3, mod: 0, dmg: 1, cap: null } } })}>Enable Combat Stats</Button>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-5 gap-2 text-center">
                           {['pra', 'str', 'wid', 'ges', 'wil'].map(stat => (
                               <div key={stat}>
                                   <div className="text-[10px] uppercase font-bold text-gray-500">{stat}</div>
                                   <input type="number" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-white" value={(character.stats as any)[stat]} onChange={e => onChange({ stats: { ...character.stats!, [stat]: parseInt(e.target.value) } })} />
                               </div>
                           ))}
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                             <div>
                                 <label className="text-xs font-bold text-gray-500">Max HP</label>
                                 <input type="number" className="w-full bg-gray-900 border border-gray-600 rounded p-1 text-white" value={character.stats.maxHp} onChange={e => onChange({ stats: { ...character.stats!, maxHp: parseInt(e.target.value), hp: parseInt(e.target.value) } })} />
                             </div>
                             <div>
                                 <label className="text-xs font-bold text-gray-500">Limit</label>
                                 <input type="number" className="w-full bg-gray-900 border border-gray-600 rounded p-1 text-white" value={character.stats.limit} onChange={e => onChange({ stats: { ...character.stats!, limit: parseInt(e.target.value) } })} />
                             </div>
                             <div>
                                 <label className="text-xs font-bold text-gray-500 text-purple-400">Recovery</label>
                                 <input type="number" className="w-full bg-gray-900 border border-purple-500/50 rounded p-1 text-white" value={character.stats.recoveryRate || 5} onChange={e => onChange({ stats: { ...character.stats!, recoveryRate: parseInt(e.target.value) } })} />
                             </div>
                        </div>

                        {/* Battle Sprites */}
                        <div className="border-t border-gray-700 pt-4 mt-2">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Battle Visuals (Active)</label>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <ImageField label="Idle State" value={character.battleIdleSrc} onChange={val => onChange({ battleIdleSrc: val })} />
                                    <div className="flex items-center gap-1">
                                        <Scaling size={12} className="text-gray-500"/>
                                        <input type="number" step="0.1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-xs p-1 text-white" placeholder="Scale" value={character.battleIdleScale || character.battleScale || 1} onChange={e => onChange({ battleIdleScale: parseFloat(e.target.value) })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-1">
                                        <input type="number" step="1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-[10px] p-1 text-white" placeholder="Off X" value={character.battleIdleOffsetX || 0} onChange={e => onChange({ battleIdleOffsetX: parseInt(e.target.value) || 0 })} title="Offset X" />
                                        <input type="number" step="1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-[10px] p-1 text-white" placeholder="Off Y" value={character.battleIdleOffsetY || 0} onChange={e => onChange({ battleIdleOffsetY: parseInt(e.target.value) || 0 })} title="Offset Y" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <ImageField label="Prep State" value={character.battlePrepSrc} onChange={val => onChange({ battlePrepSrc: val })} />
                                    <div className="flex items-center gap-1">
                                        <Scaling size={12} className="text-gray-500"/>
                                        <input type="number" step="0.1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-xs p-1 text-white" placeholder="Scale" value={character.battlePrepScale || character.battleScale || 1} onChange={e => onChange({ battlePrepScale: parseFloat(e.target.value) })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-1">
                                        <input type="number" step="1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-[10px] p-1 text-white" placeholder="Off X" value={character.battlePrepOffsetX || 0} onChange={e => onChange({ battlePrepOffsetX: parseInt(e.target.value) || 0 })} title="Offset X" />
                                        <input type="number" step="1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-[10px] p-1 text-white" placeholder="Off Y" value={character.battlePrepOffsetY || 0} onChange={e => onChange({ battlePrepOffsetY: parseInt(e.target.value) || 0 })} title="Offset Y" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <ImageField label="Hit Impact" value={character.battleHitSrc} onChange={val => onChange({ battleHitSrc: val })} />
                                    <div className="flex items-center gap-1">
                                        <Scaling size={12} className="text-gray-500"/>
                                        <input type="number" step="0.1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-xs p-1 text-white" placeholder="Scale" value={character.battleHitScale || character.battleScale || 1} onChange={e => onChange({ battleHitScale: parseFloat(e.target.value) })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-1">
                                        <input type="number" step="1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-[10px] p-1 text-white" placeholder="Off X" value={character.battleHitOffsetX || 0} onChange={e => onChange({ battleHitOffsetX: parseInt(e.target.value) || 0 })} title="Offset X" />
                                        <input type="number" step="1" className="w-full bg-gray-900 border border-gray-600 rounded text-center text-[10px] p-1 text-white" placeholder="Off Y" value={character.battleHitOffsetY || 0} onChange={e => onChange({ battleHitOffsetY: parseInt(e.target.value) || 0 })} title="Offset Y" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Woozy & Death Visuals */}
                         <div className="border-t border-gray-700 pt-4 mt-2">
                            <label className="text-xs font-bold text-purple-400 uppercase mb-2 block">Woozy / Death Visuals</label>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="p-2 border border-purple-500/20 rounded bg-purple-900/10">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">Woozy Loop (2-4 Frames)</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[0,1,2,3].map(i => (
                                            <ImageField key={i} label={`Frame ${i+1}`} value={character.woozySprites?.[i] || null} onChange={val => updateSpriteArray('woozySprites', i, val)} />
                                        ))}
                                    </div>
                                </div>
                                <div className="p-2 border border-red-500/20 rounded bg-red-900/10">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">Finish Sequence</div>
                                    <div className="space-y-2">
                                        <ImageField label="Corpse (Static)" value={character.finishSprite || null} onChange={val => onChange({ finishSprite: val })} />
                                        <div className="grid grid-cols-2 gap-2">
                                            {[0,1,2,3].map(i => (
                                                <ImageField key={i} label={`Anim ${i+1}`} value={character.finishAnimation?.[i] || null} onChange={val => updateSpriteArray('finishAnimation', i, val)} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-700 pt-4">
                             <div className="text-xs font-bold text-gray-500 uppercase mb-2">Weapon</div>
                             <div className="grid grid-cols-3 gap-2">
                                <input className="col-span-3 bg-gray-900 border border-gray-600 rounded p-1 text-sm text-white" placeholder="Weapon Name" value={character.stats.weapon.name} onChange={e => onChange({ stats: { ...character.stats!, weapon: { ...character.stats!.weapon, name: e.target.value } } })} />
                                <input type="number" placeholder="AT" title="Attack Dice" className="bg-gray-900 border border-gray-600 rounded p-1 text-white" value={character.stats.weapon.at} onChange={e => onChange({ stats: { ...character.stats!, weapon: { ...character.stats!.weapon, at: parseInt(e.target.value) } } })} />
                                <input type="number" placeholder="DMG" title="Damage" className="bg-gray-900 border border-gray-600 rounded p-1 text-white" value={character.stats.weapon.dmg} onChange={e => onChange({ stats: { ...character.stats!, weapon: { ...character.stats!.weapon, dmg: parseInt(e.target.value) } } })} />
                             </div>
                        </div>

                        <div className="border-t border-gray-700 pt-4 mt-2">
                            <label className="text-xs font-bold text-yellow-500 uppercase mb-2 block">Battle Audio (SFX)</label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <AudioField label="Weapon Hit" value={character.sfxWeaponHit || null} onChange={val => onChange({ sfxWeaponHit: val || null })} />
                                    <AudioField label="Weapon Miss" value={character.sfxWeaponMiss || null} onChange={val => onChange({ sfxWeaponMiss: val || null })} />
                                </div>
                                <div className="space-y-2">
                                    <AudioField label="Voice Hit" value={character.sfxVoiceHit || null} onChange={val => onChange({ sfxVoiceHit: val || null })} />
                                    <AudioField label="Voice Crit" value={character.sfxVoiceCrit || null} onChange={val => onChange({ sfxVoiceCrit: val || null })} />
                                    <AudioField label="Voice Death" value={character.sfxVoiceDeath || null} onChange={val => onChange({ sfxVoiceDeath: val || null })} />
                                </div>
                            </div>
                        </div>

                        <Button variant="danger" className="w-full mt-4 text-xs" onClick={() => onChange({ stats: undefined })}>Disable Combat</Button>
                    </div>
                )}
            </div>
        </div>
    );
};

interface SceneEditorProps {
    scene: Scene;
    allScenes: Scene[];
    allBattles: Battle[];
    allMaps: WorldMap[];
    characters: Character[];
    chapters: Chapter[];
    worldInfo: WorldInfo;
    onChange: (u: Partial<Scene>) => void;
    onDelete: () => void;
}

const SceneEditor: React.FC<SceneEditorProps> = ({ scene, allScenes, allBattles, allMaps, characters, chapters, worldInfo, onChange, onDelete }) => {
    const toggleEffect = (type: 'scene' | 'transition' | 'battle', targetId: string, action: 'unlock' | 'lock') => {
        const effects = scene.effects ? [...scene.effects] : [];
        const index = effects.findIndex(e => e.type === type && e.targetId === targetId);

        if (index >= 0) {
            if (effects[index].action === action) effects.splice(index, 1);
            else effects[index] = { ...effects[index], action };
        } else {
            effects.push({ type, targetId, action });
        }
        onChange({ effects });
    };

    return (
        <div className="space-y-6 max-w-3xl bg-gray-900/50 p-6 rounded-xl border border-gray-800">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-indigo-400">Editing: {scene.name}</h3>
                <div className="flex gap-2">
                    <label className="flex items-center gap-2 text-xs bg-gray-800 px-3 py-1 rounded border border-gray-700">
                        <input type="checkbox" checked={scene.isRepeatable} onChange={e => onChange({ isRepeatable: e.target.checked })} />
                        Repeatable
                    </label>
                    <button onClick={onDelete} className="text-red-500 hover:bg-red-900/20 p-2 rounded"><Trash size={18}/></button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Scene Name</label>
                    <input className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" value={scene.name} onChange={e => onChange({ name: e.target.value })} />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Chapter</label>
                    <select className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" value={scene.chapterId || ''} onChange={e => onChange({ chapterId: e.target.value })}>
                        {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                 </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <ImageField label="Background Image" value={scene.backgroundSrc} onChange={val => onChange({ backgroundSrc: val })} />
                <VideoField label="Intro Video (Optional)" value={scene.introVideoSrc || null} onChange={val => onChange({ introVideoSrc: val })} />
            </div>

            <AudioField label="Background Music (Loop)" value={scene.bgmUrl || null} onChange={val => onChange({ bgmUrl: val || undefined })} />

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Visible Description (Player)</label>
                <textarea className="w-full bg-gray-800 border border-gray-700 rounded p-2 h-20 text-white" value={scene.description} onChange={e => onChange({ description: e.target.value })} />
            </div>

            {/* AI CONTEXT SECTION (RESTORED) */}
            <div className="space-y-3 border-l-2 border-indigo-500/30 pl-4 my-4 bg-indigo-900/10 p-3 rounded-r-lg">
                 <h4 className="text-sm font-bold text-indigo-400 flex items-center gap-2"><EyeOff size={14}/> AI Context (Hidden from Player)</h4>
                 
                 <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-2"><Terminal size={10}/> Internal Instructions / Logic</label>
                    <textarea 
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 h-20 text-xs text-indigo-200 font-mono focus:border-indigo-500 outline-none" 
                        placeholder="e.g. The guard is secretly bribed. Speak in a whisper. Do not mention the artifact yet."
                        value={scene.aiInstructions || ''} 
                        onChange={e => onChange({ aiInstructions: e.target.value })} 
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Sensory Details</label>
                        <textarea 
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 h-16 text-xs text-gray-300 focus:border-indigo-500 outline-none" 
                            placeholder="Smells, sounds, temperature, lighting..."
                            value={scene.sensoryDetails || ''} 
                            onChange={e => onChange({ sensoryDetails: e.target.value })} 
                        />
                     </div>
                     <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Environment / Layout</label>
                        <textarea 
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 h-16 text-xs text-gray-300 focus:border-indigo-500 outline-none" 
                            placeholder="Room size, exits, object placement, cover..."
                            value={scene.environmentDetails || ''} 
                            onChange={e => onChange({ environmentDetails: e.target.value })} 
                        />
                     </div>
                 </div>
            </div>
            
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Win Condition / Goal</label>
                <input className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-emerald-400 font-medium" placeholder="e.g. Find the key, Convince the guard..." value={scene.goal} onChange={e => onChange({ goal: e.target.value })} />
            </div>

            <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                <label className="flex items-center gap-2 text-sm font-bold text-indigo-400 mb-4"><Users size={18} /> CHARACTERS & ROLES</label>
                <div className="space-y-2">
                    {characters.map((c) => {
                        const inScene = scene.characters.find((sc) => sc.characterId === c.id);
                        return (
                            <div key={c.id} className={`flex items-center gap-3 p-2 rounded border ${inScene ? 'bg-indigo-900/30 border-indigo-500' : 'bg-gray-900 border-gray-700 opacity-60'}`}>
                                <input 
                                    type="checkbox" 
                                    checked={!!inScene} 
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            onChange({ characters: [...scene.characters, { characterId: c.id, roleInScene: 'Default' }] });
                                        } else {
                                            onChange({ characters: scene.characters.filter((sc) => sc.characterId !== c.id) });
                                        }
                                    }}
                                />
                                <div className="w-24 font-bold truncate text-white">{c.name}</div>
                                <input 
                                    className="flex-1 bg-transparent border-b border-gray-600 text-xs focus:border-indigo-500 outline-none text-white" 
                                    placeholder="Role in this scene..."
                                    disabled={!inScene}
                                    value={inScene?.roleInScene || ''}
                                    onChange={(e) => {
                                        const newChars = scene.characters.map((sc) => sc.characterId === c.id ? { ...sc, roleInScene: e.target.value } : sc);
                                        onChange({ characters: newChars });
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                <label className="flex items-center gap-2 text-sm font-bold text-indigo-400 mb-4"><Book size={18} /> LORE SCOPING</label>
                
                {/* Lore-Scoping: Factions */}
                <details className="bg-gray-900 rounded-lg p-3">
                  <summary className="cursor-pointer font-semibold text-gray-200">
                    Relevant Factions
                    <span className="text-xs text-gray-400 ml-2">
                      ({scene.relevantFactionIds?.length ?? 0} of {worldInfo.factions?.length || 0} selected)
                    </span>
                  </summary>
                  <p className="text-xs text-gray-400 mt-2 mb-3">
                    Select factions relevant to this scene. If none are selected, ALL factions are loaded (Fallback).
                  </p>
                  <div className="flex gap-2 mb-2">
                    <button 
                      className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white" 
                      onClick={() => onChange({ relevantFactionIds: worldInfo.factions?.map(f => f.id) || [] })}
                    >
                      Select All
                    </button>
                    <button 
                      className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white" 
                      onClick={() => onChange({ relevantFactionIds: [] })}
                    >
                      Select None
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {worldInfo.factions?.map(faction => {
                      const isSelected = scene.relevantFactionIds?.includes(faction.id) ?? false;
                      return (
                        <label key={faction.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:bg-gray-700 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const currentIds = scene.relevantFactionIds ?? [];
                              const newIds = e.target.checked
                                ? [...currentIds, faction.id]
                                : currentIds.filter(id => id !== faction.id);
                              onChange({ relevantFactionIds: newIds });
                            }}
                          />
                          <span className="truncate" title={faction.name}>{faction.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </details>

                {/* Lore-Scoping: Locations */}
                <details className="bg-gray-900 rounded-lg p-3 mt-2">
                  <summary className="cursor-pointer font-semibold text-gray-200">
                    Relevant Lore Locations
                    <span className="text-xs text-gray-400 ml-2">
                      ({scene.relevantLocationIds?.length ?? 0} of {worldInfo.loreLocations?.length || 0} selected)
                    </span>
                  </summary>
                  <p className="text-xs text-gray-400 mt-2 mb-3">
                    Select locations relevant to this scene. If none are selected, ALL locations are loaded.
                  </p>
                  <div className="flex gap-2 mb-2">
                    <button 
                      className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white" 
                      onClick={() => onChange({ relevantLocationIds: worldInfo.loreLocations?.map(l => l.id) || [] })}
                    >
                      Select All
                    </button>
                    <button 
                      className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white" 
                      onClick={() => onChange({ relevantLocationIds: [] })}
                    >
                      Select None
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {worldInfo.loreLocations?.map(location => {
                      const isSelected = scene.relevantLocationIds?.includes(location.id) ?? false;
                      return (
                        <label key={location.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:bg-gray-700 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const currentIds = scene.relevantLocationIds ?? [];
                              const newIds = e.target.checked
                                ? [...currentIds, location.id]
                                : currentIds.filter(id => id !== location.id);
                              onChange({ relevantLocationIds: newIds });
                            }}
                          />
                          <span className="truncate" title={location.name}>{location.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </details>
            </div>

            <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                <label className="flex items-center gap-2 text-sm font-bold text-yellow-500 mb-4"><Unlock size={18} /> SCENE COMPLETION EFFECTS</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-60 overflow-y-auto custom-scrollbar p-1">
                    <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-500 uppercase sticky top-0 bg-gray-800 py-1 z-10">Other Scenes</div>
                        {allScenes.filter(s => s.id !== scene.id).map((otherScene) => {
                            const effect = scene.effects?.find(u => u.type === 'scene' && u.targetId === otherScene.id);
                            const status = effect?.action || 'neutral';
                            return (
                                <div key={otherScene.id} className="flex items-center justify-between bg-gray-900 p-2 rounded border border-gray-700">
                                    <div className="flex items-center gap-2 truncate flex-1">
                                        <MessageSquare size={14} className="text-gray-500"/>
                                        <span className="text-xs text-gray-300 truncate" title={otherScene.name}>{otherScene.name}</span>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => toggleEffect('scene', otherScene.id, 'unlock')} className={`p-1 rounded ${status === 'unlock' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`} title="Unlock"><Unlock size={12}/></button>
                                        <button onClick={() => toggleEffect('scene', otherScene.id, 'lock')} className={`p-1 rounded ${status === 'lock' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`} title="Lock"><Lock size={12}/></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-500 uppercase sticky top-0 bg-gray-800 py-1 z-10">Battles</div>
                        {allBattles.map((b) => {
                            const effect = scene.effects?.find(u => u.type === 'battle' && u.targetId === b.id);
                            const status = effect?.action || 'neutral';
                            return (
                                <div key={b.id} className="flex items-center justify-between bg-gray-900 p-2 rounded border border-gray-700">
                                    <div className="flex items-center gap-2 truncate flex-1">
                                        <Sword size={14} className="text-red-500"/>
                                        <span className="text-xs text-gray-300 truncate" title={b.name}>{b.name}</span>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => toggleEffect('battle', b.id, 'unlock')} className={`p-1 rounded ${status === 'unlock' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`} title="Unlock"><Unlock size={12}/></button>
                                        <button onClick={() => toggleEffect('battle', b.id, 'lock')} className={`p-1 rounded ${status === 'lock' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`} title="Lock"><Lock size={12}/></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-500 uppercase sticky top-0 bg-gray-800 py-1 z-10">Map Transitions</div>
                        {allMaps.map((m) => {
                            const effect = scene.effects?.find(u => u.type === 'transition' && u.targetId === m.id);
                            const status = effect?.action || 'neutral';
                            return (
                                <div key={m.id} className="flex items-center justify-between bg-gray-900 p-2 rounded border border-gray-700">
                                    <div className="flex items-center gap-2 truncate flex-1">
                                        <Waypoints size={14} className="text-emerald-500"/>
                                        <span className="text-xs text-gray-300 truncate" title={m.name}>To: {m.name}</span>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => toggleEffect('transition', m.id, 'unlock')} className={`p-1 rounded ${status === 'unlock' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`} title="Unlock"><Unlock size={12}/></button>
                                        <button onClick={() => toggleEffect('transition', m.id, 'lock')} className={`p-1 rounded ${status === 'lock' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`} title="Lock"><Lock size={12}/></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

interface MapEditorProps {
    map: WorldMap;
    scenes: Scene[];
    characters: Character[];
    battles: Battle[];
    allMaps: WorldMap[];
    onChange: (u: Partial<WorldMap>) => void;
    onDelete: () => void;
}

const MapEditor: React.FC<MapEditorProps> = ({ map, scenes, characters, battles, allMaps, onChange, onDelete }) => {
    // Helper to update spots
    const updateSpot = (id: string, u: Partial<MapSpot>) => {
        onChange({ spots: map.spots.map(s => s.id === id ? { ...s, ...u } : s) });
    };

    const addSpot = (e: React.MouseEvent<HTMLDivElement>) => {
        // Calculate relative position %
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        const newSpot: MapSpot = {
            id: crypto.randomUUID(),
            x, y,
            type: 'scene'
        };
        onChange({ spots: [...map.spots, newSpot] });
    };

    return (
        <div className="space-y-6 max-w-3xl bg-gray-900/50 p-6 rounded-xl border border-gray-800">
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-emerald-400">Editing: {map.name}</h3>
                <button onClick={onDelete} className="text-red-500 hover:bg-red-900/20 p-2 rounded"><Trash size={18}/></button>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Map Name</label>
                <input className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" value={map.name} onChange={e => onChange({ name: e.target.value })} />
            </div>

            <ImageField label="Map Image" value={map.backgroundSrc} onChange={val => onChange({ backgroundSrc: val })} />

            <AudioField label="Background Music (Loop)" value={map.bgmUrl || null} onChange={val => onChange({ bgmUrl: val || undefined })} />

            <div className="relative w-full aspect-video bg-gray-800 border border-gray-600 rounded overflow-hidden cursor-crosshair group">
                {map.backgroundSrc ? (
                    <AsyncImage src={map.backgroundSrc} className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">Click to add spots</div>
                )}
                {/* Click handler overlay */}
                <div className="absolute inset-0 z-10" onClick={addSpot}></div>
                
                {/* Render Spots */}
                {map.spots.map(spot => (
                    <div 
                        key={spot.id} 
                        className="absolute w-6 h-6 -ml-3 -mt-3 bg-indigo-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-xs font-bold z-20 pointer-events-none"
                        style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                    >
                        {spot.type[0].toUpperCase()}
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <h4 className="font-bold text-gray-400 uppercase text-xs">Map Spots</h4>
                {map.spots.map(spot => (
                    <div key={spot.id} className="bg-gray-800 p-3 rounded border border-gray-700 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-mono text-xs text-gray-500">POS: {Math.round(spot.x)}%, {Math.round(spot.y)}%</span>
                            <button onClick={() => onChange({ spots: map.spots.filter(s => s.id !== spot.id) })} className="text-red-500 hover:text-white"><Trash size={14}/></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                             <div>
                                 <label className="text-[10px] font-bold text-gray-500 uppercase">Type</label>
                                 <select 
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-1 text-xs text-white"
                                    value={spot.type}
                                    onChange={e => updateSpot(spot.id, { type: e.target.value as any })}
                                 >
                                     <option value="scene">Scene</option>
                                     <option value="character">Character</option>
                                     <option value="battle">Battle</option>
                                     <option value="transition">Transition</option>
                                 </select>
                             </div>
                             <div>
                                 <label className="text-[10px] font-bold text-gray-500 uppercase">Target</label>
                                 <select 
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-1 text-xs text-white"
                                    value={spot.sceneId || spot.characterId || spot.battleId || spot.targetMapId || ''}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (spot.type === 'scene') updateSpot(spot.id, { sceneId: val });
                                        if (spot.type === 'character') updateSpot(spot.id, { characterId: val });
                                        if (spot.type === 'battle') updateSpot(spot.id, { battleId: val });
                                        if (spot.type === 'transition') updateSpot(spot.id, { targetMapId: val });
                                    }}
                                 >
                                     <option value="">-- Select --</option>
                                     {spot.type === 'scene' && scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                     {spot.type === 'character' && characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                     {spot.type === 'battle' && battles.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                     {spot.type === 'transition' && allMaps.filter(m => m.id !== map.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                 </select>
                             </div>
                        </div>
                        {/* Visual Override */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Visual Override (Optional)</label>
                            <select 
                                className="w-full bg-gray-900 border border-gray-600 rounded p-1 text-xs text-white"
                                value={spot.visualCharacterId || ''}
                                onChange={e => updateSpot(spot.id, { visualCharacterId: e.target.value || undefined })}
                            >
                                <option value="">Default Icon / Sprite</option>
                                {characters.map(c => <option key={c.id} value={c.id}>{c.name} (Sprite)</option>)}
                            </select>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface BattleEditorProps {
    battle: Battle;
    characters: Character[];
    chapters: Chapter[];
    allScenes: Scene[];
    allBattles: Battle[];
    allMaps: WorldMap[];
    onChange: (u: Partial<Battle>) => void;
    onDelete: () => void;
}

const BattleEditor: React.FC<BattleEditorProps> = ({ battle, characters, chapters, allScenes, allBattles, allMaps, onChange, onDelete }) => {
    
    const toggleEffect = (type: 'scene' | 'transition' | 'battle', targetId: string, action: 'unlock' | 'lock') => {
        const effects = battle.onWinEffect ? [...battle.onWinEffect] : [];
        const index = effects.findIndex(e => e.type === type && e.targetId === targetId);

        if (index >= 0) {
            if (effects[index].action === action) effects.splice(index, 1);
            else effects[index] = { ...effects[index], action };
        } else {
            effects.push({ type, targetId, action });
        }
        onChange({ onWinEffect: effects });
    };

    return (
        <div className="space-y-6 max-w-3xl bg-gray-900/50 p-6 rounded-xl border border-gray-800">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-red-400">Editing: {battle.name}</h3>
                <div className="flex gap-2">
                    <label className="flex items-center gap-2 text-xs bg-gray-800 px-3 py-1 rounded border border-gray-700">
                        <input type="checkbox" checked={battle.isRepeatable} onChange={e => onChange({ isRepeatable: e.target.checked })} />
                        Repeatable
                    </label>
                    <button onClick={onDelete} className="text-red-500 hover:bg-red-900/20 p-2 rounded"><Trash size={18}/></button>
                </div>
            </div>

             <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Battle Name</label>
                    <input className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" value={battle.name} onChange={e => onChange({ name: e.target.value })} />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Chapter</label>
                    <select className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" value={battle.chapterId || ''} onChange={e => onChange({ chapterId: e.target.value })}>
                        {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                 </div>
            </div>

            <ImageField label="Battle Background" value={battle.backgroundSrc} onChange={val => onChange({ backgroundSrc: val })} />

            <AudioField label="Background Music (Loop)" value={battle.bgmUrl || null} onChange={val => onChange({ bgmUrl: val || undefined })} />

            <div className="grid grid-cols-2 gap-8">
                {/* Player Team */}
                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                    <h4 className="font-bold text-indigo-400 mb-2 flex items-center gap-2"><Users size={16}/> Player Team</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {characters.map(c => (
                            <label key={c.id} className="flex items-center gap-2 bg-gray-900 p-2 rounded border border-gray-700 cursor-pointer hover:bg-gray-800">
                                <input 
                                    type="checkbox"
                                    checked={battle.playerCharacterIds.includes(c.id)}
                                    onChange={e => {
                                        if (e.target.checked) onChange({ playerCharacterIds: [...battle.playerCharacterIds, c.id] });
                                        else onChange({ playerCharacterIds: battle.playerCharacterIds.filter(id => id !== c.id) });
                                    }}
                                />
                                <span className="text-sm">{c.name}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Enemy Team */}
                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                    <h4 className="font-bold text-red-400 mb-2 flex items-center gap-2"><Target size={16}/> Enemy Team</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                         {characters.map(c => (
                            <label key={c.id} className="flex items-center gap-2 bg-gray-900 p-2 rounded border border-gray-700 cursor-pointer hover:bg-gray-800">
                                <input 
                                    type="checkbox"
                                    checked={battle.enemyCharacterIds.includes(c.id)}
                                    onChange={e => {
                                        if (e.target.checked) onChange({ enemyCharacterIds: [...battle.enemyCharacterIds, c.id] });
                                        else onChange({ enemyCharacterIds: battle.enemyCharacterIds.filter(id => id !== c.id) });
                                    }}
                                />
                                <span className="text-sm">{c.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* Win Effects */}
             <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                <label className="flex items-center gap-2 text-sm font-bold text-yellow-500 mb-4"><Unlock size={18} /> ON WIN: UNLOCKS / LOCKS</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-60 overflow-y-auto custom-scrollbar p-1">
                    {/* Reuse similar logic from SceneEditor for unlocks */}
                    <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-500 uppercase sticky top-0 bg-gray-800 py-1 z-10">Scenes</div>
                        {allScenes.map((s) => {
                            const effect = battle.onWinEffect?.find(u => u.type === 'scene' && u.targetId === s.id);
                            const status = effect?.action || 'neutral';
                            return (
                                <div key={s.id} className="flex items-center justify-between bg-gray-900 p-2 rounded border border-gray-700">
                                    <span className="text-xs text-gray-300 truncate flex-1" title={s.name}>{s.name}</span>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => toggleEffect('scene', s.id, 'unlock')} className={`p-1 rounded ${status === 'unlock' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500'}`}><Unlock size={12}/></button>
                                        <button onClick={() => toggleEffect('scene', s.id, 'lock')} className={`p-1 rounded ${status === 'lock' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-500'}`}><Lock size={12}/></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Add Maps and Battles lists similarly if needed, for now focusing on Scenes which is most common */}
                     <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-500 uppercase sticky top-0 bg-gray-800 py-1 z-10">Map Transitions</div>
                        {allMaps.map((m) => {
                            const effect = battle.onWinEffect?.find(u => u.type === 'transition' && u.targetId === m.id);
                            const status = effect?.action || 'neutral';
                            return (
                                <div key={m.id} className="flex items-center justify-between bg-gray-900 p-2 rounded border border-gray-700">
                                    <span className="text-xs text-gray-300 truncate flex-1" title={m.name}>To: {m.name}</span>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => toggleEffect('transition', m.id, 'unlock')} className={`p-1 rounded ${status === 'unlock' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500'}`}><Unlock size={12}/></button>
                                        <button onClick={() => toggleEffect('transition', m.id, 'lock')} className={`p-1 rounded ${status === 'lock' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-500'}`}><Lock size={12}/></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
};

interface EditorProps {
  worldInfo: WorldInfo;
  chapters: Chapter[];
  characters: Character[];
  scenes: Scene[];
  maps: WorldMap[];
  battles: Battle[];
  storyLog?: StoryLogEntry[]; // New prop for context awareness
  onUpdateWorldInfo: (w: WorldInfo) => void;
  onUpdateChapters: (c: Chapter[]) => void;
  onUpdateCharacters: (c: Character[]) => void;
  onUpdateScenes: (s: Scene[]) => void;
  onUpdateMaps: (m: WorldMap[]) => void;
  onUpdateBattles: (b: Battle[]) => void;
  onPlay: () => void;
  onQuickSave: () => Promise<boolean>;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
  onExportSave?: () => void;
  onImportSave?: (file: File) => void;
  hasSaveGame: boolean;
  onContinueGame: () => void;
}

export const Editor: React.FC<EditorProps> = (props) => {
    const [tab, setTab] = useState<'home' | 'world' | 'chars' | 'scenes' | 'maps' | 'battles'>('home');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [scenePrompt, setScenePrompt] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) props.onImportProject(e.target.files[0]);
    };

    const handleImportSave = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0] && props.onImportSave) props.onImportSave(e.target.files[0]);
    };

    const handleGenerateScene = async () => {
        setIsGenerating(true);
        try {
            const newSceneData = await generateAutoScene(props.characters, props.storyLog || [], props.worldInfo, scenePrompt);
            const id = crypto.randomUUID();
            
            // Build the full scene object
            const newScene: Scene = {
                id,
                chapterId: props.chapters[0]?.id, // Default to first chapter
                name: newSceneData.name || "New Generated Scene",
                locationName: newSceneData.locationName || "Unknown",
                description: newSceneData.description || "",
                goal: newSceneData.goal || "",
                aiInstructions: newSceneData.aiInstructions || "",
                sensoryDetails: newSceneData.sensoryDetails || "",
                environmentDetails: newSceneData.environmentDetails || "",
                characters: newSceneData.characters as any || [],
                backgroundSrc: null,
                effects: [],
                isRepeatable: false
            };

            props.onUpdateScenes([...props.scenes, newScene]);
            setSelectedId(id);
        } catch (error) {
            alert("Failed to generate scene. Check console.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden text-sm">
            {/* Mobile Sidebar Toggle Button */}
            <button
                className="md:hidden absolute top-4 right-4 z-50 p-2 bg-gray-800 rounded-md text-white border border-gray-700"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
                <Layout size={20} />
            </button>

            {/* Sidebar */}
            <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} md:w-64 transition-all duration-300 ease-in-out bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 z-40 relative md:static absolute inset-y-0 left-0 overflow-hidden`}>
                <div className="p-3 md:p-4 border-b border-gray-800 flex justify-between items-center whitespace-nowrap min-w-[16rem]">
                    <h1 className="text-lg md:text-xl font-bold text-indigo-500 flex items-center gap-2"><Layout size={18}/> VN Creator</h1>
                    <button className="md:hidden text-gray-500" onClick={() => setIsSidebarOpen(false)}><XCircle size={20}/></button>
                </div>
                <div className="flex-1 overflow-y-auto py-2 md:py-4 space-y-1 min-w-[16rem]">
                    <button onClick={() => { setTab('home'); setSelectedId(null); setIsSidebarOpen(false); }} className={`w-full text-left px-4 md:px-6 py-2 md:py-3 flex items-center gap-3 ${tab === 'home' ? 'bg-indigo-900/30 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800'}`}><Play size={16}/> Home Settings</button>
                    <button onClick={() => { setTab('world'); setSelectedId(null); setIsSidebarOpen(false); }} className={`w-full text-left px-4 md:px-6 py-2 md:py-3 flex items-center gap-3 ${tab === 'world' ? 'bg-indigo-900/30 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800'}`}><Book size={16}/> World & Lore</button>
                    <button onClick={() => { setTab('chars'); setSelectedId(null); setIsSidebarOpen(false); }} className={`w-full text-left px-4 md:px-6 py-2 md:py-3 flex items-center gap-3 ${tab === 'chars' ? 'bg-indigo-900/30 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800'}`}><Users size={16}/> Characters</button>
                    <button onClick={() => { setTab('scenes'); setSelectedId(null); setIsSidebarOpen(false); }} className={`w-full text-left px-4 md:px-6 py-2 md:py-3 flex items-center gap-3 ${tab === 'scenes' ? 'bg-indigo-900/30 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800'}`}><Monitor size={16}/> Scenes</button>
                    <button onClick={() => { setTab('maps'); setSelectedId(null); setIsSidebarOpen(false); }} className={`w-full text-left px-4 md:px-6 py-2 md:py-3 flex items-center gap-3 ${tab === 'maps' ? 'bg-indigo-900/30 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800'}`}><MapIcon size={16}/> Maps</button>
                    <button onClick={() => { setTab('battles'); setSelectedId(null); setIsSidebarOpen(false); }} className={`w-full text-left px-4 md:px-6 py-2 md:py-3 flex items-center gap-3 ${tab === 'battles' ? 'bg-indigo-900/30 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800'}`}><Target size={16}/> Battles</button>
                </div>
            </div>
            
            {/* Backdrop for mobile sidebar */}
            {isSidebarOpen && <div className="md:hidden fixed inset-0 bg-black/60 z-30" onClick={() => setIsSidebarOpen(false)} />}

            {/* Main Content */}
            <div className="flex-1 bg-gray-950 flex flex-col w-full min-w-0 h-full">
                <div className="flex-1 p-4 md:p-8 overflow-hidden flex flex-col">
                {/* ... (Existing World and Chars Tabs) ... */}
                {tab === 'home' && (
                    <div className="max-w-3xl mx-auto w-full space-y-8 overflow-y-auto h-full pb-12 pt-4">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
                                <Layout size={32} className="text-indigo-500" /> VN Creator UI
                            </h2>
                            <p className="text-gray-400">Manage your project and launch the game.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 space-y-4">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Play className="text-green-500" size={20}/> Play Game</h3>
                                <Button onClick={props.onPlay} className="w-full justify-center bg-green-600 hover:bg-green-500 py-3 text-base font-semibold"><Play size={18} className="mr-2"/> Start New Game</Button>
                                {props.hasSaveGame && <Button onClick={props.onContinueGame} variant="secondary" className="w-full justify-center py-3 text-base font-semibold"><Play size={18} className="mr-2"/> Continue Save Game</Button>}
                            </div>

                            <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 space-y-4">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Save className="text-blue-500" size={20}/> Save Data Management</h3>
                                <p className="text-xs text-gray-400 mb-2">Save progress locally or export/import save files.</p>
                                <div className="grid grid-cols-1 gap-3">
                                    <Button variant="secondary" onClick={props.onQuickSave} title="Quick Save to Local Storage" className="py-2 justify-center"><Save size={16} className="mr-2"/> Quick Save locally</Button>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button variant="secondary" onClick={props.onExportSave} title="Export Save Game to File" className="py-2 justify-center"><Download size={16} className="mr-2"/> Export Save</Button>
                                        <div className="relative">
                                            <Button variant="secondary" className="w-full py-2 justify-center" title="Import Save Game from File"><Upload size={16} className="mr-2"/> Import Save</Button>
                                            <input type="file" onChange={handleImportSave} className="absolute inset-0 opacity-0 cursor-pointer" accept=".json"/>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 space-y-4 md:col-span-2">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Download className="text-purple-500" size={20}/> Project Data (Editor)</h3>
                                <p className="text-xs text-gray-400 mb-4">Export or import the full VN Creator project (characters, scenes, chapters, lore, maps, battles). This does not include game progress.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Button variant="secondary" onClick={props.onExportProject} title="Export Editor Project" className="py-3 justify-center font-semibold text-purple-400 border-purple-500/30 hover:bg-purple-900/20"><Download size={18} className="mr-2"/> Export Full Project</Button>
                                    <div className="relative">
                                        <Button variant="secondary" className="w-full py-3 justify-center font-semibold text-purple-400 border-purple-500/30 hover:bg-purple-900/20" title="Import Editor Project"><Upload size={18} className="mr-2"/> Import Full Project</Button>
                                        <input type="file" onChange={handleImport} className="absolute inset-0 opacity-0 cursor-pointer" accept=".json,.zip"/>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {tab === 'world' && (
                    <div className="max-w-4xl space-y-8 overflow-y-auto h-full pr-4 pb-12">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Book size={24}/> World Settings</h2>
                            <p className="text-gray-400 text-sm mb-6">Define the global context, lore, and rules for the AI Game Master.</p>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 mb-1"><Book size={14}/> World Description</label>
                                    <textarea 
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-3 h-32 text-white focus:border-indigo-500 outline-none" 
                                        placeholder="General setting, atmosphere, time period, and major themes..."
                                        value={props.worldInfo.description} 
                                        onChange={e => props.onUpdateWorldInfo({ ...props.worldInfo, description: e.target.value })} 
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-indigo-400 uppercase flex items-center gap-2 mb-1"><Terminal size={14}/> System Prompt (AI Instructions)</label>
                                    <textarea 
                                        className="w-full bg-gray-900 border border-indigo-900/50 rounded p-3 h-32 text-indigo-100 font-mono text-sm focus:border-indigo-500 outline-none" 
                                        placeholder="Technical instructions for the AI (e.g. 'Speak in Shakespearean English', 'Always be sarcastic', 'Focus on horror elements')..."
                                        value={props.worldInfo.systemInstruction || ''} 
                                        onChange={e => props.onUpdateWorldInfo({ ...props.worldInfo, systemInstruction: e.target.value })} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-gray-800 pt-8">
                             {/* LOCATIONS */}
                             <div className="space-y-4">
                                 <div className="flex justify-between items-center">
                                     <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2"><MapPin size={18}/> Key Locations</h3>
                                     <Button onClick={() => props.onUpdateWorldInfo({ ...props.worldInfo, loreLocations: [...props.worldInfo.loreLocations, { id: crypto.randomUUID(), name: 'New Location', description: '' }] })} className="text-xs px-2 py-1"><Plus size={14}/></Button>
                                 </div>
                                 <div className="space-y-3">
                                     {props.worldInfo.loreLocations.length === 0 && <div className="text-gray-600 text-sm italic">No specific lore locations defined.</div>}
                                     {props.worldInfo.loreLocations.map((loc, i) => (
                                         <div key={loc.id} className="bg-gray-900 border border-gray-700 rounded p-3 space-y-2 group">
                                             <div className="flex justify-between items-center">
                                                 <input 
                                                    className="bg-transparent font-bold text-emerald-200 border-b border-transparent focus:border-emerald-500 outline-none text-sm w-full"
                                                    placeholder="Location Name"
                                                    value={loc.name}
                                                    onChange={(e) => {
                                                        const newLocs = [...props.worldInfo.loreLocations];
                                                        newLocs[i] = { ...loc, name: e.target.value };
                                                        props.onUpdateWorldInfo({ ...props.worldInfo, loreLocations: newLocs });
                                                    }}
                                                 />
                                                 <button 
                                                    onClick={() => props.onUpdateWorldInfo({ ...props.worldInfo, loreLocations: props.worldInfo.loreLocations.filter(l => l.id !== loc.id) })}
                                                    className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                 ><Trash size={14}/></button>
                                             </div>
                                             <textarea 
                                                className="w-full bg-gray-800 text-gray-300 text-xs p-2 rounded border border-gray-700 focus:border-emerald-500 outline-none resize-none h-20"
                                                placeholder="Description for AI context..."
                                                value={loc.description}
                                                onChange={(e) => {
                                                    const newLocs = [...props.worldInfo.loreLocations];
                                                    newLocs[i] = { ...loc, description: e.target.value };
                                                    props.onUpdateWorldInfo({ ...props.worldInfo, loreLocations: newLocs });
                                                }}
                                             />
                                         </div>
                                     ))}
                                 </div>
                             </div>

                             {/* FACTIONS */}
                             <div className="space-y-4">
                                 <div className="flex justify-between items-center">
                                     <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2"><Users size={18}/> Groups / Factions</h3>
                                     <Button onClick={() => props.onUpdateWorldInfo({ ...props.worldInfo, factions: [...props.worldInfo.factions, { id: crypto.randomUUID(), name: 'New Group', description: '' }] })} className="text-xs px-2 py-1"><Plus size={14}/></Button>
                                 </div>
                                 <div className="space-y-3">
                                     {props.worldInfo.factions.length === 0 && <div className="text-gray-600 text-sm italic">No groups defined.</div>}
                                     {props.worldInfo.factions.map((fac, i) => (
                                         <div key={fac.id} className="bg-gray-900 border border-gray-700 rounded p-3 space-y-2 group">
                                             <div className="flex justify-between items-center">
                                                 <input 
                                                    className="bg-transparent font-bold text-amber-200 border-b border-transparent focus:border-amber-500 outline-none text-sm w-full"
                                                    placeholder="Group Name (e.g. Nobles)"
                                                    value={fac.name}
                                                    onChange={(e) => {
                                                        const newFacs = [...props.worldInfo.factions];
                                                        newFacs[i] = { ...fac, name: e.target.value };
                                                        props.onUpdateWorldInfo({ ...props.worldInfo, factions: newFacs });
                                                    }}
                                                 />
                                                 <button 
                                                    onClick={() => props.onUpdateWorldInfo({ ...props.worldInfo, factions: props.worldInfo.factions.filter(f => f.id !== fac.id) })}
                                                    className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                 ><Trash size={14}/></button>
                                             </div>
                                             <textarea 
                                                className="w-full bg-gray-800 text-gray-300 text-xs p-2 rounded border border-gray-700 focus:border-amber-500 outline-none resize-none h-20"
                                                placeholder="Description of behavior, hierarchy, etc..."
                                                value={fac.description}
                                                onChange={(e) => {
                                                    const newFacs = [...props.worldInfo.factions];
                                                    newFacs[i] = { ...fac, description: e.target.value };
                                                    props.onUpdateWorldInfo({ ...props.worldInfo, factions: newFacs });
                                                }}
                                             />
                                         </div>
                                     ))}
                                 </div>
                             </div>
                        </div>
                    </div>
                )}

                {tab === 'chars' && (
                    <div className="flex flex-col md:flex-row h-full gap-4 md:gap-6">
                        <div className={`w-full md:w-1/3 border-none md:border-r border-gray-800 pb-4 md:pb-0 md:pr-4 overflow-y-auto ${selectedId ? 'hidden md:block' : 'block'}`}>
                             <Button className="w-full mb-4 py-1.5 text-sm" onClick={() => {
                                 const id = crypto.randomUUID();
                                 props.onUpdateCharacters([...props.characters, { 
                                     id, 
                                     name: 'New Character', 
                                     defaultDescription: '', 
                                     rpgColor: '#ffffff',
                                     imageSrc: null,
                                     mapSpriteSrc: null 
                                 }]);
                                 setSelectedId(id);
                             }}><Plus size={14}/> Add Character</Button>
                             <div className="space-y-2">
                                 {props.characters.map(c => (
                                     <div key={c.id} onClick={() => setSelectedId(c.id)} className={`p-2 md:p-3 rounded cursor-pointer border text-sm ${selectedId === c.id ? 'bg-indigo-900/50 border-indigo-500' : 'bg-gray-900 border-gray-800 hover:bg-gray-800'}`}>
                                         <div className="font-bold text-white">{c.name}</div>
                                     </div>
                                 ))}
                             </div>
                        </div>
                        <div className={`flex-1 overflow-y-auto ${!selectedId ? 'hidden md:block' : 'block'}`}>
                             {selectedId && props.characters.find(c => c.id === selectedId) && (
                                 <div className="flex flex-col h-full">
                                     <button className="md:hidden mb-4 text-indigo-400 font-bold flex items-center gap-1.5" onClick={() => setSelectedId(null)}>
                                         <ArrowLeft size={16}/> Back to Characters
                                     </button>
                                     <CharacterEditor 
                                        key={selectedId}
                                        character={props.characters.find(c => c.id === selectedId)!}
                                        onChange={(u) => props.onUpdateCharacters(props.characters.map(x => x.id === selectedId ? { ...x, ...u } : x))}
                                        onDelete={() => {
                                            props.onUpdateCharacters(props.characters.filter(x => x.id !== selectedId));
                                            setSelectedId(null);
                                        }}
                                     />
                                 </div>
                             )}
                        </div>
                    </div>
                )}

                {tab === 'scenes' && (
                    <div className="flex flex-col md:flex-row h-full gap-4 md:gap-6">
                        <div className={`w-full md:w-1/3 border-none md:border-r border-gray-800 pb-4 md:pb-0 md:pr-4 overflow-y-auto ${selectedId ? 'hidden md:block' : 'block'}`}>
                             <div className="flex gap-2 mb-2">
                                <Button className="flex-1 py-1.5 text-sm" onClick={() => { const id = crypto.randomUUID(); props.onUpdateScenes([...props.scenes, { id, name: 'New Scene', description: '', goal: '', characters: [], backgroundSrc: null }]); setSelectedId(id); }}><Plus size={14}/> Add Scene</Button>
                                <Button 
                                    className="bg-purple-600 hover:bg-purple-500 shadow-purple-500/20 py-1.5" 
                                    title="Auto-Generate Scene from Story Log"
                                    onClick={handleGenerateScene}
                                    disabled={isGenerating}
                                >
                                    {isGenerating ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                                </Button>
                             </div>
                             <input 
                                type="text"
                                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white text-xs mb-4 placeholder-gray-500"
                                placeholder="Optional prompt for AI (e.g. 'Beach episode')"
                                value={scenePrompt}
                                onChange={e => setScenePrompt(e.target.value)}
                             />
                             
                             <div className="space-y-2">{props.scenes.map(s => (<div key={s.id} onClick={() => setSelectedId(s.id)} className={`p-2 md:p-3 rounded cursor-pointer border text-sm ${selectedId === s.id ? 'bg-indigo-900/50 border-indigo-500' : 'bg-gray-900 border-gray-800 hover:bg-gray-800'}`}><div className="font-bold text-white truncate">{s.name}</div><div className="text-xs text-gray-500 truncate">{s.goal || 'No goal'}</div></div>))}</div>
                        </div>
                        <div className={`flex-1 overflow-y-auto ${!selectedId ? 'hidden md:block' : 'block'}`}>
                            {selectedId && props.scenes.find(s => s.id === selectedId) && (
                                <div className="flex flex-col h-full">
                                     <button className="md:hidden mb-4 text-indigo-400 font-bold flex items-center gap-1.5" onClick={() => setSelectedId(null)}>
                                         <ArrowLeft size={16}/> Back to Scenes
                                     </button>
                                     <SceneEditor key={selectedId} scene={props.scenes.find(s => s.id === selectedId)!} allScenes={props.scenes} allBattles={props.battles} allMaps={props.maps} characters={props.characters} chapters={props.chapters} worldInfo={props.worldInfo} onChange={(u) => props.onUpdateScenes(props.scenes.map(x => x.id === selectedId ? { ...x, ...u } : x))} onDelete={() => { props.onUpdateScenes(props.scenes.filter(x => x.id !== selectedId)); setSelectedId(null); }} />
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {tab === 'maps' && (
                     <div className="flex flex-col md:flex-row h-full gap-4 md:gap-6">
                        <div className={`w-full md:w-1/3 border-none md:border-r border-gray-800 pb-4 md:pb-0 md:pr-4 overflow-y-auto ${selectedId ? 'hidden md:block' : 'block'}`}>
                             <Button className="w-full mb-4 py-1.5 text-sm" onClick={() => { const id = crypto.randomUUID(); props.onUpdateMaps([...props.maps, { id, name: 'New Map', backgroundSrc: null, spots: [] }]); setSelectedId(id); }}><Plus size={14}/> Add Map</Button>
                             <div className="space-y-2">{props.maps.map(m => (<div key={m.id} onClick={() => setSelectedId(m.id)} className={`p-2 md:p-3 rounded cursor-pointer border text-sm ${selectedId === m.id ? 'bg-indigo-900/50 border-indigo-500' : 'bg-gray-900 border-gray-800 hover:bg-gray-800'}`}><div className="font-bold text-white">{m.name}</div></div>))}</div>
                        </div>
                        <div className={`flex-1 overflow-y-auto ${!selectedId ? 'hidden md:block' : 'block'}`}>
                            {selectedId && props.maps.find(m => m.id === selectedId) && (
                                <div className="flex flex-col h-full">
                                    <button className="md:hidden mb-4 text-indigo-400 font-bold flex items-center gap-1.5" onClick={() => setSelectedId(null)}>
                                        <ArrowLeft size={16}/> Back to Maps
                                    </button>
                                    <MapEditor key={selectedId} map={props.maps.find(m => m.id === selectedId)!} scenes={props.scenes} characters={props.characters} battles={props.battles} allMaps={props.maps} onChange={(u) => props.onUpdateMaps(props.maps.map(x => x.id === selectedId ? { ...x, ...u } : x))} onDelete={() => { props.onUpdateMaps(props.maps.filter(x => x.id !== selectedId)); setSelectedId(null); }} />
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {tab === 'battles' && (
                     <div className="flex flex-col md:flex-row h-full gap-4 md:gap-6">
                        <div className={`w-full md:w-1/3 border-none md:border-r border-gray-800 pb-4 md:pb-0 md:pr-4 overflow-y-auto ${selectedId ? 'hidden md:block' : 'block'}`}>
                             <Button className="w-full mb-4 py-1.5 text-sm" onClick={() => { const id = crypto.randomUUID(); props.onUpdateBattles([...props.battles, { id, name: 'New Battle', backgroundSrc: null, playerCharacterIds: [], enemyCharacterIds: [], isRepeatable: false }]); setSelectedId(id); }}><Plus size={14}/> Add Battle</Button>
                             <div className="space-y-2">{props.battles.map(b => (<div key={b.id} onClick={() => setSelectedId(b.id)} className={`p-2 md:p-3 rounded cursor-pointer border text-sm ${selectedId === b.id ? 'bg-indigo-900/50 border-indigo-500' : 'bg-gray-900 border-gray-800 hover:bg-gray-800'}`}><div className="font-bold text-white">{b.name}</div></div>))}</div>
                        </div>
                        <div className={`flex-1 overflow-y-auto ${!selectedId ? 'hidden md:block' : 'block'}`}>
                            {selectedId && props.battles.find(b => b.id === selectedId) && (
                                <div className="flex flex-col h-full">
                                    <button className="md:hidden mb-4 text-indigo-400 font-bold flex items-center gap-1.5" onClick={() => setSelectedId(null)}>
                                        <ArrowLeft size={16}/> Back to Battles
                                    </button>
                                    <BattleEditor key={selectedId} battle={props.battles.find(b => b.id === selectedId)!} characters={props.characters} chapters={props.chapters} allScenes={props.scenes} allBattles={props.battles} allMaps={props.maps} onChange={(u) => props.onUpdateBattles(props.battles.map(x => x.id === selectedId ? { ...x, ...u } : x))} onDelete={() => { props.onUpdateBattles(props.battles.filter(x => x.id !== selectedId)); setSelectedId(null); }} />
                                </div>
                            )}
                        </div>
                    </div>
                )}
                </div>
            </div>
        </div>
    );
};