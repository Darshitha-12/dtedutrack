"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowRight, Clock, Target, Loader2, AlertCircle } from "lucide-react";

interface Unit {
  id: string;
  slug: string;
  order: number;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  estimatedMinutes: number;
  status: string;
  source: string;
  _count: { topics: number };
}

interface SubjectData {
  id: string;
  slug: string;
  name: string;
  nameSi: string;
  description: string;
  descriptionSi: string;
  icon: string;
  color: string;
  status: string;
}

export default function SubjectPage() {
  const params = useParams();
  const subjectSlug = params.subjectSlug as string;
  const [subject, setSubject] = useState<SubjectData | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/content/subjects/${subjectSlug}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Subject not found");
          } else {
            setError("Failed to load content");
          }
          return;
        }
        const data = await res.json();
        setSubject(data.subject);
        setUnits(data.units);
      } catch {
        setError("Failed to load content");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subjectSlug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="🔍"
          title={error || "Not found"}
          description="The subject you're looking for doesn't exist or couldn't be loaded."
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
      <PageHeader
        title={`${subject.icon} ${subject.name}`}
        description={subject.description}
        action={
          <Link href="/syllabus">
            <Button variant="outline" size="sm">All Subjects</Button>
          </Link>
        }
      />

      {subject.status === "DEMO" && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          <span className="text-yellow-600">⚠</span>
          <p className="text-yellow-700 dark:text-yellow-300">
            This is demo content for demonstration purposes. It is not the official Sri Lankan A/L syllabus.
          </p>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        {units.length} units · {units.reduce((sum, u) => sum + u._count.topics, 0)} topics
      </div>

      <div className="space-y-4">
        {units.map((unit, i) => (
          <Link key={unit.id} href={`/syllabus/${subjectSlug}/${unit.slug}`}>
            <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer group">
              <div className="flex items-start gap-4">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: `${subject.color}20`, color: subject.color }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold group-hover:text-primary transition-colors">
                    {unit.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {unit.description}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {unit._count.topics} topics
                    </span>
                    {unit.estimatedMinutes > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        ~{unit.estimatedMinutes} min
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                      {unit.source === "DEMO" ? "Demo" : unit.source}
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {units.length === 0 && (
        <EmptyState
          icon="📚"
          title="No units available"
          description="Content for this subject is being prepared."
        />
      )}
    </div>
  );
}
