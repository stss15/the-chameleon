import React from 'react';

interface CardProps {
    children: React.ReactNode;
    title: string;
    color?: string;
    className?: string;
}

export const Card: React.FC<CardProps> = ({ children, title, color = "bg-card", className = "" }) => {
    return (
        <div className={`relative ${color} text-gray-900 rounded-xl shadow-xl border-4 border-gray-200 p-4 ${className} flex flex-col items-center`}>
            {/* Card texture */}
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cardboard.png')] pointer-events-none rounded-lg"></div>

            {/* Header */}
            <div className="w-full border-b-2 border-gray-800 pb-2 mb-4 text-center">
                <h3 className="font-serif font-bold text-xl uppercase tracking-wider">{title}</h3>
            </div>

            {/* Content */}
            <div className="w-full h-full flex flex-col justify-center items-center z-10">
                {children}
            </div>
        </div>
    );
};

export const CodeCard: React.FC<{ secretCode: string | null }> = ({ secretCode }) => {
    return (
        <Card title="Code Card" color="bg-blue-100" className="w-64 h-80">
            <div className="grid grid-cols-4 gap-2 w-full h-full">
                {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-center border border-blue-300 rounded text-xs font-mono text-blue-900 opacity-50">
                        {/* Fake qr/pattern */}
                        {Math.random() > 0.5 ? '◼' : '◻'}
                    </div>
                ))}
            </div>
            {secretCode && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg backdrop-blur-sm">
                    <div className="bg-white p-4 rounded shadow-2xl transform rotate-3">
                        <p className="text-sm font-bold text-gray-500 uppercase">Secret Location</p>
                        <p className="text-5xl font-bold text-blue-600 font-mono tracking-tighter">{secretCode}</p>
                    </div>
                </div>
            )}
        </Card>
    )
}

export const TopicGrid: React.FC<{ words: string[], category: string, secretWordIndex?: number }> = ({ words, category, secretWordIndex }) => {
    const rows = ['A', 'B', 'C', 'D'];

    return (
        <Card title={category} color="bg-yellow-50" className="w-full max-w-md">
            <div className="grid grid-cols-5 gap-2 w-full text-xs sm:text-sm font-bold">
                {/* Header Row */}
                <div className="text-center p-1"></div>
                {[1, 2, 3, 4].map(n => <div key={n} className="bg-gray-800 text-white rounded p-1 text-center">{n}</div>)}

                {/* Rows */}
                {rows.map((row, rIdx) => (
                    <React.Fragment key={row}>
                        <div className="bg-gray-800 text-white rounded p-1 flex items-center justify-center">{row}</div>
                        {[0, 1, 2, 3].map(cIdx => {
                            const wordIndex = rIdx * 4 + cIdx;
                            const isSecret = secretWordIndex === wordIndex;
                            return (
                                <div
                                    key={`${row}${cIdx}`}
                                    className={`border-2 rounded p-1 flex items-center justify-center text-center h-12 break-words leading-tight transition-all ${isSecret
                                            ? 'bg-gold border-yellow-600 text-gray-900 font-black scale-105 shadow-lg ring-2 ring-yellow-400'
                                            : 'border-gray-300 bg-white'
                                        }`}
                                >
                                    {words[wordIndex]}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </Card>
    )
}
