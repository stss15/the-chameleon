import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

// Helper for avatars - same as App.tsx
const getAvatarUrl = (seed: string, style: string = 'adventurer') =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

interface LiveChatProps {
    messages: Record<string, ChatMessage> | undefined;
    currentPlayerId: string;
    onSendMessage: (text: string) => void;
    isMicOn?: boolean;
    onToggleMic?: () => void;
    onMicEnable?: () => void;
    isMicEnabled?: boolean;
}

export const LiveChat: React.FC<LiveChatProps> = ({
    messages,
    currentPlayerId,
    onSendMessage,
    isMicOn = false,
    onToggleMic,
    onMicEnable,
    isMicEnabled = false
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [input, setInput] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [lastSeenCount, setLastSeenCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Convert messages to sorted array
    const messageList: ChatMessage[] = messages
        ? (Object.values(messages) as ChatMessage[]).sort((a, b) => a.timestamp - b.timestamp)
        : [];

    // Track unread messages when collapsed
    useEffect(() => {
        if (!isExpanded && messageList.length > lastSeenCount) {
            setUnreadCount(messageList.length - lastSeenCount);
        }
    }, [messageList.length, isExpanded, lastSeenCount]);

    // Clear unread when expanded
    useEffect(() => {
        if (isExpanded) {
            setUnreadCount(0);
            setLastSeenCount(messageList.length);
        }
    }, [isExpanded, messageList.length]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (isExpanded) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messageList.length, isExpanded]);

    const handleSend = () => {
        if (input.trim()) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    // Collapsed view - just a toggle bar
    if (!isExpanded) {
        return (
            <div className="fixed bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm border-t border-white/10 p-2 z-20">
                <div className="flex items-center justify-center gap-3">
                    {/* Chat toggle with notification */}
                    <button
                        onClick={() => setIsExpanded(true)}
                        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition relative"
                    >
                        <span>💬</span>
                        <span className="text-sm text-white/80">Chat</span>
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-pulse">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Mic toggle */}
                    {onToggleMic && (
                        <button
                            onClick={() => {
                                if (!isMicEnabled && onMicEnable) {
                                    onMicEnable();
                                } else if (onToggleMic) {
                                    onToggleMic();
                                }
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full transition ${isMicEnabled && isMicOn
                                    ? 'bg-green-600 text-white'
                                    : isMicEnabled
                                        ? 'bg-red-600 text-white'
                                        : 'bg-white/10 text-white/50'
                                }`}
                        >
                            {isMicEnabled && isMicOn ? '🎤' : '🔇'}
                            <span className="text-sm">{isMicEnabled ? (isMicOn ? 'Mic On' : 'Mic Off') : 'Enable Mic'}</span>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Expanded view - full chat
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm border-t border-white/10 z-20" style={{ height: '280px' }}>
            {/* Header with collapse button */}
            <div className="flex items-center justify-between p-2 border-b border-white/10">
                <span className="text-sm font-bold text-gold">💬 Chat</span>
                <div className="flex items-center gap-2">
                    {/* Mic toggle in header */}
                    {onToggleMic && (
                        <button
                            onClick={() => {
                                if (!isMicEnabled && onMicEnable) {
                                    onMicEnable();
                                } else if (onToggleMic) {
                                    onToggleMic();
                                }
                            }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${isMicEnabled && isMicOn
                                    ? 'bg-green-600 text-white'
                                    : isMicEnabled
                                        ? 'bg-red-600 text-white'
                                        : 'bg-white/20 text-white/50'
                                }`}
                        >
                            {isMicEnabled && isMicOn ? '🎤' : '🔇'}
                        </button>
                    )}
                    <button
                        onClick={() => setIsExpanded(false)}
                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="overflow-y-auto p-2 space-y-2" style={{ height: 'calc(100% - 100px)' }}>
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
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 p-2 flex gap-2 bg-black/50">
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
                    className="bg-gold text-feltDark px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default LiveChat;
