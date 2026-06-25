"use client";

import { PageHeader } from "@/components/page-header";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { mixedQuestions } from "@/lib/quiz";

export default function MixedQuizPage() {
  const questions = mixedQuestions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mixed review"
        description="A fresh shuffle of questions drawn from every chapter."
      />
      <QuizRunner slug="mixed" title="Mixed review" questions={questions} />
    </div>
  );
}
