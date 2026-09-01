"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, ArrowLeft, Clock, Target, Loader2,
  BookOpen, AlertCircle, ChevronRight,
} from "lucide-react";

interface Topic {
  id: string;
  slug: string;
  order: number;
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
  _count: { subtopics: number; learningObjectives: number };
}

interface UnitData {
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  estimatedMinutes: number;
  subjectSlug: string;
  subjectName: string;
  subjectIcon: string;
  subjectColor: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-green-500/15 text-green-600 dark:text-green-400",
  intermediate: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  advanced: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const IMPORTANCE_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export default function UnitPage() {
  const params = useParams();
  const subjectSlug = params.subjectSlug as string;
  const unitSlug = params.unitSlug as string;
  const [unit, setUnit] = useState<UnitData | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/content/subjects/${subjectSlug}/${unitSlug}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Unit not found" : "Failed to load content");
          return;
        }
        const data = await res.json();
        setUnit({
          ...data.unit,
          subjectSlug: data.subject.slug,
          subjectName: data.subject.name,
          subjectIcon: data.subject.icon,
          subjectColor: data.subject.color,
        });
        setTopics(data.topics);
      } catch {
        setError("Failed to load content");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subjectSlug, unitSlug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="🔍"
          title={error || "Not found"}
          description="The unit you're looking for doesn't exist."
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
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/syllabus" className="hover:text-foreground transition-colors">Syllabus</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/syllabus/${subjectSlug}`} className="hover:text-foreground transition-colors">
          {unit.subjectIcon} {unit.subjectName}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">{unit.title}</span>
      </nav>

      <PageHeader
        title={unit.title}
        description={unit.description}
        action={
          <Link href={`/syllabus/${subjectSlug}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <BookOpen className="h-4 w-4" />
          {topics.length} topics
        </span>
        {unit.estimatedMinutes > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            ~{unit.estimatedMinutes} min total
          </span>
        )}
      </div>

      <div className="space-y-3">
        {topics.map((topic, i) => (
          <Link key={topic.id} href={`/syllabus/${subjectSlug}/${unitSlug}/${topic.slug}`}>
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer group">
              <div className="flex items-start gap-3">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: `${unit.subjectColor}20`, color: unit.subjectColor }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium group-hover:text-primary transition-colors">
                      {topic.title}
                    </h3>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[topic.difficulty] || ""}`}>
                      {topic.difficulty}
                    </span>
                    {topic.importance !== "normal" && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${IMPORTANCE_COLORS[topic.importance] || ""}`}>
                        {topic.importance}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {topic.description}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{topic._count.subtopics} subtopics</span>
                    <span>{topic._count.learningObjectives} objectives</span>
                    {topic.examRelevance >= 80 && (
                      <span className="flex items-center gap-1 text-primary">
                        <Target className="h-3 w-3" />
                        High exam relevance
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {topics.length === 0 && (
        <EmptyState
          icon="📝"
          title="No topics available"
          description="Topics for this unit are being prepared."
        />
      )}
    </div>
  );
}
