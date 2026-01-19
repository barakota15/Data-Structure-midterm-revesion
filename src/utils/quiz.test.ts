import { describe, expect, it } from 'vitest';
import { scoreQuiz, validateQuiz } from './quiz';

const validQuiz = {
  id: 'sample',
  title: 'Sample Quiz',
  questions: [
    {
      id: 'q1',
      type: 'multiple_choice_single',
      prompt: 'Pick one',
      options: ['A', 'B'],
      correctAnswer: 'A'
    },
    {
      id: 'q2',
      type: 'true_false',
      prompt: 'True?',
      correctAnswer: true
    },
    {
      id: 'q3',
      type: 'multiple_choice_multi',
      prompt: 'Pick two',
      options: ['A', 'B', 'C'],
      correctAnswers: ['A', 'B']
    },
    {
      id: 'q4',
      type: 'short_text',
      prompt: 'Short',
      acceptedAnswers: ['Hello']
    }
  ]
};

describe('validateQuiz', () => {
  it('returns errors for invalid quiz', () => {
    const result = validateQuiz({});
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns warnings for invalid answers', () => {
    const quiz = {
      ...validQuiz,
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice_single',
          prompt: 'Pick one',
          options: ['A', 'B'],
          correctAnswer: 'C'
        }
      ]
    };

    const result = validateQuiz(quiz);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('scoreQuiz', () => {
  it('scores answers correctly', () => {
    const result = scoreQuiz(validQuiz, {
      q1: 'A',
      q2: true,
      q3: ['A', 'B'],
      q4: 'hello'
    });

    expect(result.totalScore).toBe(4);
    expect(result.percentage).toBe(100);
  });
});
