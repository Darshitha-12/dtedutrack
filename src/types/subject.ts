export type SubjectId = "bio" | "chem" | "phy" | "agri" | "math" | "ict" | "dt";

export interface Subject {
  id: SubjectId;
  name: string;
  icon: string;
  color: string;
}

export const SUBJECTS: Record<SubjectId, Subject> = {
  bio: { id: "bio", name: "Biology", icon: "🧬", color: "#10B981" },
  chem: { id: "chem", name: "Chemistry", icon: "⚗️", color: "#06B6D4" },
  phy: { id: "phy", name: "Physics", icon: "⚡", color: "#8B5CF6" },
  agri: { id: "agri", name: "Agriculture", icon: "🌾", color: "#F59E0B" },
  math: { id: "math", name: "Mathematics", icon: "📐", color: "#EF4444" },
  ict: { id: "ict", name: "ICT", icon: "💻", color: "#EC4899" },
  dt: { id: "dt", name: "Design & Technology", icon: "🛠️", color: "#0EA5E9" },
};

export const SUBJECT_LIST = Object.values(SUBJECTS);

export function getSubject(id: SubjectId): Subject {
  return SUBJECTS[id] ?? SUBJECTS.bio;
}
