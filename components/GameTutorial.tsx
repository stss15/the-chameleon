import React, { useState } from 'react';

const TUTORIAL_STEPS = [
    {
        emoji: '🦎',
        title: 'Welcome to The Chameleon!',
        text: 'One player is secretly the Chameleon. They don\'t know the secret word!'
    },
    {
        emoji: '🎯',
        title: 'The Secret Word',
        text: 'All players except the Chameleon can see which word is highlighted on the grid.'
    },
    {
        emoji: '💬',
        title: 'Give Clues',
        text: 'Take turns giving ONE-WORD clues related to the secret word. Be subtle - don\'t make it too obvious!'
    },
    {
        emoji: '🤔',
        title: 'Chameleon\'s Challenge',
        text: 'After clues, the Chameleon tries to guess the secret word. Correct guess = they win!'
    },
    {
        emoji: '🗳️',
        title: 'Vote!',
        text: 'If the Chameleon guesses wrong, everyone votes on who they think is the Chameleon.'
    },
    {
        emoji: '🏆',
        title: 'Win Conditions',
        text: 'Innocents win by catching the Chameleon. Chameleon wins by guessing the word or not getting caught!'
    }
];

interface GameTutorialProps {
    onComplete: () => void;
}

export const GameTutorial: React.FC<GameTutorialProps> = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);

    const handleNext = () => {
        if (currentStep < TUTORIAL_STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            onComplete();
        }
    };

    const step = TUTORIAL_STEPS[currentStep];
    const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="card-texture max-w-sm w-full p-6 text-center">
                {/* Progress dots */}
                <div className="flex justify-center gap-1 mb-4">
                    {TUTORIAL_STEPS.map((_, idx) => (
                        <div
                            key={idx}
                            className={`w-2 h-2 rounded-full transition-colors ${idx === currentStep ? 'bg-gold' : 'bg-gray-400'
                                }`}
                        />
                    ))}
                </div>

                {/* Content */}
                <div className="text-5xl mb-4">{step.emoji}</div>
                <h3 className="text-xl font-bold text-feltDark mb-2">{step.title}</h3>
                <p className="text-feltDark/70 text-sm mb-6">{step.text}</p>

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onComplete}
                        className="flex-1 py-3 rounded-lg border-2 border-feltDark/30 text-feltDark/70 font-bold hover:bg-gray-100 transition"
                    >
                        Skip
                    </button>
                    <button
                        onClick={handleNext}
                        className="flex-1 py-3 rounded-lg bg-gold text-feltDark font-bold hover:bg-yellow-400 transition"
                    >
                        {isLastStep ? "Let's Play!" : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GameTutorial;
