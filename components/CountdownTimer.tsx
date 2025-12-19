import React, { useState, useEffect, useCallback } from 'react';

interface UseCountdownProps {
    initialSeconds: number;
    onComplete?: () => void;
    autoStart?: boolean;
}

export const useCountdown = ({ initialSeconds, onComplete, autoStart = true }: UseCountdownProps) => {
    const [seconds, setSeconds] = useState(initialSeconds);
    const [isRunning, setIsRunning] = useState(autoStart);

    useEffect(() => {
        if (!isRunning || seconds <= 0) return;

        const timer = setInterval(() => {
            setSeconds(prev => {
                if (prev <= 1) {
                    setIsRunning(false);
                    onComplete?.();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isRunning, seconds, onComplete]);

    const reset = useCallback((newSeconds?: number) => {
        setSeconds(newSeconds ?? initialSeconds);
        setIsRunning(true);
    }, [initialSeconds]);

    const stop = useCallback(() => {
        setIsRunning(false);
    }, []);

    const start = useCallback(() => {
        setIsRunning(true);
    }, []);

    return { seconds, isRunning, reset, stop, start };
};

// Timer display component
interface CountdownTimerProps {
    seconds: number;
    label?: string;
    warning?: number; // Show warning color when below this value
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
    seconds,
    label,
    warning = 10
}) => {
    const isWarning = seconds <= warning && seconds > 0;
    const isExpired = seconds <= 0;

    const formatTime = (secs: number) => {
        const mins = Math.floor(secs / 60);
        const remainingSecs = secs % 60;
        return mins > 0
            ? `${mins}:${remainingSecs.toString().padStart(2, '0')}`
            : `${remainingSecs}s`;
    };

    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-colors ${isExpired ? 'bg-red-600 text-white' :
            isWarning ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50' :
                'bg-white/10 text-white'
            }`}>
            <span className="text-lg">{isWarning || isExpired ? '🚨' : '⏱️'}</span>
            {label && <span className="text-xs opacity-70">{label}</span>}
            <span className="text-xl tabular-nums">{formatTime(seconds)}</span>
        </div>
    );
};

export default CountdownTimer;
