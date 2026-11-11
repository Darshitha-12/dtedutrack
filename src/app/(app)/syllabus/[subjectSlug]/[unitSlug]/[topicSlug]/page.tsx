"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Clock, Target, Loader2,
  BookOpen, ChevronRight, CheckCircle2, Circle, Play,
} from "lucide-react";

interface Subtopic {
  id: string;
  slug: string;
  order: number;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  content: string;
  difficulty: string;
  estimatedMinutes: number;
  status: string;
  source: string;
  _count: { learningObjectives: number };
}

interface LearningObjective {
  id: string;
  slug: string;
  order: number;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  difficulty: string;
  status: string;
  source: string;
}

interface TopicData {
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  difficulty: string;
  importance: string;
  examRelevance: number;
  estimatedMinutes: number;
  status: string;
  source: string;
  unitSlug: string;
  unitTitle: string;
  subjectSlug: string;
  subjectName: string;
  subjectIcon: string;
  subjectColor: string;
}

interface ProgressData {
  status: string;
  masteryScore: number;
  completionPercent: number;
}

export default function TopicPage() {
  const params = useParams();
  const subjectSlug = params.subjectSlug as string;
  const unitSlug = params.unitSlug as string;
  const topicSlug = params.topicSlug as string;
  const [topic, setTopic] = useState<TopicData | null>(null);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/content/subjects/${subjectSlug}/${unitSlug}/${topicSlug}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Topic not found" : "Failed to load content");
          return;
        }
        const data = await res.json();
        setTopic({
          ...data.topic,
          unitSlug: data.unit.slug,
          unitTitle: data.unit.title,
          subjectSlug: data.subject.slug,
          subjectName: data.subject.name,
          subjectIcon: data.subject.icon,
          subjectColor: data.subject.color,
        });
        setSubtopics(data.subtopics);
        setObjectives(data.objectives);
      } catch {
        setError("Failed to load content");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subjectSlug, unitSlug, topicSlug]);

  async function handleStartLearning() {
    try {
      const res = await fetch("/api/content/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic?.id, status: "IN_PROGRESS" }),
      });
      if (res.ok) {
        const data = await res.json();
        setProgress(data.progress);
      }
    } catch {
      // silently fail
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="🔍"
          title={error || "Not found"}
          description="The topic you're looking for doesn't exist."
          action={
            <Link href="/syllabus">
              <Button variant="outline">Back to Syllabus</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link href="/syllabus" className="hover:text-foreground transition-colors">Syllabus</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link href={`/syllabus/${subjectSlug}`} className="hover:text-foreground transition-colors">
          {topic.subjectIcon} {topic.subjectName}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link href={`/syllabus/${subjectSlug}/${unitSlug}`} className="hover:text-foreground transition-colors">
          {topic.unitTitle}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-foreground font-medium">{topic.title}</span>
      </nav>

      {/* Topic Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{topic.title}</h1>
            <p className="text-muted-foreground mt-1">{topic.description}</p>
          </div>
          <Link href={`/syllabus/${subjectSlug}/${unitSlug}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            topic.difficulty === "beginner" ? "bg-green-500/15 text-green-600" :
            topic.difficulty === "intermediate" ? "bg-yellow-500/15 text-yellow-600" :
            "bg-red-500/15 text-red-600"
          }`}>
            {topic.difficulty}
          </span>
          {topic.examRelevance >= 80 && (
            <span className="flex items-center gap-1 text-primary text-xs font-medium">
              <Target className="h-3 w-3" />
              High exam relevance ({topic.examRelevance}%)
            </span>
          )}
          {topic.estimatedMinutes > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="h-3 w-3" />
              ~{topic.estimatedMinutes} min
            </span>
          )}
          <span className="text-xs text-muted-foreground px-2 py-1 rounded bg-muted">
            {topic.source === "DEMO" ? "Demo Content" : topic.source}
          </span>
        </div>

        {/* Progress */}
        {progress && (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                {progress.status === "MASTERED" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {progress.status === "MASTERED" ? "Mastered" :
                   progress.status === "IN_PROGRESS" ? "In Progress" :
                   progress.status === "REVIEW" ? "Under Review" : "Not Started"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {progress.completionPercent}% complete · {progress.masteryScore}% mastery
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Start Learning Button */}
        {!progress && (
          <Button onClick={handleStartLearning} className="gap-2">
            <Play className="h-4 w-4" />
            Start Learning
          </Button>
        )}
      </div>

      {/* Subtopics */}
      {subtopics.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Subtopics</h2>
          {subtopics.map((st, i) => (
            <Card key={st.id} className="p-4">
              <div className="flex items-start gap-3">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: `${topic.subjectColor}20`, color: topic.subjectColor }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{st.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{st.description}</p>
                  {st.content && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-3 italic">
                      {st.content.slice(0, 200)}...
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{st._count.learningObjectives} objectives</span>
                    {st.estimatedMinutes > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        ~{st.estimatedMinutes} min
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Learning Objectives */}
      {objectives.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Learning Objectives</h2>
          <Card className="p-4">
            <ul className="space-y-2">
              {objectives.map((obj) => (
                <li key={obj.id} className="flex items-start gap-2 text-sm">
                  <Circle className="h-3 w-3 mt-1.5 shrink-0 text-muted-foreground" />
                  <div>
                    <span className="font-medium">{obj.title}</span>
                    {obj.description && (
                      <p className="text-muted-foreground mt-0.5">{obj.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {subtopics.length === 0 && objectives.length === 0 && (
        <EmptyState
          icon="📝"
          title="Content coming soon"
          description="Detailed content for this topic is being prepared."
        />
      )}
    </div>
  );
}
