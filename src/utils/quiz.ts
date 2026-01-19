import { z } from 'zod';

export type QuestionType =
  | 'multiple_choice_single'
  | 'multiple_choice_multi'
  | 'true_false'
  | 'short_text';

export interface QuizDefinition {
  id: string;
  title: string;
  description?: string;
  timeLimitSeconds?: number;
  passingScore?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showQuestionList?: boolean;
  questions: QuizQuestion[];
}

export type QuizQuestion =
  | MultipleChoiceSingleQuestion
  | MultipleChoiceMultiQuestion
  | TrueFalseQuestion
  | ShortTextQuestion;

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  explanation?: string;
}

export interface MultipleChoiceSingleQuestion extends BaseQuestion {
  type: 'multiple_choice_single';
  options: string[];
  correctAnswer: string;
}

export interface MultipleChoiceMultiQuestion extends BaseQuestion {
  type: 'multiple_choice_multi';
  options: string[];
  correctAnswers: string[];
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: 'true_false';
  correctAnswer: boolean;
}

export interface ShortTextQuestion extends BaseQuestion {
  type: 'short_text';
  acceptedAnswers: string[];
}

export const quizSchema = z.object({
  id: z.string().min(1, 'Quiz id is required.'),
  title: z.string().min(1, 'Quiz title is required.'),
  description: z.string().optional(),
  timeLimitSeconds: z.number().int().positive().optional(),
  passingScore: z.number().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  showQuestionList: z.boolean().optional(),
  questions: z.array(
    z.discriminatedUnion('type', [
      z.object({
        id: z.string().min(1, 'Question id is required.'),
        type: z.literal('multiple_choice_single'),
        prompt: z.string().min(1, 'Prompt is required.'),
        options: z.array(z.string().min(1)).min(2, 'Provide at least 2 options.'),
        correctAnswer: z.string().min(1),
        explanation: z.string().optional()
      }),
      z.object({
        id: z.string().min(1, 'Question id is required.'),
        type: z.literal('multiple_choice_multi'),
        prompt: z.string().min(1, 'Prompt is required.'),
        options: z.array(z.string().min(1)).min(2, 'Provide at least 2 options.'),
        correctAnswers: z.array(z.string().min(1)).min(1, 'Provide at least 1 correct answer.'),
        explanation: z.string().optional()
      }),
      z.object({
        id: z.string().min(1, 'Question id is required.'),
        type: z.literal('true_false'),
        prompt: z.string().min(1, 'Prompt is required.'),
        correctAnswer: z.boolean(),
        explanation: z.string().optional()
      }),
      z.object({
        id: z.string().min(1, 'Question id is required.'),
        type: z.literal('short_text'),
        prompt: z.string().min(1, 'Prompt is required.'),
        acceptedAnswers: z.array(z.string().min(1)).min(1, 'Provide at least 1 accepted answer.'),
        explanation: z.string().optional()
      })
    ])
  )
});

export interface ValidationResult {
  data?: QuizDefinition;
  errors: string[];
  warnings: string[];
}

export const validateQuiz = (input: unknown): ValidationResult => {
  const parseResult = quizSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      errors: parseResult.error.errors.map((error) => error.message),
      warnings: []
    };
  }

  const warnings: string[] = [];
  const { data } = parseResult;

  const idSet = new Set<string>();
  data.questions.forEach((question) => {
    if (idSet.has(question.id)) {
      warnings.push(`Duplicate question id detected: ${question.id}.`);
    }
    idSet.add(question.id);

    if (question.type === 'multiple_choice_single' || question.type === 'multiple_choice_multi') {
      const optionSet = new Set(question.options);
      if (optionSet.size !== question.options.length) {
        warnings.push(`Question ${question.id} has repeated options.`);
      }
    }
  });

  data.questions.forEach((question) => {
    if (question.type === 'multiple_choice_single') {
      if (!question.options.includes(question.correctAnswer)) {
        warnings.push(`Question ${question.id} has a correctAnswer not in options.`);
      }
    }
    if (question.type === 'multiple_choice_multi') {
      const invalidAnswers = question.correctAnswers.filter(
        (answer) => !question.options.includes(answer)
      );
      if (invalidAnswers.length > 0) {
        warnings.push(`Question ${question.id} has correctAnswers not in options.`);
      }
    }
  });

  return {
    data,
    errors: [],
    warnings
  };
};

export interface QuizAnswerMap {
  [questionId: string]: string | string[] | boolean | null;
}

export interface ScoredQuestion {
  questionId: string;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  answer: QuizAnswerMap[string];
}

export interface QuizScoreResult {
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  perQuestion: ScoredQuestion[];
}

export const scoreQuiz = (quiz: QuizDefinition, answers: QuizAnswerMap): QuizScoreResult => {
  const perQuestion = quiz.questions.map((question) => {
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
      const normalized = String(answer ?? '')
        .trim()
        .toLowerCase();
      isCorrect = question.acceptedAnswers.some(
        (accepted) => accepted.trim().toLowerCase() === normalized
      );
    }

    return {
      questionId: question.id,
      isCorrect,
      score: isCorrect ? 1 : 0,
      maxScore: 1,
      answer
    };
  });

  const totalScore = perQuestion.reduce((sum, item) => sum + item.score, 0);
  const maxScore = perQuestion.reduce((sum, item) => sum + item.maxScore, 0);
  const percentage = maxScore === 0 ? 0 : Math.round((totalScore / maxScore) * 100);
  const passed = quiz.passingScore ? percentage >= quiz.passingScore : true;

  return {
    totalScore,
    maxScore,
    percentage,
    passed,
    perQuestion
  };
};

export const shuffleArray = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const normalizeQuiz = (quiz: QuizDefinition): QuizDefinition => {
  const questions = quiz.shuffleQuestions ? shuffleArray(quiz.questions) : quiz.questions;
  const normalizedQuestions = questions.map((question) => {
    if (quiz.shuffleOptions && (question.type === 'multiple_choice_single' || question.type === 'multiple_choice_multi')) {
      return {
        ...question,
        options: shuffleArray(question.options)
      };
    }
    return question;
  });

  return {
    ...quiz,
    questions: normalizedQuestions
  };
};
