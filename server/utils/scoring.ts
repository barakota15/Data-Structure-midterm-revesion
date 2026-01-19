import { QuizQuestionRecord } from '../routes/quizzes';

export interface ScoreResult {
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  perQuestion: Array<{
    questionId: string;
    isCorrect: boolean;
    earnedPoints: number;
    answer: unknown;
  }>;
}

export const scoreAttempt = (
  questions: QuizQuestionRecord[],
  answers: Record<string, unknown>,
  passingScore?: number
): ScoreResult => {
  const perQuestion = questions.map((question) => {
    const answer = answers[question.id] ?? null;
    let isCorrect = false;

    if (question.type === 'multiple_choice_single') {
      isCorrect = answer === question.correctAnswer;
    }

    if (question.type === 'multiple_choice_multi') {
      const provided = Array.isArray(answer) ? [...answer].sort() : [];
      const expected = [...question.correctAnswers].sort();
      isCorrect = provided.length === expected.length && provided.every((val, idx) => val === expected[idx]);
    }

    if (question.type === 'true_false') {
      isCorrect = answer === question.correctAnswer;
    }

    if (question.type === 'short_text') {
      const normalized = String(answer ?? '').trim().toLowerCase();
      isCorrect = question.acceptedAnswers.some((accepted) => accepted.trim().toLowerCase() === normalized);
    }

    const points = question.points ?? 1;
    const earnedPoints = isCorrect ? points : 0;

    return {
      questionId: question.id,
      isCorrect,
      earnedPoints,
      answer
    };
  });

  const totalScore = perQuestion.reduce((sum, item) => sum + item.earnedPoints, 0);
  const maxScore = questions.reduce((sum, question) => sum + (question.points ?? 1), 0);
  const percentage = maxScore === 0 ? 0 : Math.round((totalScore / maxScore) * 100);
  const passed = passingScore ? percentage >= passingScore : true;

  return {
    totalScore,
    maxScore,
    percentage,
    passed,
    perQuestion
  };
};
