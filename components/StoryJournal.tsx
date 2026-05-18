
import React, { useState } from 'react';
import { StoryLogEntry } from '../types';
import { Button } from './ui/Button';
import { Book, X, Edit2, Check, MapPin, Users } from 'lucide-react';

interface StoryJournalProps {
    entries: StoryLogEntry[];
    onClose: () => void;
    onUpdateEntry: (id: string, newSummary: string) => void;
}

export const StoryJournal: React.FC<StoryJournalProps> = ({ entries, onClose, onUpdateEntry }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    const startEditing = (entry: StoryLogEntry) => {
        setEditingId(entry.id);
        setEditText(entry.summary);
    };

    const saveEdit = (id: string) => {
        onUpdateEntry(id, editText);
        setEditingId(null);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 w-full max-w-3xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-600 rounded-lg text-white">
                            <Book size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Story Journal</h2>
                            <p className="text-xs text-gray-400">Chronicles of your journey</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gray-900/50">
                    {entries.length === 0 ? (
                        <div className="text-center text-gray-500 italic mt-20">
                            No entries yet. Complete a scene to add to your story.
                        </div>
                    ) : (
                        entries.map((entry, index) => (
                            <div key={entry.id} className="relative pl-8 border-l-2 border-indigo-500/30 last:border-0 pb-8 last:pb-0">
                                {/* Timeline Dot */}
                                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-gray-900 border-2 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                                
                                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h3 className="font-bold text-lg text-indigo-300">{entry.sceneName}</h3>
                                            <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                                                <span className="flex items-center gap-1"><MapPin size={12}/> {entry.locationName}</span>
                                                <span className="flex items-center gap-1"><Users size={12}/> {entry.charactersInvolved.join(', ')}</span>
                                            </div>
                                        </div>
                                        {editingId !== entry.id && (
                                            <button onClick={() => startEditing(entry)} className="text-gray-500 hover:text-indigo-400 p-1" title="Edit Summary">
                                                <Edit2 size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {editingId === entry.id ? (
                                        <div className="mt-3">
                                            <textarea 
                                                className="w-full bg-black/30 border border-gray-600 rounded-lg p-3 text-sm text-gray-200 focus:border-indigo-500 outline-none min-h-[100px]"
                                                value={editText}
                                                onChange={(e) => setEditText(e.target.value)}
                                            />
                                            <div className="flex justify-end gap-2 mt-2">
                                                <Button variant="secondary" onClick={() => setEditingId(null)} className="text-xs py-1">Cancel</Button>
                                                <Button onClick={() => saveEdit(entry.id)} className="text-xs py-1"><Check size={14}/> Save</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-serif text-gray-200/90">
                                            {entry.summary}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
};
