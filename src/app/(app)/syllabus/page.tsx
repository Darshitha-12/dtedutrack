import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";

// This page can be server-rendered since content is public
// Progress requires auth but we handle that client-side

export default function SyllabusPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Syllabus"
        description="Explore the A/L Biology curriculum"
      />
      <Suspense fallback={<div className="text-center py-8 text-muted-foreground">Loading subjects...</div>}>
        <SubjectList />
      </Suspense>
    </div>
  );
}

async function SubjectList() {
  // In a real app with DB, this would fetch from the database
  // For now, use the static subject data
  const subjects = [
    {
      id: "bio",
      slug: "biology",
      name: "Biology",
      nameSi: "ජීව විද්‍යාව",
      description: "Complete A/L Biology curriculum covering cell biology, molecular biology, genetics, ecology, and more.",
      descriptionSi: "කෝෂ ජීව විද්‍යාව, අණුක ජීව විද්‍යාව, ජාන විද්‍යාව, පරිසර විද්‍යාව සහ තවත් බොහෝ දේ ආවරණය කරන සම්පූර්ණ A/L ජීව විද්‍යා පාඨ්‍යක්‍රමය.",
      icon: "🧬",
      color: "#10B981",
      unitCount: 3,
      topicCount: 6,
      status: "DEMO",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((subject) => (
        <Link key={subject.id} href={`/syllabus/${subject.slug}`}>
          <Card className="p-6 h-full hover:shadow-lg transition-shadow cursor-pointer group">
            <div className="flex items-start justify-between mb-4">
              <div
                className="h-14 w-14 rounded-xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${subject.color}15` }}
              >
                {subject.icon}
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
                {subject.status === "DEMO" ? "Demo Content" : subject.status}
              </span>
            </div>
            <h3 className="text-lg font-semibold mb-1 group-hover:text-primary transition-colors">
              {subject.name}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {subject.description}
            </p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{subject.unitCount} units · {subject.topicCount} topics</span>
              <ArrowRight className="h-4 w-4 group-hover:text-primary transition-colors" />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
