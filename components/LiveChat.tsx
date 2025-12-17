import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

// Helper for avatars - same as App.tsx
const getAvatarUrl = (seed: string, style: string = 'adventurer') =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

interface LiveChatProps {
    messages: Record<string, ChatMessage> | undefined;
    currentPlayerId: string;
    onSendMessage: (text: string) => void;
    isCollapsed?: boolean;
}

export const LiveChat: React.FC<LiveChatProps> = ({
    messages,
    currentPlayerId,
    onSendMessage,
    isCollapsed = false
}) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Convert messages to sorted array
    const messageList: ChatMessage[] = messages
        ? (Object.values(messages) as ChatMessage[]).sort((a, b) => a.timestamp - b.timestamp)
        : [];

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messageList.length]);

    const handleSend = () => {
        if (input.trim()) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    if (isCollapsed) {
        return (
            <div className="bg-black/30 rounded-lg p-2 text-center">
                <span className="text-white/50 text-xs">💬 Chat available when not your turn</span>
            </div>
        );
    }

    return (
        <div className="bg-black/40 rounded-xl border border-white/10 overflow-hidden flex flex-col" style={{ height: '200px' }}>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {messageList.length === 0 ? (
                    <div className="text-center text-white/30 text-xs py-4">
                        No messages yet. Say hi! 👋
                    </div>
                ) : (
                    messageList.slice(-50).map((msg) => {
                        const isOwnMessage = msg.playerId === currentPlayerId;
                        return (
                            <div
                                key={msg.id}
                                className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                            >
                                <img
                                    src={getAvatarUrl(msg.playerName, msg.characterStyle)}
                                    className="w-6 h-6 rounded-full bg-white flex-shrink-0"
                                    alt=""
                                />
                                <div className={`max-w-[75%] ${isOwnMessage ? 'text-right' : ''}`}>
                                    <span className="text-[10px] text-white/50">{msg.playerName}</span>
                                    <div className={`inline-block px-2 py-1 rounded-lg text-xs ${isOwnMessage
                                        ? 'bg-gold text-feltDark'
                                        : 'bg-white/10 text-white'
                                        }`}>
                                        {msg.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-white/10 p-2 flex gap-2">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:bg-white/20"
                    maxLength={200}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="bg-gold text-feltDark px-3 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default LiveChat;
