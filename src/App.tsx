import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { nanoid } from 'nanoid';
import {
  normalizeQuiz,
  QuizAnswerMap,
  QuizDefinition,
  QuizQuestion,
  QuestionType,
  scoreQuiz,
  validateQuiz
} from './utils/quiz';
import { useCountdown } from './utils/useCountdown';
import { apiFetch } from './utils/api';

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

const DEFAULT_JSON = `{
  "id": "my-quiz",
  "title": "Product Basics",
  "description": "A quick quiz about product strategy.",
  "timeLimitSeconds": 120,
  "passingScore": 70,
  "shuffleQuestions": false,
  "shuffleOptions": false,
  "showQuestionList": true,
  "allowSkip": true,
  "enforceRequiredBeforeSubmit": true,
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice_single",
      "prompt": "Which metric best describes product retention?",
      "required": true,
      "points": 1,
      "options": ["DAU/MAU", "CTR", "NPS", "CAC"],
      "correctAnswer": "DAU/MAU",
      "explanation": "DAU/MAU is a common retention proxy."
    }
  ]
}`;

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
};

const createEmptyQuestion = (type: QuestionType): QuizQuestion => {
  const base = {
    id: nanoid(6),
    type,
    prompt: '',
    required: true,
    points: 1,
    explanation: ''
  };

  if (type === 'multiple_choice_single') {
    return {
      ...base,
      type,
      options: ['Option 1', 'Option 2'],
      correctAnswer: 'Option 1'
    };
  }

  if (type === 'multiple_choice_multi') {
    return {
      ...base,
      type,
      options: ['Option 1', 'Option 2'],
      correctAnswers: ['Option 1']
    };
  }

  if (type === 'true_false') {
    return {
      ...base,
      type,
      correctAnswer: true
    };
  }

  return {
    ...base,
    type,
    acceptedAnswers: ['']
  };
};

const App = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    document.body.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await apiFetch<{ user: AuthUser | null }>('/api/auth/me');
        setUser(response.user);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };
    void loadUser();
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <Link to="/" className="logo">
            JSON Quiz Builder
          </Link>
          <p className="subtitle">Validate, preview, and publish interactive quizzes.</p>
        </div>
        <div className="header-actions">
          {user ? (
            <Link to="/dashboard" className="secondary">
              Analytics Dashboard
            </Link>
          ) : null}
          <button
            className="toggle"
            onClick={() => setDarkMode((prev) => !prev)}
            aria-label="Toggle dark mode"
            type="button"
          >
            {darkMode ? 'Light mode' : 'Dark mode'}
          </button>
          <AuthPanel user={user} setUser={setUser} loading={authLoading} />
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Builder user={user} />} />
          <Route path="/quiz/:id" element={<QuizRunner user={user} />} />
          <Route path="/dashboard" element={<Dashboard user={user} />} />
        </Routes>
      </main>
    </div>
  );
};

const AuthPanel = ({
  user,
  setUser,
  loading
}: {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  loading: boolean;
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    try {
      const response = await apiFetch<{ user: AuthUser }>(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password, rememberMe })
      });
      setUser(response.user);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate.');
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  if (loading) {
    return <div className="auth-panel">Loading...</div>;
  }

  if (user) {
    return (
      <div className="auth-panel">
        <span>{user.email}</span>
        <button type="button" className="secondary" onClick={handleLogout}>
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <input
        className="auth-input"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <input
        className="auth-input"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {mode === 'login' ? (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          Remember me
        </label>
      ) : null}
      <button type="button" className="primary" onClick={handleSubmit}>
        {mode === 'login' ? 'Login' : 'Sign up'}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
      >
        {mode === 'login' ? 'Create account' : 'Have an account? Login'}
      </button>
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
};

const Builder = ({ user }: { user: AuthUser | null }) => {
  const [mode, setMode] = useState<'json' | 'manual'>('json');
  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [previewQuiz, setPreviewQuiz] = useState<QuizDefinition | null>(null);
  const [savedId, setSavedId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [manualQuiz, setManualQuiz] = useState<QuizDefinition>({
    id: nanoid(6),
    title: '',
    description: '',
    timeLimitSeconds: undefined,
    passingScore: 70,
    shuffleQuestions: false,
    shuffleOptions: false,
    showQuestionList: true,
    allowSkip: true,
    enforceRequiredBeforeSubmit: true,
    visibility: 'private',
    questions: [createEmptyQuestion('multiple_choice_single')]
  });
  const [manualErrors, setManualErrors] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleValidate = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setValidationErrors(['Invalid JSON: unable to parse the content.']);
      setValidationWarnings([]);
      setPreviewQuiz(null);
      return;
    }

    const result = validateQuiz(parsed);
    setValidationErrors(result.errors);
    setValidationWarnings(result.warnings);
    setPreviewQuiz(result.data ?? null);
  };

  const handleFileUpload = async (file: File) => {
    const content = await file.text();
    setJsonText(content);
  };

  const handlePublishJson = async () => {
    if (!previewQuiz) {
      setMessage('Please validate the JSON before publishing.');
      return;
    }
    if (!user) {
      setMessage('Login required to publish quizzes.');
      return;
    }

    try {
      const response = await apiFetch<{ id: string }>('/api/quizzes/import', {
        method: 'POST',
        body: JSON.stringify(previewQuiz)
      });
      setSavedId(response.id);
      setMessage('Quiz published! Share the link below.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to publish quiz.');
    }
  };

  const exportManualToJson = () => {
    setJsonText(JSON.stringify(manualQuiz, null, 2));
    setMode('json');
    setPreviewQuiz(manualQuiz);
    const result = validateQuiz(manualQuiz);
    setValidationErrors(result.errors);
    setValidationWarnings(result.warnings);
  };

  const saveDraft = async (autosave = false) => {
    const result = validateQuiz(manualQuiz);
    setManualErrors(result.errors);
    if (result.errors.length > 0) {
      if (!autosave) {
        setMessage('Please fix validation errors before saving.');
      }
      return;
    }

    if (!user) {
      setMessage('Login required to save drafts.');
      return;
    }

    try {
      if (draftId) {
        await apiFetch(`/api/quizzes/${draftId}`, {
          method: 'PUT',
          body: JSON.stringify(manualQuiz)
        });
      } else {
        const response = await apiFetch<{ id: string }>('/api/quizzes', {
          method: 'POST',
          body: JSON.stringify(manualQuiz)
        });
        setDraftId(response.id);
      }
      if (!autosave) {
        setMessage('Draft saved successfully.');
      }
    } catch (error) {
      if (!autosave) {
        setMessage(error instanceof Error ? error.message : 'Unable to save draft.');
      }
    }
  };

  const publishManual = async () => {
    if (!draftId) {
      await saveDraft();
    }
    if (!draftId) {
      return;
    }
    await apiFetch(`/api/quizzes/${draftId}/publish`, { method: 'POST' });
    setSavedId(draftId);
    setMessage('Quiz published! Share the link below.');
  };

  useEffect(() => {
    if (!user || mode !== 'manual') {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveDraft(true);
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [manualQuiz, user, mode]);

  return (
    <section className="builder">
      <div className="builder__panel full">
        <div className="panel__header">
          <h2>Admin Builder</h2>
          <p>Use JSON import or the guided builder to craft a quiz.</p>
          <div className="tab-row">
            <button
              type="button"
              className={mode === 'json' ? 'tab active' : 'tab'}
              onClick={() => setMode('json')}
            >
              JSON Mode
            </button>
            <button
              type="button"
              className={mode === 'manual' ? 'tab active' : 'tab'}
              onClick={() => setMode('manual')}
            >
              Manual Mode
            </button>
          </div>
        </div>
        <div className="panel__body">
          {mode === 'json' ? (
            <>
              <label className="file-upload">
                Upload JSON
                <input
                  type="file"
                  accept="application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleFileUpload(file);
                    }
                  }}
                />
              </label>
              <textarea
                className="code-editor"
                aria-label="JSON quiz input"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
              />
              <div className="button-row">
                <button type="button" className="primary" onClick={handleValidate}>
                  Validate & Preview
                </button>
                <button type="button" className="secondary" onClick={handlePublishJson}>
                  Publish Quiz
                </button>
              </div>
            </>
          ) : (
            <ManualBuilder
              quiz={manualQuiz}
              setQuiz={setManualQuiz}
              errors={manualErrors}
              onExport={exportManualToJson}
              onSaveDraft={() => saveDraft(false)}
              onPublish={publishManual}
            />
          )}
          {message ? <p className="status">{message}</p> : null}
          {savedId ? (
            <div className="share-card">
              <p>Shareable link:</p>
              <button
                className="link-button"
                onClick={() => navigate(`/quiz/${savedId}`)}
                type="button"
              >
                /quiz/{savedId}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="builder__panel">
        <div className="panel__header">
          <h2>Validation</h2>
          <p>Catch errors and warnings before publishing.</p>
        </div>
        <div className="panel__body">
          {validationErrors.length === 0 ? (
            <p className="empty">No validation errors.</p>
          ) : (
            <ul className="list errors">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {validationWarnings.length === 0 ? (
            <p className="empty">No warnings detected.</p>
          ) : (
            <ul className="list warnings">
              {validationWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="builder__panel">
        <div className="panel__header">
          <h2>Preview</h2>
          <p>Preview the quiz exactly as end users will see it.</p>
        </div>
        <div className="panel__body">
          {previewQuiz ? (
            <QuizPreview quiz={previewQuiz} />
          ) : (
            <p className="empty">Validate your JSON to render a preview.</p>
          )}
        </div>
      </div>
    </section>
  );
};

const ManualBuilder = ({
  quiz,
  setQuiz,
  errors,
  onExport,
  onSaveDraft,
  onPublish
}: {
  quiz: QuizDefinition;
  setQuiz: (quiz: QuizDefinition) => void;
  errors: string[];
  onExport: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}) => {
  const updateQuestion = (index: number, updated: QuizQuestion) => {
    const questions = [...quiz.questions];
    questions[index] = updated;
    setQuiz({ ...quiz, questions });
  };

  const addQuestion = () => {
    setQuiz({
      ...quiz,
      questions: [...quiz.questions, createEmptyQuestion('multiple_choice_single')]
    });
  };

  const removeQuestion = (index: number) => {
    setQuiz({
      ...quiz,
      questions: quiz.questions.filter((_, idx) => idx !== index)
    });
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const questions = [...quiz.questions];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= questions.length) {
      return;
    }
    const [moved] = questions.splice(index, 1);
    questions.splice(newIndex, 0, moved);
    setQuiz({ ...quiz, questions });
  };

  return (
    <div className="manual-builder">
      <div className="manual-grid">
        <label>
          Title
          <input
            className="text-input"
            value={quiz.title}
            onChange={(event) => setQuiz({ ...quiz, title: event.target.value })}
          />
        </label>
        <label>
          Description
          <textarea
            className="text-input"
            value={quiz.description}
            onChange={(event) => setQuiz({ ...quiz, description: event.target.value })}
          />
        </label>
        <label>
          Time limit (seconds)
          <input
            className="text-input"
            type="number"
            value={quiz.timeLimitSeconds ?? ''}
            onChange={(event) =>
              setQuiz({
                ...quiz,
                timeLimitSeconds: event.target.value ? Number(event.target.value) : undefined
              })
            }
          />
        </label>
        <label>
          Passing score (%)
          <input
            className="text-input"
            type="number"
            value={quiz.passingScore ?? ''}
            onChange={(event) =>
              setQuiz({
                ...quiz,
                passingScore: event.target.value ? Number(event.target.value) : undefined
              })
            }
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={quiz.shuffleQuestions}
            onChange={(event) => setQuiz({ ...quiz, shuffleQuestions: event.target.checked })}
          />
          Shuffle questions
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={quiz.shuffleOptions}
            onChange={(event) => setQuiz({ ...quiz, shuffleOptions: event.target.checked })}
          />
          Shuffle options
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={quiz.showQuestionList}
            onChange={(event) => setQuiz({ ...quiz, showQuestionList: event.target.checked })}
          />
          Show question list
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={quiz.allowSkip}
            onChange={(event) => setQuiz({ ...quiz, allowSkip: event.target.checked })}
          />
          Allow skipping questions
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={quiz.enforceRequiredBeforeSubmit}
            onChange={(event) => setQuiz({ ...quiz, enforceRequiredBeforeSubmit: event.target.checked })}
          />
          Enforce required answers before submit
        </label>
        <label>
          Visibility
          <select
            className="text-input"
            value={quiz.visibility ?? 'private'}
            onChange={(event) => setQuiz({ ...quiz, visibility: event.target.value as QuizDefinition['visibility'] })}
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
        </label>
      </div>
      {quiz.questions.map((question, index) => (
        <div key={question.id} className="question-editor">
          <div className="question-editor__header">
            <h4>Question {index + 1}</h4>
            <div className="button-row">
              <button type="button" className="secondary" onClick={() => moveQuestion(index, -1)}>
                Move up
              </button>
              <button type="button" className="secondary" onClick={() => moveQuestion(index, 1)}>
                Move down
              </button>
              <button type="button" className="secondary" onClick={() => removeQuestion(index)}>
                Remove
              </button>
            </div>
          </div>
          <label>
            Question type
            <select
              className="text-input"
              value={question.type}
              onChange={(event) => updateQuestion(index, createEmptyQuestion(event.target.value as QuestionType))}
            >
              <option value="multiple_choice_single">Multiple choice (single)</option>
              <option value="multiple_choice_multi">Multiple choice (multi)</option>
              <option value="true_false">True / False</option>
              <option value="short_text">Short text</option>
            </select>
          </label>
          <label>
            Prompt
            <textarea
              className="text-input"
              value={question.prompt}
              onChange={(event) => updateQuestion(index, { ...question, prompt: event.target.value })}
            />
          </label>
          <div className="inline-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={question.required ?? true}
                onChange={(event) => updateQuestion(index, { ...question, required: event.target.checked })}
              />
              Required
            </label>
            <label>
              Points
              <input
                className="text-input"
                type="number"
                value={question.points ?? 1}
                onChange={(event) => updateQuestion(index, { ...question, points: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            Explanation (optional)
            <textarea
              className="text-input"
              value={question.explanation ?? ''}
              onChange={(event) => updateQuestion(index, { ...question, explanation: event.target.value })}
            />
          </label>
          <QuestionEditor question={question} onChange={(updated) => updateQuestion(index, updated)} />
        </div>
      ))}
      <div className="button-row">
        <button type="button" className="secondary" onClick={addQuestion}>
          Add question
        </button>
        <button type="button" className="secondary" onClick={onSaveDraft}>
          Save draft
        </button>
        <button type="button" className="primary" onClick={onPublish}>
          Publish quiz
        </button>
        <button type="button" className="secondary" onClick={onExport}>
          Export to JSON
        </button>
      </div>
      {errors.length > 0 ? (
        <ul className="list errors">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const QuestionEditor = ({
  question,
  onChange
}: {
  question: QuizQuestion;
  onChange: (question: QuizQuestion) => void;
}) => {
  if (question.type === 'multiple_choice_single') {
    return (
      <div className="options">
        {question.options.map((option, index) => (
          <div key={`${option}-${index}`} className="option-row">
            <input
              className="text-input"
              value={option}
              onChange={(event) => {
                const options = [...question.options];
                options[index] = event.target.value;
                const correctAnswer = question.correctAnswer === option ? event.target.value : question.correctAnswer;
                onChange({ ...question, options, correctAnswer });
              }}
            />
            <input
              type="radio"
              checked={question.correctAnswer === option}
              onChange={() => onChange({ ...question, correctAnswer: option })}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const options = question.options.filter((_, idx) => idx !== index);
                onChange({
                  ...question,
                  options,
                  correctAnswer: options[0] ?? ''
                });
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => onChange({ ...question, options: [...question.options, `Option ${question.options.length + 1}`] })}
        >
          Add option
        </button>
      </div>
    );
  }

  if (question.type === 'multiple_choice_multi') {
    return (
      <div className="options">
        {question.options.map((option, index) => (
          <div key={`${option}-${index}`} className="option-row">
            <input
              className="text-input"
              value={option}
              onChange={(event) => {
                const options = [...question.options];
                options[index] = event.target.value;
                const correctAnswers = question.correctAnswers.map((answer) =>
                  answer === option ? event.target.value : answer
                );
                onChange({ ...question, options, correctAnswers });
              }}
            />
            <input
              type="checkbox"
              checked={question.correctAnswers.includes(option)}
              onChange={() => {
                const correctAnswers = question.correctAnswers.includes(option)
                  ? question.correctAnswers.filter((answer) => answer !== option)
                  : [...question.correctAnswers, option];
                onChange({ ...question, correctAnswers });
              }}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const options = question.options.filter((_, idx) => idx !== index);
                onChange({
                  ...question,
                  options,
                  correctAnswers: question.correctAnswers.filter((answer) => answer !== option)
                });
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => onChange({ ...question, options: [...question.options, `Option ${question.options.length + 1}`] })}
        >
          Add option
        </button>
      </div>
    );
  }

  if (question.type === 'true_false') {
    return (
      <div className="options">
        {[true, false].map((value) => (
          <label key={value.toString()} className="option">
            <input
              type="radio"
              checked={question.correctAnswer === value}
              onChange={() => onChange({ ...question, correctAnswer: value })}
            />
            <span>{value ? 'True' : 'False'}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="options">
      {question.acceptedAnswers.map((answer, index) => (
        <div key={`${answer}-${index}`} className="option-row">
          <input
            className="text-input"
            value={answer}
            onChange={(event) => {
              const acceptedAnswers = [...question.acceptedAnswers];
              acceptedAnswers[index] = event.target.value;
              onChange({ ...question, acceptedAnswers });
            }}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const acceptedAnswers = question.acceptedAnswers.filter((_, idx) => idx !== index);
              onChange({ ...question, acceptedAnswers });
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() => onChange({ ...question, acceptedAnswers: [...question.acceptedAnswers, ''] })}
      >
        Add accepted answer
      </button>
    </div>
  );
};

const QuizPreview = ({ quiz }: { quiz: QuizDefinition }) => {
  return (
    <div className="quiz-card">
      <div className="quiz-header">
        <h3>{quiz.title}</h3>
        <p>{quiz.description}</p>
      </div>
      <div className="meta-grid">
        <div>
          <span>Questions</span>
          <strong>{quiz.questions.length}</strong>
        </div>
        <div>
          <span>Time limit</span>
          <strong>{quiz.timeLimitSeconds ? formatTime(quiz.timeLimitSeconds) : 'No limit'}</strong>
        </div>
        <div>
          <span>Passing score</span>
          <strong>{quiz.passingScore ? `${quiz.passingScore}%` : 'N/A'}</strong>
        </div>
        <div>
          <span>Skip policy</span>
          <strong>{quiz.allowSkip ? 'Skippable' : 'Required only'}</strong>
        </div>
        <div>
          <span>Visibility</span>
          <strong>{quiz.visibility ?? 'private'}</strong>
        </div>
      </div>
      <div className="question-preview">
        {quiz.questions.map((question, index) => (
          <div key={question.id} className="question-card">
            <p className="question-index">Question {index + 1}</p>
            <h4>{question.prompt}</h4>
            <p className="hint">
              {question.required ? 'Required' : 'Optional'} · {question.points ?? 1} pts
            </p>
            {question.type === 'multiple_choice_single' || question.type === 'multiple_choice_multi' ? (
              <ul className="options">
                {question.options.map((option) => (
                  <li key={option}>{option}</li>
                ))}
              </ul>
            ) : null}
            {question.type === 'true_false' ? (
              <div className="pill-row">
                <span className="pill">True</span>
                <span className="pill">False</span>
              </div>
            ) : null}
            {question.type === 'short_text' ? (
              <p className="hint">Short answer response</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const QuizRunner = ({ user }: { user: AuthUser | null }) => {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<QuizDefinition | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<QuizAnswerMap>({});
  const [submitted, setSubmitted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState('');
  const { timeLeft, formatted } = useCountdown(quiz?.timeLimitSeconds, started && !submitted);

  useEffect(() => {
    if (id) {
      void (async () => {
        try {
          const response = await apiFetch<{ id: string; title: string; description: string; settings: Record<string, any>; questions: QuizQuestion[] }>('/api/quizzes/' + id);
          const settings = response.settings ?? {};
          const normalized: QuizDefinition = {
            id: response.id,
            title: response.title,
            description: response.description,
            timeLimitSeconds: settings.timeLimitSeconds,
            passingScore: settings.passingScore,
            shuffleQuestions: settings.shuffleQuestions,
            shuffleOptions: settings.shuffleOptions,
            showQuestionList: settings.showQuestionList,
            allowSkip: settings.allowSkip ?? true,
            enforceRequiredBeforeSubmit: settings.enforceRequiredBeforeSubmit ?? true,
            questions: response.questions
          };
          setQuiz(normalizeQuiz(normalized));
        } catch {
          setQuiz(null);
        }
      })();
    }
  }, [id]);

  useEffect(() => {
    if (timeLeft === 0 && quiz?.timeLimitSeconds && started && !submitted) {
      setSubmitted(true);
    }
  }, [timeLeft, quiz, started, submitted]);

  if (!quiz) {
    return (
      <div className="empty-state">
        <h2>Quiz not found</h2>
        <p>Make sure the quiz has been published.</p>
        <Link to="/" className="primary-link">
          Return to builder
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="empty-state">
        <h2>Login required</h2>
        <p>You must be authenticated to attempt quizzes.</p>
        <Link to="/" className="primary-link">
          Return to builder
        </Link>
      </div>
    );
  }

  const currentQuestion = quiz.questions[currentIndex];
  const scoreResult = submitted ? scoreQuiz(quiz, answers) : null;
  const timeTaken = submitted && startTime ? Math.round((Date.now() - startTime.getTime()) / 1000) : 0;

  const handleAnswerChange = (value: string | string[] | boolean) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: value
    }));
  };

  const answeredCount = Object.values(answers).filter((value) => {
    if (value === null || value === undefined) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return true;
  }).length;

  const requiredUnanswered = quiz.questions.filter((question) => question.required).filter((question) => {
    const value = answers[question.id];
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    return value === null || value === undefined;
  });

  const canNavigate = currentQuestion.required
    ? isAnswered(answers[currentQuestion.id])
    : quiz.allowSkip
      ? true
      : isAnswered(answers[currentQuestion.id]);
  const canSubmit = quiz.enforceRequiredBeforeSubmit === false || requiredUnanswered.length === 0;

  const handleSubmit = async () => {
    setSubmitError('');
    if (!attemptId) {
      return;
    }
    if (!canSubmit) {
      setSubmitError('Answer all required questions before submitting.');
      return;
    }
    try {
      await apiFetch(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers })
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit attempt.');
    }
  };

  const handleStart = async () => {
    const response = await apiFetch<{ attemptId: string }>(`/api/quizzes/${quiz.id}/attempts/start`, {
      method: 'POST'
    });
    setAttemptId(response.attemptId);
    setStarted(true);
    setStartTime(new Date());
  };

  const handleRestart = () => {
    setSubmitted(false);
    setStarted(false);
    setAnswers({});
    setCurrentIndex(0);
    setStartTime(null);
  };

  if (!started) {
    return (
      <section className="quiz-start">
        <div className="quiz-card">
          <h2>{quiz.title}</h2>
          <p>{quiz.description}</p>
          <div className="meta-grid">
            <div>
              <span>Questions</span>
              <strong>{quiz.questions.length}</strong>
            </div>
            <div>
              <span>Time limit</span>
              <strong>{quiz.timeLimitSeconds ? formatTime(quiz.timeLimitSeconds) : 'No limit'}</strong>
            </div>
            <div>
              <span>Passing score</span>
              <strong>{quiz.passingScore ? `${quiz.passingScore}%` : 'N/A'}</strong>
            </div>
          </div>
          <button className="primary" type="button" onClick={handleStart}>
            Start Quiz
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="quiz-runner">
      <aside className="sidebar">
        <h3>Progress</h3>
        <p>
          Question {currentIndex + 1} of {quiz.questions.length}
        </p>
        <p>{answeredCount} answered</p>
        {quiz.timeLimitSeconds ? (
          <div className="timer" aria-live="polite">
            <span>Time left</span>
            <strong>{formatted}</strong>
          </div>
        ) : null}
        {quiz.showQuestionList ? (
          <div className="question-list" role="navigation" aria-label="Question list">
            {quiz.questions.map((question, index) => (
              <button
                key={question.id}
                type="button"
                className={index === currentIndex ? 'active' : ''}
                onClick={() => setCurrentIndex(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
        ) : null}
      </aside>
      <div className="quiz-panel">
        {submitted && scoreResult ? (
          <div className="results">
            <h2>Quiz Results</h2>
            <p className="score">{scoreResult.totalScore} / {scoreResult.maxScore}</p>
            <p>{scoreResult.percentage}%</p>
            <p className={scoreResult.passed ? 'pass' : 'fail'}>
              {scoreResult.passed ? 'Passed 🎉' : 'Not yet passing'}
            </p>
            <p className="time-taken">Time taken: {timeTaken ? formatTime(timeTaken) : 'N/A'}</p>
            <div className="review">
              {quiz.questions.map((question) => {
                const result = scoreResult.perQuestion.find((item) => item.questionId === question.id);
                return (
                  <div key={question.id} className="question-card">
                    <h4>{question.prompt}</h4>
                    <p className="review-status">
                      {result?.isCorrect ? 'Correct' : 'Incorrect'}
                    </p>
                    <div className="review-answer">
                      <span>Your answer:</span>
                      <strong>{formatAnswer(result?.answer)}</strong>
                    </div>
                    <div className="review-answer">
                      <span>Correct answer:</span>
                      <strong>{formatCorrectAnswer(question)}</strong>
                    </div>
                    {question.explanation ? <p className="explanation">{question.explanation}</p> : null}
                  </div>
                );
              })}
            </div>
            <button className="secondary" type="button" onClick={handleRestart}>
              Retry Quiz
            </button>
          </div>
        ) : (
          <div className="question-card">
            <p className="question-index">Question {currentIndex + 1}</p>
            <h2>{currentQuestion.prompt}</h2>
            <p className="hint">
              {currentQuestion.required ? 'Required' : 'Optional'} · {currentQuestion.points ?? 1} pts
            </p>
            <QuestionBody
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              onChange={handleAnswerChange}
            />
            {submitError ? <p className="error-text">{submitError}</p> : null}
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
              >
                Previous
              </button>
              {currentIndex === quiz.questions.length - 1 ? (
                <button type="button" className="primary" onClick={handleSubmit} disabled={!canSubmit}>
                  Submit Quiz
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, quiz.questions.length - 1))}
                  disabled={!canNavigate}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const Dashboard = ({ user }: { user: AuthUser | null }) => {
  const [quizzes, setQuizzes] = useState<Array<{ id: string; title: string; status: string; visibility: string }>>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ attempts: number; averageScore: number; medianScore: number; passRate: number; averageTime: number } | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<any | null>(null);
  const [myAttempts, setMyAttempts] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      return;
    }
    void (async () => {
      const response = await apiFetch<{ quizzes: Array<{ id: string; title: string; status: string; visibility: string }> }>('/api/quizzes/mine');
      setQuizzes(response.quizzes);
    })();
  }, [user]);

  useEffect(() => {
    if (!selectedQuiz) {
      return;
    }
    void (async () => {
      const response = await apiFetch<{ attempts: any[]; summary: any }>(`/api/quizzes/${selectedQuiz}/attempts`);
      setAttempts(response.attempts);
      setSummary(response.summary);
    })();
  }, [selectedQuiz]);

  useEffect(() => {
    if (!user) {
      return;
    }
    void (async () => {
      const response = await apiFetch<{ attempts: any[] }>('/api/attempts/mine');
      setMyAttempts(response.attempts);
    })();
  }, [user]);

  if (!user) {
    return (
      <div className="empty-state">
        <h2>Login required</h2>
        <p>Sign in to see your analytics dashboard.</p>
        <Link to="/" className="primary-link">
          Return to builder
        </Link>
      </div>
    );
  }

  return (
    <section className="dashboard">
      <div className="builder__panel">
        <div className="panel__header">
          <h2>Your quizzes</h2>
          <p>Track performance for each published quiz.</p>
        </div>
        <div className="panel__body">
          {quizzes.length === 0 ? (
            <p className="empty">No quizzes created yet.</p>
          ) : (
            <ul className="list">
              {quizzes.map((quiz) => (
                <li key={quiz.id}>
                  <button type="button" className="link-button" onClick={() => setSelectedQuiz(quiz.id)}>
                    {quiz.title} · {quiz.status}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="builder__panel full">
        <div className="panel__header">
          <h2>Quiz analytics</h2>
          <p>Scores, pass rates, and participant breakdown.</p>
        </div>
        <div className="panel__body">
          {summary ? (
            <div className="meta-grid">
              <div>
                <span>Attempts</span>
                <strong>{summary.attempts}</strong>
              </div>
              <div>
                <span>Average score</span>
                <strong>{summary.averageScore}</strong>
              </div>
              <div>
                <span>Median score</span>
                <strong>{summary.medianScore}</strong>
              </div>
              <div>
                <span>Pass rate</span>
                <strong>{summary.passRate}%</strong>
              </div>
              <div>
                <span>Avg. time</span>
                <strong>{formatTime(summary.averageTime)}</strong>
              </div>
            </div>
          ) : (
            <p className="empty">Select a quiz to view analytics.</p>
          )}
          {attempts.length > 0 ? (
            <div className="table">
              <div className="table-row table-header">
                <span>Participant</span>
                <span>Score</span>
                <span>Percentage</span>
                <span>Pass</span>
                <span>Time</span>
              </div>
              {attempts.map((attempt) => (
                <button
                  key={attempt.id}
                  type="button"
                  className="table-row"
                  onClick={async () => {
                    const detail = await apiFetch(`/api/attempts/${attempt.id}`);
                    setAttemptDetail(detail);
                  }}
                >
                  <span>{attempt.email}</span>
                  <span>{attempt.score ?? 0}</span>
                  <span>{attempt.percentage ?? 0}%</span>
                  <span>{attempt.passed ? 'Yes' : 'No'}</span>
                  <span>{attempt.time_taken_seconds ? formatTime(attempt.time_taken_seconds) : 'N/A'}</span>
                </button>
              ))}
            </div>
          ) : null}
          {attemptDetail ? (
            <div className="question-card">
              <h3>Attempt details</h3>
              {attemptDetail.answers.map((answer: any) => (
                <div key={answer.id} className="review-answer">
                  <span>{answer.prompt}</span>
                  <strong>{answer.answer_json ?? 'No answer'}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="builder__panel full">
        <div className="panel__header">
          <h2>My attempts</h2>
          <p>Your personal attempt history.</p>
        </div>
        <div className="panel__body">
          {myAttempts.length === 0 ? (
            <p className="empty">No attempts yet.</p>
          ) : (
            <ul className="list">
              {myAttempts.map((attempt) => (
                <li key={attempt.id}>
                  {attempt.title} · {attempt.percentage ?? 0}% · {attempt.passed ? 'Passed' : 'Not passed'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

const isAnswered = (answer: QuizAnswerMap[string]) => {
  if (Array.isArray(answer)) {
    return answer.length > 0;
  }
  if (typeof answer === 'string') {
    return answer.trim().length > 0;
  }
  return answer !== null && answer !== undefined;
};

const QuestionBody = ({
  question,
  answer,
  onChange
}: {
  question: QuizDefinition['questions'][number];
  answer: QuizAnswerMap[string];
  onChange: (value: string | string[] | boolean) => void;
}) => {
  if (question.type === 'multiple_choice_single') {
    return (
      <div className="options">
        {question.options.map((option) => (
          <label key={option} className="option">
            <input
              type="radio"
              name={question.id}
              checked={answer === option}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === 'multiple_choice_multi') {
    const selected = Array.isArray(answer) ? answer : [];
    return (
      <div className="options">
        {question.options.map((option) => (
          <label key={option} className="option">
            <input
              type="checkbox"
              name={`${question.id}-${option}`}
              checked={selected.includes(option)}
              onChange={() => {
                if (selected.includes(option)) {
                  onChange(selected.filter((item) => item !== option));
                } else {
                  onChange([...selected, option]);
                }
              }}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === 'true_false') {
    return (
      <div className="options">
        {[true, false].map((value) => (
          <label key={value.toString()} className="option">
            <input
              type="radio"
              name={question.id}
              checked={answer === value}
              onChange={() => onChange(value)}
            />
            <span>{value ? 'True' : 'False'}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      className="text-input"
      type="text"
      value={typeof answer === 'string' ? answer : ''}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Short text answer"
    />
  );
};

const formatAnswer = (answer: QuizAnswerMap[string]) => {
  if (Array.isArray(answer)) {
    return answer.join(', ');
  }
  if (answer === null || answer === undefined || answer === '') {
    return 'No response';
  }
  return String(answer);
};

const formatCorrectAnswer = (question: QuizDefinition['questions'][number]) => {
  if (question.type === 'multiple_choice_single') {
    return question.correctAnswer;
  }
  if (question.type === 'multiple_choice_multi') {
    return question.correctAnswers.join(', ');
  }
  if (question.type === 'true_false') {
    return question.correctAnswer ? 'True' : 'False';
  }
  return question.acceptedAnswers.join(', ');
};

export default App;
