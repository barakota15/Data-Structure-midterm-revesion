import { describe, expect, it } from 'vitest';
import { scoreAttempt } from '../utils/scoring';

const questions = [
  {
    id: 'q1',
    type: 'multiple_choice_single',
    prompt: 'One',
    required: true,
    points: 2,
    options: ['A', 'B'],
    correctAnswer: 'A',
    correctAnswers: [],
    acceptedAnswers: []
  },
  {
    id: 'q2',
    type: 'short_text',
    prompt: 'Optional',
    required: false,
    points: 1,
    options: [],
    correctAnswers: [],
    acceptedAnswers: ['hello']
  }
];

describe('scoreAttempt', () => {
  it('awards points for correct required questions and allows optional blanks', () => {
    const result = scoreAttempt(questions, { q1: 'A', q2: '' }, 50);
    expect(result.totalScore).toBe(2);
    expect(result.percentage).toBe(67);
  });
});
