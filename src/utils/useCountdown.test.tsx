import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCountdown } from './useCountdown';

describe('useCountdown', () => {
  it('counts down to zero', () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useCountdown(3, true));
    expect(result.current.timeLeft).toBe(3);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.timeLeft).toBe(2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.timeLeft).toBe(0);

    vi.useRealTimers();
  });
});
