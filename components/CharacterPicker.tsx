import React from 'react';

// Base path for GitHub Pages deployment - Vite's base config handles this
const BASE_PATH = '/the-chameleon';

// Mysterious vintage character portraits (Rusty Lake style)
// These are locally hosted custom-generated portraits
export const CHARACTERS = [
    { id: 'gentleman', image: `${BASE_PATH}/avatars/avatar_gentleman_1766086639221.png`, name: 'The Gentleman' },
    { id: 'flapper', image: `${BASE_PATH}/avatars/avatar_flapper_1766086653579.png`, name: 'The Flapper' },
    { id: 'detective', image: `${BASE_PATH}/avatars/avatar_detective_1766086737009.png`, name: 'The Detective' },
    { id: 'aristocrat', image: `${BASE_PATH}/avatars/avatar_monocle_1766086750277.png`, name: 'The Aristocrat' },
    { id: 'veiled', image: `${BASE_PATH}/avatars/avatar_veiled_1766086778514.png`, name: 'The Veiled Lady' },
    { id: 'owl', image: `${BASE_PATH}/avatars/avatar_owl_1766086667881.png`, name: 'The Owl' },
    { id: 'deer', image: `${BASE_PATH}/avatars/avatar_deer_1766086681201.png`, name: 'The Deer' },
    { id: 'crow', image: `${BASE_PATH}/avatars/avatar_crow_1766086707462.png`, name: 'The Crow' },
    { id: 'rabbit', image: `${BASE_PATH}/avatars/avatar_rabbit_1766086721873.png`, name: 'The Rabbit' },
];

// Get character avatar URL
export const getCharacterUrl = (style: string, seed: string) => {
    // For backward compatibility, check if this is actually a character ID
    const char = CHARACTERS.find(c => c.id === seed || c.id === style);
    if (char) return char.image;
    // Fallback to first character
    return CHARACTERS[0].image;
};

// Get character by ID
export const getCharacterById = (id: string) =>
    CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

interface CharacterPickerProps {
    selectedCharacterId: string;
    onSelect: (characterId: string) => void;
}

export const CharacterPicker: React.FC<CharacterPickerProps> = ({
    selectedCharacterId,
    onSelect,
}) => {
    const selectedChar = getCharacterById(selectedCharacterId);

    return (
        <div className="space-y-4">
            <p className="text-parchment/70 text-sm text-center font-serif">Choose your character</p>

            {/* Preview of selected character */}
            <div className="flex justify-center">
                <div className="relative">
                    <img
                        src={selectedChar.image}
                        className="w-24 h-24 rounded-full object-cover border-4 border-brass shadow-lg bg-loungeDark"
                        alt={selectedChar.name}
                    />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-antiqueGold text-loungeDark text-xs px-2 py-0.5 rounded-full font-bold font-serif whitespace-nowrap">
                        {selectedChar.name}
                    </div>
                </div>
            </div>

            {/* Character grid */}
            <div className="grid grid-cols-3 gap-3 p-2 bg-shadow/30 rounded-lg border border-brass/20">
                {CHARACTERS.map((char) => (
                    <button
                        key={char.id}
                        onClick={() => onSelect(char.id)}
                        className={`p-1 rounded-lg transition-all transform ${selectedCharacterId === char.id
                            ? 'bg-antiqueGold ring-2 ring-yellow-600 scale-105'
                            : 'bg-loungeDark/50 hover:bg-shadow hover:scale-102'
                            }`}
                    >
                        <img
                            src={char.image}
                            className="w-full aspect-square rounded-md object-cover"
                            alt={char.name}
                        />
                    </button>
                ))}
            </div>
        </div>
    );
};

export default CharacterPicker;
