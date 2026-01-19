import { z } from 'zod';

export const questionBase = z.object({
  id: z.string().uuid().optional(),
  type: z.enum([
    'multiple_choice_single',
    'multiple_choice_multi',
    'true_false',
    'short_text'
  ]),
  prompt: z.string().min(1, 'Prompt is required.'),
  required: z.boolean().optional().default(true),
  points: z.number().int().min(1).optional().default(1),
  explanation: z.string().optional()
});

export const quizSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Quiz title is required.'),
  description: z.string().optional(),
  timeLimitSeconds: z.number().int().positive().optional(),
  passingScore: z.number().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  showQuestionList: z.boolean().optional(),
  allowSkip: z.boolean().optional().default(true),
  enforceRequiredBeforeSubmit: z.boolean().optional().default(true),
  visibility: z.enum(['private', 'unlisted', 'public']).optional().default('private'),
  questions: z.array(
    z.discriminatedUnion('type', [
      questionBase.extend({
        type: z.literal('multiple_choice_single'),
        options: z.array(z.string().min(1)).min(2, 'Provide at least 2 options.'),
        correctAnswer: z.string().min(1)
      }),
      questionBase.extend({
        type: z.literal('multiple_choice_multi'),
        options: z.array(z.string().min(1)).min(2, 'Provide at least 2 options.'),
        correctAnswers: z.array(z.string().min(1)).min(1, 'Provide at least 1 correct answer.')
      }),
      questionBase.extend({
        type: z.literal('true_false'),
        correctAnswer: z.boolean()
      }),
      questionBase.extend({
        type: z.literal('short_text'),
        acceptedAnswers: z.array(z.string().min(1)).min(1, 'Provide at least 1 accepted answer.')
      })
    ])
  )
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const loginSchema = signupSchema.extend({
  rememberMe: z.boolean().optional()
});

export const attemptAnswerSchema = z.object({
  answers: z.record(z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]))
});
