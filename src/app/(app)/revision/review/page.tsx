"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, CheckCircle, XCircle, ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadRevisionState, saveRevisionState, reviewTopic } from "@/features/revision/store";
import { getDueTopics } from "@/features/revision/scheduler";

export default function ReviewPage() {
  const router = useRouter();
  const [state, setState] = useState(loadRevisionState());
  const [queue, setQueue] = useState(getDueTopics(state.topics));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const due = getDueTopics(state.topics);
    setQueue(due);
    if (due.length === 0) {
      setCompleted(true);
    }
  }, [state.topics]);

  if (completed || queue.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <Card className="text-center">
          <CardContent className="pt-12 pb-12">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <h2 className="text-2xl font-bold mb-2">All Caught Up!</h2>
            <p className="text-muted-foreground mb-6">
              No topics due for review right now. Great job!
            </p>
            <div className="flex gap-2 justify-center">
              <Link href="/revision">
                <Button>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Back to Revision
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentTopic = queue[currentIndex];

  const handleGrade = (grade: 1 | 2 | 3 | 4 | 5) => {
    const newState = reviewTopic(state, currentTopic.id, grade);
    setState(newState);
    saveRevisionState(newState);

    if (currentIndex + 1 < queue.length) {
      setCurrentIndex(currentIndex + 1);
      setRevealed(false);
    } else {
      setCompleted(true);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Quick Review Session
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentIndex + 1} / {queue.length} topics
          </p>
        </div>
        <Link href="/revision">
          <Button variant="outline" size="sm">Exit</Button>
        </Link>
      </div>

      <Card className="min-h-[300px]">
        <CardHeader>
          <CardTitle className="text-2xl">{currentTopic.title}</CardTitle>
          {currentTopic.subject && (
            <CardDescription>{currentTopic.subject}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {currentTopic.chapter && (
            <div>
              <p className="text-sm font-medium mb-1">Chapter</p>
              <p className="text-sm text-muted-foreground">{currentTopic.chapter}</p>
            </div>
          )}
          {currentTopic.notes && (
            <div>
              <p className="text-sm font-medium mb-1">Notes</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{currentTopic.notes}</p>
            </div>
          )}
          {!revealed && (
            <Button onClick={() => setRevealed(true)} className="w-full" size="lg">
              Show Answer / Recall
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          {revealed && (
            <div className="space-y-3 pt-4 border-t">
              <p className="text-sm font-medium text-center mb-4">How well did you remember?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Button variant="destructive" onClick={() => handleGrade(1)} className="flex-col h-auto py-2">
                  <XCircle className="h-4 w-4 mb-1" />
                  <span className="text-xs">Forgot</span>
                </Button>
                <Button variant="outline" onClick={() => handleGrade(2)} className="flex-col h-auto py-2">
                  <span className="text-xs">Hard</span>
                </Button>
                <Button variant="outline" onClick={() => handleGrade(3)} className="flex-col h-auto py-2">
                  <span className="text-xs">OK</span>
                </Button>
                <Button variant="outline" onClick={() => handleGrade(4)} className="flex-col h-auto py-2">
                  <span className="text-xs">Good</span>
                </Button>
                <Button variant="default" onClick={() => handleGrade(5)} className="flex-col h-auto py-2">
                  <CheckCircle className="h-4 w-4 mb-1" />
                  <span className="text-xs">Easy</span>
                </Button>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Grade 1 = forgot (review tomorrow) • Grade 5 = easy (longer interval)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Interval before: {currentTopic.intervalDays} days</span>
            <span>Streak: {currentTopic.streak}</span>
            <span>Retention: {Math.round(currentTopic.retention)}%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
