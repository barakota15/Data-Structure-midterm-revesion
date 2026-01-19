import { QuizDefinition } from './quiz';

const STORAGE_KEY = 'json-quiz-builder';

interface StorageState {
  quizzes: Record<string, QuizDefinition>;
}

const loadState = (): StorageState => {
  if (typeof window === 'undefined') {
    return { quizzes: {} };
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { quizzes: {} };
  }
  try {
    return JSON.parse(stored) as StorageState;
  } catch {
    return { quizzes: {} };
  }
};

const saveState = (state: StorageState) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const storeQuiz = (quiz: QuizDefinition) => {
  const state = loadState();
  state.quizzes[quiz.id] = quiz;
  saveState(state);
};

export const listQuizzes = (): QuizDefinition[] => {
  const state = loadState();
  return Object.values(state.quizzes);
};

export const getQuiz = (id: string): QuizDefinition | undefined => {
  const state = loadState();
  return state.quizzes[id];
};
