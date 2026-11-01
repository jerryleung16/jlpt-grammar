import { attemptSchema, questionSchema, type Question, type QuizAttempt } from './model';

export function createQuiz(
  questions: Question[], requested: number, id: string, now: Date, random = Math.random,
): QuizAttempt {
  if (!Number.isInteger(requested) || requested < 1 || requested > 100) throw new Error('題數須為 1–100 的整數。');
  if (!questions.length) throw new Error('此範圍尚無可用題目，請更改範圍。');
  const pool = questions.map((question) => questionSchema.parse(question));
  if (new Set(pool.map((question) => question.id)).size !== pool.length) throw new Error('題庫有重複 ID。');
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return attemptSchema.parse({
    id, startedAt: now.toISOString(), questions: pool.slice(0, requested), answers: [],
  });
}

export function answerQuiz(attempt: QuizAttempt, index: number, answer: number): QuizAttempt {
  if (index !== attempt.answers.length || index >= attempt.questions.length) {
    throw new Error('此題已作答或進度已改變，請重新載入目前測驗。');
  }
  return attemptSchema.parse({ ...attempt, answers: [...attempt.answers, answer] });
}

export function scoreQuiz(attempt: QuizAttempt) {
  return attempt.answers.filter((answer, index) => answer === attempt.questions[index].answer).length;
}

export function wrongQuestions(attempts: QuizAttempt[]): Question[] {
  const latest = new Map<string, { question: Question; wrong: boolean }>();
  for (const attempt of [...attempts].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))) {
    attempt.answers.forEach((answer, index) => {
      const question = attempt.questions[index];
      latest.set(question.id, { question, wrong: answer !== question.answer });
    });
  }
  return [...latest.values()].filter(({ wrong }) => wrong).map(({ question }) => question);
}
