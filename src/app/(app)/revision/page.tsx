"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Plus, Play, Trash2, Clock, TrendingUp, Target } from "lucide-react";
import Link from "next/link";
import { loadRevisionState, saveRevisionState, createTopic, deleteTopic, updateTopicRetention } from "@/features/revision/store";
import { getDueTopics } from "@/features/revision/scheduler";
import type { RevisionTopic } from "@/features/revision/types";

export default function RevisionPage() {
  const [state, setState] = useState(loadRevisionState());
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const updated = { ...state, topics: updateTopicRetention(state.topics) };
    setState(updated);
    saveRevisionState(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dueTopics = getDueTopics(state.topics);
  const mastered = state.topics.filter((t) => t.status === "mastered").length;
  const learning = state.topics.filter((t) => t.status === "learning").length;

  const handleAdd = () => {
    if (!title.trim()) return;
    const topic = createTopic({ title, subject: subject || undefined });
    const newState = { ...state, topics: [topic, ...state.topics] };
    setState(newState);
    saveRevisionState(newState);
    setTitle("");
    setSubject("");
    setShowAdd(false);
  };

  const handleDelete = (id: string) => {
    const newState = deleteTopic(state, id);
    setState(newState);
    saveRevisionState(newState);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Forgetting Curve & Smart Spaced Repetition
          </h1>
          <p className="text-sm text-muted-foreground">
            Ebbinghaus curve based revision • Auto-spaced intervals (Day 0 → 1 → 3 → 7 → 14 → 30)
          </p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Topic
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Due Today</p>
                <p className="text-2xl font-bold text-orange-500">{dueTopics.length}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Topics</p>
                <p className="text-2xl font-bold">{state.topics.length}</p>
              </div>
              <Target className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Learning</p>
                <p className="text-2xl font-bold text-yellow-500">{learning}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Mastered</p>
                <p className="text-2xl font-bold text-green-500">{mastered}</p>
              </div>
              <Brain className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {dueTopics.length > 0 && (
        <Card className="border-orange-500/50 bg-gradient-to-r from-orange-500/10 to-red-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Ready for Review
            </CardTitle>
            <CardDescription>Topics due for spaced repetition review</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/revision/review">
              <Button size="lg" className="w-full sm:w-auto">
                <Play className="h-4 w-4 mr-2" />
                Start Quick Review ({dueTopics.length} {dueTopics.length === 1 ? "topic" : "topics"})
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Topic</CardTitle>
            <CardDescription>Add a topic to start your smart revision schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Topic title (e.g., Photosynthesis)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Subject (e.g., Biology)" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={handleAdd}>Add to Queue</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Topics</CardTitle>
          <CardDescription>Your spaced repetition queue</CardDescription>
        </CardHeader>
        <CardContent>
          {state.topics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No topics yet. Add your first topic to begin!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {state.topics.map((topic) => (
                <div key={topic.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{topic.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {topic.subject && `${topic.subject} • `}
                      Interval: {topic.intervalDays} day{topic.intervalDays !== 1 ? "s" : ""} • 
                      Streak: {topic.streak} • 
                      Retention: {Math.round(topic.retention)}% • 
                      Status: <span className="capitalize">{topic.status}</span>
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(topic.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
