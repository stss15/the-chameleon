import React from 'react';

// Available characters - each has a FIXED seed so they always look the same
// Using unique seeds ensures consistent, recognizable characters
export const CHARACTERS = [
    { id: 'char1', style: 'adventurer', seed: 'Alex', name: 'Alex' },
    { id: 'char2', style: 'adventurer', seed: 'Sam', name: 'Sam' },
    { id: 'char3', style: 'avataaars', seed: 'Chris', name: 'Chris' },
    { id: 'char4', style: 'avataaars', seed: 'Jordan', name: 'Jordan' },
    { id: 'char5', style: 'bottts', seed: 'Robo1', name: 'Spark' },
    { id: 'char6', style: 'bottts', seed: 'Robo2', name: 'Bolt' },
    { id: 'char7', style: 'pixel-art', seed: 'Pixel1', name: 'Bit' },
    { id: 'char8', style: 'pixel-art', seed: 'Pixel2', name: 'Byte' },
    { id: 'char9', style: 'big-smile', seed: 'Happy1', name: 'Joy' },
    { id: 'char10', style: 'big-smile', seed: 'Happy2', name: 'Bliss' },
    { id: 'char11', style: 'lorelei', seed: 'Lore1', name: 'Luna' },
    { id: 'char12', style: 'lorelei', seed: 'Lore2', name: 'Nova' },
    { id: 'char13', style: 'fun-emoji', seed: 'Emoji1', name: 'Sunny' },
    { id: 'char14', style: 'fun-emoji', seed: 'Emoji2', name: 'Star' },
    { id: 'char15', style: 'micah', seed: 'Art1', name: 'Indie' },
    { id: 'char16', style: 'micah', seed: 'Art2', name: 'Sage' },
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

