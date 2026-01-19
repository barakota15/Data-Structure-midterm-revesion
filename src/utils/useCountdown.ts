import { useEffect, useMemo, useState } from 'react';

export const useCountdown = (durationSeconds?: number, isRunning?: boolean) => {
  const [timeLeft, setTimeLeft] = useState(durationSeconds ?? 0);

  useEffect(() => {
    setTimeLeft(durationSeconds ?? 0);
  }, [durationSeconds]);

  useEffect(() => {
    if (!isRunning || !durationSeconds) {
      return;
    }

    const interval = window.setInterval(() => {
      setTimeLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, durationSeconds]);

  const formatted = useMemo(() => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [timeLeft]);

  return { timeLeft, formatted };
};
