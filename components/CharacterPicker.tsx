import React from 'react';

// Available characters - each has a FIXED seed so they always look the same
// Using unique seeds ensures consistent, recognizable characters
// Styles: notionists (hand-drawn), open-peeps (illustrated), big-ears (cute), thumbs (fun)
export const CHARACTERS = [
    { id: 'char1', style: 'notionists', seed: 'Felix', name: 'Felix' },
    { id: 'char2', style: 'notionists', seed: 'Sophie', name: 'Sophie' },
    { id: 'char3', style: 'notionists', seed: 'Charlie', name: 'Charlie' },
    { id: 'char4', style: 'notionists', seed: 'Emma', name: 'Emma' },
    { id: 'char5', style: 'open-peeps', seed: 'Max', name: 'Max' },
    { id: 'char6', style: 'open-peeps', seed: 'Lily', name: 'Lily' },
    { id: 'char7', style: 'open-peeps', seed: 'Oscar', name: 'Oscar' },
    { id: 'char8', style: 'open-peeps', seed: 'Mia', name: 'Mia' },
    { id: 'char9', style: 'big-ears', seed: 'Jack', name: 'Jack' },
    { id: 'char10', style: 'big-ears', seed: 'Ruby', name: 'Ruby' },
    { id: 'char11', style: 'big-ears', seed: 'Harry', name: 'Harry' },
    { id: 'char12', style: 'big-ears', seed: 'Poppy', name: 'Poppy' },
    { id: 'char13', style: 'thumbs', seed: 'Leo', name: 'Leo' },
    { id: 'char14', style: 'thumbs', seed: 'Ivy', name: 'Ivy' },
    { id: 'char15', style: 'thumbs', seed: 'Alfie', name: 'Alfie' },
    { id: 'char16', style: 'thumbs', seed: 'Daisy', name: 'Daisy' },
];

// Generate avatar URL for a specific character
export const getCharacterUrl = (style: string, seed: string) =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

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
            <p className="text-white/70 text-sm text-center">Choose your character</p>

            {/* Preview of selected character */}
            <div className="flex justify-center">
                <div className="relative">
                    <img
                        src={getCharacterUrl(selectedChar.style, selectedChar.seed)}
                        className="w-24 h-24 rounded-full bg-white border-4 border-gold shadow-lg"
                        alt="Your character"
                    />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gold text-feltDark text-xs px-2 py-0.5 rounded-full font-bold">
                        {selectedChar.name}
                    </div>
                </div>
            </div>

            {/* Character grid - FIXED sprites that don't change */}
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-black/20 rounded-lg">
                {CHARACTERS.map((char) => (
                    <button
                        key={char.id}
                        onClick={() => onSelect(char.id)}
                        className={`p-1 rounded-lg transition-all ${selectedCharacterId === char.id
                            ? 'bg-gold ring-2 ring-yellow-300 scale-105'
                            : 'bg-white/10 hover:bg-white/20'
                            }`}
                    >
                        <img
                            src={getCharacterUrl(char.style, char.seed)}
                            className="w-full aspect-square rounded-md bg-white"
                            alt={char.name}
                        />
                    </button>
                ))}
            </div>
        </div>
    );
};

export default CharacterPicker;

