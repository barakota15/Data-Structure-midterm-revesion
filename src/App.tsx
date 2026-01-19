import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { getQuiz, listQuizzes, storeQuiz } from './utils/storage';
import {
  normalizeQuiz,
  QuizAnswerMap,
  QuizDefinition,
  scoreQuiz,
  validateQuiz
} from './utils/quiz';
import { useCountdown } from './utils/useCountdown';

const DEFAULT_JSON = `{
  "id": "my-quiz",
  "title": "Product Basics",
  "description": "A quick quiz about product strategy.",
  "timeLimitSeconds": 120,
  "passingScore": 70,
  "shuffleQuestions": false,
  "shuffleOptions": false,
  "showQuestionList": true,
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice_single",
      "prompt": "Which metric best describes product retention?",
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

const App = () => {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    document.body.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <Link to="/" className="logo">
            JSON Quiz Builder
          </Link>
          <p className="subtitle">Validate, preview, and publish interactive quizzes.</p>
        </div>
        <button
          className="toggle"
          onClick={() => setDarkMode((prev) => !prev)}
          aria-label="Toggle dark mode"
          type="button"
        >
          {darkMode ? 'Light mode' : 'Dark mode'}
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Builder />} />
          <Route path="/quiz/:id" element={<QuizRunner />} />
        </Routes>
      </main>
    </div>
  );
};

const Builder = () => {
  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [previewQuiz, setPreviewQuiz] = useState<QuizDefinition | null>(null);
  const [savedId, setSavedId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [savedQuizzes, setSavedQuizzes] = useState<QuizDefinition[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setSavedQuizzes(listQuizzes());
  }, []);

  const handleValidate = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
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

  const handlePublish = () => {
    if (!previewQuiz) {
      setMessage('Please validate the JSON before publishing.');
      return;
    }
    const newId = previewQuiz.id || nanoid(6);
    const storedQuiz = { ...previewQuiz, id: newId };
    storeQuiz(storedQuiz);
    setSavedId(newId);
    setSavedQuizzes(listQuizzes());
    setMessage('Quiz published! Share the link below.');
  };

  return (
    <section className="builder">
      <div className="builder__panel">
        <div className="panel__header">
          <h2>Admin Builder</h2>
          <p>Paste your JSON below or upload a .json file to get started.</p>
        </div>
        <div className="panel__body">
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
            <button type="button" className="secondary" onClick={handlePublish}>
              Publish Quiz
            </button>
          </div>
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
          <div className="panel__header">
            <h3>Saved quizzes</h3>
          </div>
          {savedQuizzes.length === 0 ? (
            <p className="empty">No quizzes stored yet.</p>
          ) : (
            <ul className="list">
              {savedQuizzes.map((quiz) => (
                <li key={quiz.id}>
                  <Link to={`/quiz/${quiz.id}`}>{quiz.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="builder__panel full">
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
          <span>Shuffle</span>
          <strong>{quiz.shuffleQuestions ? 'Questions' : 'Off'}</strong>
        </div>
      </div>
      <div className="question-preview">
        {quiz.questions.map((question, index) => (
          <div key={question.id} className="question-card">
            <p className="question-index">Question {index + 1}</p>
            <h4>{question.prompt}</h4>
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

const QuizRunner = () => {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<QuizDefinition | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<QuizAnswerMap>({});
  const [submitted, setSubmitted] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const { timeLeft, formatted } = useCountdown(quiz?.timeLimitSeconds, started && !submitted);

  useEffect(() => {
    if (id) {
      const stored = getQuiz(id);
      if (stored) {
        setQuiz(normalizeQuiz(stored));
      }
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

  const handleSubmit = () => {
    setSubmitted(true);
  };

  const handleStart = () => {
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
            <QuestionBody
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              onChange={handleAnswerChange}
            />
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
                <button type="button" className="primary" onClick={handleSubmit}>
                  Submit Quiz
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, quiz.questions.length - 1))}
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
