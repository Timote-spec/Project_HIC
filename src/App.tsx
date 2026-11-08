import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "login"
  | "dashboard"
  | "deadlines"
  | "add-deadline"
  | "edit-deadline"
  | "deadline-detail"
  | "completion"
  | "calendar"
  | "notifications"
  | "profile"
  | "reviewer";

type Priority = "Low" | "Medium" | "High";
type TaskType = "Assignment" | "Project" | "Quiz" | "Exam" | "Presentation" | "Other";
type FilterType = "All" | "Today" | "This Week" | "Overdue" | "Completed";
type ThemeMode = "Light" | "Dark" | "Ocean" | "Sunset";
type RevisionStatus = "Not started" | "Reviewing" | "Reviewed";

interface Deadline {
  id: string;
  taskName: string;
  subject: string;
  taskType: TaskType;
  description: string;
  dueDate: string;
  dueTime: string;
  priority: Priority;
  completed: boolean;
  completedAt?: string;
  revision: RevisionStatus;
  notes?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
}

interface ReviewQuestion {
  question: string;
  answer: string;
}

interface ReviewData {
  fileName: string;
  summary: string[];
  keywords: string[];
  questions: ReviewQuestion[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split("T")[0];
const offsetDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

function isToday(dateStr: string) { return dateStr === todayStr(); }
function isThisWeek(dateStr: string) {
  const now = new Date();
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return d >= start && d < end;
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function isOverdue(dateStr: string, timeStr: string) {
  const target = new Date(`${dateStr}T${timeStr || "00:00"}:00`).getTime();
  return target < Date.now();
}
function getCountdown(dueDate: string, dueTime: string) {
  const diff = new Date(`${dueDate}T${dueTime}:00`).getTime() - Date.now();
  if (diff < 0) return "Overdue";
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  if (h < 1) return `Due in ${m}m`;
  if (h < 24) return `Due in ${h}h ${m}m`;
  return `Due in ${Math.floor(h / 24)}d`;
}

function buildReviewData(fileName: string, rawText: string): ReviewData {
  const cleanText = rawText
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = cleanText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12);

  const keywords = Array.from(
    new Set(
      cleanText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 4 && !["which", "there", "about", "their", "these", "would", "study", "notes", "chapter", "material"].includes(word))
        .slice(0, 8)
    )
  );

  const summary = sentences.length
    ? sentences.slice(0, 4).map((sentence, index) => `${index + 1}. ${sentence.slice(0, 180)}${sentence.length > 180 ? "..." : ""}`)
    : ["Upload your class notes or exam materials to generate a quick review summary."];

  const questions = sentences.length
    ? sentences.slice(0, 5).map((sentence, index) => {
        const keyword = keywords[index % Math.max(keywords.length, 1)] ?? "core concept";
        return {
          question: `Question ${index + 1}: What is the most important idea related to ${keyword}?`,
          answer: sentence.length > 220 ? `${sentence.slice(0, 220)}...` : sentence,
        };
      })
    : [
        {
          question: "What are the main concepts in this file?",
          answer: "Use the uploaded material to identify the central ideas, examples, and formulas before the exam.",
        },
      ];

  return { fileName, summary, keywords: keywords.length ? keywords : ["key idea", "example", "formula", "review"], questions };
}

async function readPdfText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  return pages.join("\n");
}

// ─── Sample Data ──────────────────────────────────────────────────────────────

const INITIAL_DEADLINES: Deadline[] = [
  { id: "1", taskName: "Final Project", subject: "Programming", taskType: "Project", description: "Build a full-stack web application with React and Node.js. Include authentication, database integration, and a live deployment link.", dueDate: todayStr(), dueTime: "23:59", priority: "High", completed: false, revision: "Reviewing", notes: "Focus on database and auth flow. Keep deployment checklist ready.", attachmentName: "project-brief.txt" },
  { id: "2", taskName: "Assignment 3", subject: "Database Management", taskType: "Assignment", description: "Complete the ER diagram and normalization exercises up to 3NF. Include SQL queries for all CRUD operations with test data.", dueDate: todayStr(), dueTime: "17:00", priority: "High", completed: false, revision: "Not started", notes: "Revise normalization rules before 3 pm." },
  { id: "3", taskName: "Chapter 5–7 Quiz", subject: "Mathematics", taskType: "Quiz", description: "Covers integration techniques, differential equations, and power series expansion. Review textbook examples.", dueDate: offsetDate(1), dueTime: "09:00", priority: "Medium", completed: false, revision: "Reviewing", notes: "Practice integration methods and revisit standard forms." },
  { id: "4", taskName: "Pendulum Lab Report", subject: "Physics", taskType: "Assignment", description: "Write up the simple pendulum experiment with data tables, graphs, error analysis, and discussion of results.", dueDate: offsetDate(3), dueTime: "23:59", priority: "Low", completed: false, revision: "Not started", notes: "Upload final experiment image when ready." },
  { id: "5", taskName: "Midterm Examination", subject: "Data Structures", taskType: "Exam", description: "Covers arrays, linked lists, trees, graphs, sorting algorithms (merge, quick, heap), and Big-O analysis. Open-note policy.", dueDate: offsetDate(5), dueTime: "10:00", priority: "High", completed: false, revision: "Reviewing", notes: "Review trees, graph traversal, and complexity comparisons." },
  { id: "6", taskName: "AI in Healthcare Talk", subject: "Technical Writing", taskType: "Presentation", description: "10-minute slide presentation on AI diagnostics in modern hospitals. Include a printed one-page handout for each classmate.", dueDate: offsetDate(7), dueTime: "13:00", priority: "Medium", completed: false, revision: "Not started", notes: "Prepare intro slide and healthcare case studies." },
  { id: "7", taskName: "Boolean Algebra HW", subject: "Discrete Mathematics", taskType: "Assignment", description: "Logic gates and Boolean algebra problems from Chapter 3, exercises 3.1–3.5.", dueDate: offsetDate(-2), dueTime: "23:59", priority: "Medium", completed: true, completedAt: new Date(Date.now() - 172800000).toISOString(), revision: "Reviewed", notes: "Completed and reviewed final answers." },
  { id: "8", taskName: "Sprint Retrospective", subject: "Software Engineering", taskType: "Other", description: "Prepare retrospective notes for Agile sprint 4. Document what went well, blockers, and action items.", dueDate: offsetDate(2), dueTime: "14:00", priority: "Low", completed: false, revision: "Not started", notes: "Summarize blockers and improvements for the sprint." },
];

// ─── Design Tokens ────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<Priority, string> = { High: "#ef4444", Medium: "#f97316", Low: "#22c55e" };
const PRIORITY_BG: Record<Priority, string> = { High: "rgba(239,68,68,0.13)", Medium: "rgba(249,115,22,0.13)", Low: "rgba(34,197,94,0.13)" };
const TYPE_ICON: Record<TaskType, string> = { Assignment: "📝", Project: "🗂️", Quiz: "❓", Exam: "📋", Presentation: "🎤", Other: "📌" };
const TYPE_COLOR: Record<TaskType, string> = { Assignment: "#3b82f6", Project: "#8b5cf6", Quiz: "#f97316", Exam: "#ef4444", Presentation: "#22c55e", Other: "#6b7280" };
const REVISION_STYLES: Record<RevisionStatus, { bg: string; color: string }> = {
  "Not started": { bg: "rgba(148,163,184,0.12)", color: "#64748b" },
  Reviewing: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
  Reviewed: { bg: "rgba(34,197,94,0.12)", color: "#15803d" },
};
const THEME_PRESETS: Record<ThemeMode, { shell: string; surface: string; panel: string; strong: string; muted: string }> = {
  Light: { shell: "linear-gradient(145deg, #b8ccec 0%, #c5daf5 30%, #cccaf0 65%, #d0c8f0 100%)", surface: "linear-gradient(150deg, #eaf4ff 0%, #ddeeff 12%, #e2e6ff 36%, #ede6ff 62%, #eaedff 82%, #dcf6ff 100%)", panel: "rgba(255,255,255,0.38)", strong: "rgba(18,36,80,0.95)", muted: "rgba(60,90,160,0.55)" },
  Dark: { shell: "linear-gradient(145deg, #101827 0%, #1e293b 35%, #0f172a 100%)", surface: "linear-gradient(150deg, #111827 0%, #172033 18%, #0f172a 52%, #111827 100%)", panel: "rgba(15,23,42,0.72)", strong: "#f8fafc", muted: "#9db0ca" },
  Ocean: { shell: "linear-gradient(145deg, #082f49 0%, #0f766e 35%, #0f172a 100%)", surface: "linear-gradient(150deg, #083344 0%, #0f766e 30%, #0f172a 60%, #111827 100%)", panel: "rgba(15,23,42,0.7)", strong: "#e0f2fe", muted: "#a5f3fc" },
  Sunset: { shell: "linear-gradient(145deg, #431407 0%, #7c2d12 28%, #312e81 100%)", surface: "linear-gradient(150deg, #3f2b17 0%, #7c2d12 28%, #7c3aed 62%, #111827 100%)", panel: "rgba(33,18,42,0.7)", strong: "#fef3c7", muted: "#f9a8d4" },
};
const isDarkTheme = (theme: ThemeMode) => theme !== "Light";
const STORAGE_KEYS = { deadlines: "duedash.deadlines", theme: "duedash.theme" };

// ─── Shared Styles ────────────────────────────────────────────────────────────

const S = {
  glass: { background: "rgba(255,255,255,0.26)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.42)", boxShadow: "0 4px 20px rgba(80,120,200,0.1), inset 0 1px 0 rgba(255,255,255,0.55)" } as React.CSSProperties,
  glassCard: { background: "rgba(255,255,255,0.38)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.55)", boxShadow: "0 4px 24px rgba(80,120,200,0.1), inset 0 1px 0 rgba(255,255,255,0.7)" } as React.CSSProperties,
  glassNav: { background: "rgba(255,255,255,0.3)", backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)", border: "1px solid rgba(255,255,255,0.5)", boxShadow: "0 -2px 24px rgba(80,120,200,0.12), 0 2px 12px rgba(80,120,200,0.06)" } as React.CSSProperties,
  label: { fontFamily: "Inter,sans-serif", fontSize: 11, fontWeight: 600, color: "rgba(40,70,140,0.65)", letterSpacing: 0.6, display: "block", marginBottom: 6, textTransform: "uppercase" } as React.CSSProperties,
  h1: { fontFamily: "Poppins,sans-serif", fontWeight: 800, fontSize: 28, color: "rgba(18,36,80,0.95)", margin: 0 } as React.CSSProperties,
  h2: { fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 22, color: "rgba(18,36,80,0.95)", margin: 0 } as React.CSSProperties,
  h3: { fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 16, color: "rgba(18,36,80,0.9)", margin: 0 } as React.CSSProperties,
  body: { fontFamily: "Inter,sans-serif", fontSize: 14, color: "rgba(40,70,140,0.75)", lineHeight: 1.55 } as React.CSSProperties,
  caption: { fontFamily: "Inter,sans-serif", fontSize: 12, color: "rgba(60,90,160,0.55)" } as React.CSSProperties,
  primaryBtn: { width: "100%", padding: "16px", background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", borderRadius: 22, border: "none", fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 16, color: "#fff", cursor: "pointer", boxShadow: "0 6px 20px rgba(59,130,246,0.32)", transition: "opacity 0.15s, transform 0.15s", letterSpacing: 0.1 } as React.CSSProperties,
  ghostBtn: { width: "100%", padding: "14px", background: "rgba(59,130,246,0.07)", borderRadius: 22, border: "1.5px solid rgba(59,130,246,0.22)", fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 15, color: "#3b82f6", cursor: "pointer", transition: "background 0.15s" } as React.CSSProperties,
  iconBtn: { width: 44, height: 44, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", flexShrink: 0, transition: "opacity 0.15s, transform 0.15s" } as React.CSSProperties,
  input: { width: "100%", padding: "14px 16px", background: "transparent", border: "none", fontFamily: "Inter,sans-serif", fontSize: 15, color: "rgba(18,36,80,0.9)", boxSizing: "border-box" } as React.CSSProperties,
  sectionTitle: { fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 16, color: "rgba(18,36,80,0.88)", margin: "0 0 12px" } as React.CSSProperties,
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const Ico = {
  home: (active: boolean) => <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#3b82f6" : "none"} stroke={active ? "#3b82f6" : "rgba(80,105,150,0.65)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  tasks: (active: boolean) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "rgba(80,105,150,0.65)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  calendar: (active: boolean) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "rgba(80,105,150,0.65)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  bell: (active: boolean, dot?: boolean) => <div style={{ position: "relative", display: "inline-flex" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "rgba(80,105,150,0.65)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>{dot && <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, background: "#ef4444", borderRadius: "50%", border: "2px solid white" }} />}</div>,
  profile: (active: boolean) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "rgba(80,105,150,0.65)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  back: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>,
  search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(80,105,150,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>,
  plus: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  check: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  checkLg: () => <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  chevRight: (color = "rgba(100,130,190,0.45)") => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>,
  edit: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
  trash: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>,
  settings: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(80,105,150,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2" /></svg>,
  eye: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(80,105,150,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(80,105,150,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>,
};

// ─── Layout Shell ─────────────────────────────────────────────────────────────

function PhoneFrame({ children, theme }: { children: React.ReactNode; theme: ThemeMode }) {
  const preset = THEME_PRESETS[theme];
  const isDark = isDarkTheme(theme);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: preset.shell, padding: 16, boxSizing: "border-box" }}>
      <div style={{ width: 393, minHeight: 852, maxHeight: "calc(100vh - 32px)", borderRadius: 52, overflow: "hidden", boxShadow: isDark ? "0 48px 120px rgba(2,6,23,0.6), 0 0 0 10px rgba(148,163,184,0.08), 0 0 0 11px rgba(30,41,59,0.2)" : "0 48px 120px rgba(40,60,120,0.38), 0 0 0 10px rgba(255,255,255,0.18), 0 0 0 11px rgba(180,200,255,0.28)", position: "relative", background: preset.surface, display: "flex", flexDirection: "column", flex: "none" }}>
        {children}
      </div>
    </div>
  );
}

function StatusBar({ theme }: { theme: ThemeMode }) {
  const [time, setTime] = useState(() => {
    const n = new Date(); return `${n.getHours() % 12 || 12}:${n.getMinutes().toString().padStart(2, "0")}`;
  });
  useEffect(() => {
    const t = setInterval(() => { const n = new Date(); setTime(`${n.getHours() % 12 || 12}:${n.getMinutes().toString().padStart(2, "0")}`); }, 15000);
    return () => clearInterval(t);
  }, []);

  const isDark = isDarkTheme(theme);
  const preset = THEME_PRESETS[theme];
  const statusColor = isDark ? preset.strong : "rgba(20,45,100,0.85)";

  return (
    <div style={{ height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", flexShrink: 0, paddingTop: 6 }}>
      <span style={{ fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 15, color: statusColor }}>{time}</span>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {/* Signal */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill={isDark ? "rgba(226,232,240,0.8)" : "rgba(20,45,100,0.7)"}>
          <rect x="0" y="8" width="3" height="4" rx="1" /><rect x="4.5" y="5.5" width="3" height="6.5" rx="1" /><rect x="9" y="2.5" width="3" height="9.5" rx="1" /><rect x="13.5" y="0" width="3" height="12" rx="1" />
        </svg>
        {/* Wifi */}
        <svg width="17" height="13" viewBox="0 0 17 13" fill={isDark ? "rgba(226,232,240,0.8)" : "rgba(20,45,100,0.7)"}>
          <path d="M8.5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
          <path d="M8.5 7C10.3 7 11.9 7.7 13.1 8.9L14.2 7.8C12.7 6.3 10.7 5.4 8.5 5.4S4.3 6.3 2.8 7.8l1.1 1.1C5.1 7.7 6.7 7 8.5 7z" />
          <path d="M8.5 3.8C11.4 3.8 14 4.9 15.9 6.8L17 5.7C14.8 3.5 11.8 2.2 8.5 2.2S2.2 3.5 0 5.7l1.1 1.1C3 4.9 5.6 3.8 8.5 3.8z" />
        </svg>
        {/* Battery */}
        <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
          <div style={{ width: 26, height: 13, border: `1.5px solid ${isDark ? "rgba(226,232,240,0.7)" : "rgba(20,45,100,0.65)"}`, borderRadius: 3.5, padding: "2px", display: "flex", alignItems: "center" }}>
            <div style={{ width: "82%", height: "100%", background: isDark ? "rgba(226,232,240,0.8)" : "rgba(20,45,100,0.7)", borderRadius: 1.5 }} />
          </div>
          <div style={{ width: 2, height: 6, background: isDark ? "rgba(226,232,240,0.7)" : "rgba(20,45,100,0.55)", borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

function BottomNav({ active, onNav, theme }: { active: Screen; onNav: (s: Screen) => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const items: { id: Screen; label: string; icon: () => React.ReactNode }[] = [
    { id: "dashboard", label: "Home", icon: () => Ico.home(active === "dashboard") },
    { id: "deadlines", label: "Tasks", icon: () => Ico.tasks(active === "deadlines") },
    { id: "calendar", label: "Calendar", icon: () => Ico.calendar(active === "calendar") },
    { id: "notifications", label: "Alerts", icon: () => Ico.bell(active === "notifications", true) },
    { id: "profile", label: "Profile", icon: () => Ico.profile(active === "profile") },
  ];
  return (
    <div style={{ padding: "6px 14px 14px", flexShrink: 0 }}>
      <div style={{ ...S.glassNav, background: isDark ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.3)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(255,255,255,0.5)", borderRadius: 30, padding: "10px 6px", display: "flex", justifyContent: "space-around" }}>
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => onNav(item.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 12px", minWidth: 44, minHeight: 44, justifyContent: "center", borderRadius: 20, background: isActive ? (isDark ? "rgba(96,165,250,0.17)" : "rgba(59,130,246,0.13)") : "transparent", border: "none", cursor: "pointer", transition: "background 0.2s" }}>
              {item.icon()}
              <span style={{ fontFamily: "Inter,sans-serif", fontSize: 10, fontWeight: isActive ? 700 : 400, color: isActive ? "#60a5fa" : isDark ? "rgba(203,213,225,0.8)" : "rgba(80,105,150,0.65)", letterSpacing: 0.1 }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackBtn({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
      <button onClick={onPress} style={{ ...S.iconBtn, ...S.glass, background: "rgba(255,255,255,0.42)" }}>
        {Ico.back()}
      </button>
      {label && <h2 style={S.h2}>{label}</h2>}
    </div>
  );
}

function SectionHeader({ title, action, theme }: { title: string; action?: React.ReactNode; theme?: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <p style={{ ...S.sectionTitle, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)" }}>{title}</p>
      {action}
    </div>
  );
}

function AddBtn({ onPress }: { onPress: () => void }) {
  return (
    <button onClick={onPress} style={{ width: 36, height: 36, borderRadius: 13, background: "linear-gradient(135deg,#3b82f6,#6366f1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(59,130,246,0.35)", transition: "transform 0.15s, opacity 0.15s" }}>
      {Ico.plus()}
    </button>
  );
}

// ─── Priority & Type Pills ────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span style={{ fontFamily: "Inter,sans-serif", fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[priority], background: PRIORITY_BG[priority], padding: "3px 9px", borderRadius: 9, letterSpacing: 0.2, flexShrink: 0 }}>{priority}</span>;
}

function TypeBadge({ taskType }: { taskType: TaskType }) {
  return <span style={{ fontFamily: "Inter,sans-serif", fontSize: 11, fontWeight: 600, color: TYPE_COLOR[taskType], background: `${TYPE_COLOR[taskType]}18`, padding: "3px 9px", borderRadius: 9 }}>{TYPE_ICON[taskType]} {taskType}</span>;
}

// ─── Deadline Card ────────────────────────────────────────────────────────────

function DeadlineCard({ d, onPress, theme }: { d: Deadline; onPress: () => void; theme?: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const countdown = d.completed ? null : getCountdown(d.dueDate, d.dueTime);
  const countdownColor = countdown === "Overdue" ? "#ef4444" : countdown && (countdown.includes("m") && !countdown.includes("d")) ? "#f97316" : "#3b82f6";

  return (
    <button onClick={onPress} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", marginBottom: 10, display: "block" }}>
      <div style={{ ...S.glassCard, borderRadius: 22, padding: "14px 16px", borderLeft: `3.5px solid ${d.completed ? "#22c55e" : PRIORITY_COLOR[d.priority]}`, opacity: d.completed ? 0.75 : 1, transition: "opacity 0.2s", background: isDark ? "rgba(15,23,42,0.72)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
              <span style={{ fontSize: 13 }}>{TYPE_ICON[d.taskType]}</span>
              <span style={{ fontFamily: "Inter,sans-serif", fontSize: 10, fontWeight: 700, color: isDark ? "#9db0ca" : "rgba(60,90,160,0.6)", letterSpacing: 0.6, textTransform: "uppercase" as const }}>{d.subject}</span>
            </div>
            <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 15, color: isDark ? "#f8fafc" : "rgba(18,36,80,0.92)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.taskName}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
            <PriorityBadge priority={d.priority} />
            {d.completed && <span style={{ fontFamily: "Inter,sans-serif", fontSize: 10, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", padding: "2px 7px", borderRadius: 8 }}>✓ Done</span>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...S.caption, color: isDark ? "#b5c2d9" : undefined }}>{formatDate(d.dueDate)} · {formatTime(d.dueTime)}</span>
          {countdown && <span style={{ fontFamily: "Inter,sans-serif", fontSize: 12, fontWeight: 700, color: countdownColor }}>{countdown}</span>}
        </div>
      </div>
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ emoji, title, body, theme }: { emoji: string; title: string; body: string; theme?: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  return (
    <div style={{ ...S.glassCard, borderRadius: 24, padding: "36px 24px", textAlign: "center", background: isDark ? "rgba(15,23,42,0.7)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>{emoji}</div>
      <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 16, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.7)", margin: "0 0 6px" }}>{title}</p>
      <p style={{ ...S.caption, margin: 0, color: isDark ? "#b5c2d9" : undefined }}>{body}</p>
    </div>
  );
}

// ─── Form Field ───────────────────────────────────────────────────────────────

function Field({ label, error, children, theme }: { label: string; error?: string; children: React.ReactNode; theme?: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  return (
    <div>
      <label style={{ ...S.label, color: isDark ? "#bfd0ea" : undefined }}>{label}</label>
      {children}
      {error && <p style={{ fontFamily: "Inter,sans-serif", fontSize: 12, color: "#ef4444", margin: "5px 0 0 4px", display: "flex", alignItems: "center", gap: 4 }}><span>⚠</span>{error}</p>}
    </div>
  );
}

function GlassInput({ value, onChange, placeholder, type = "text", theme }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; theme?: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  return (
    <div style={{ ...S.glass, borderRadius: 17, overflow: "hidden", background: isDark ? "rgba(15,23,42,0.68)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...S.input, color: isDark ? "#e2e8f0" : undefined, "::placeholder": { color: isDark ? "rgba(148,163,184,0.7)" : "rgba(80,110,180,0.35)" } } as React.CSSProperties} />
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ ...S.glassCard, borderRadius: 22, padding: "16px", marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ height: 10, borderRadius: 6, background: "rgba(100,140,220,0.18)", marginBottom: 10, width: "40%" }} className="shimmer" />
          <div style={{ height: 14, borderRadius: 6, background: "rgba(100,140,220,0.18)", marginBottom: 8 }} className="shimmer" />
          <div style={{ height: 10, borderRadius: 6, background: "rgba(100,140,220,0.18)", width: "60%" }} className="shimmer" />
        </div>
        <div style={{ width: 50, height: 22, borderRadius: 8, background: "rgba(100,140,220,0.18)" }} className="shimmer" />
      </div>
    </div>
  );
}

// ─── SCREEN: Login ────────────────────────────────────────────────────────────

function LoginScreen({ onLogin, theme }: { onLogin: () => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = "Email or Student ID is required.";
    else if (!email.includes("@") && email.length < 5) e.email = "Please enter a valid email or student ID.";
    if (!password) e.password = "Password is required.";
    else if (password.length < 4) e.password = "Password must be at least 4 characters.";
    return e;
  };

  const submit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, 1400);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 24px" }} className="anim-fade">
      {/* Logo */}
      <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 28 }}>
        <div style={{ ...S.glassCard, width: 84, height: 84, borderRadius: 26, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", background: "linear-gradient(135deg, rgba(59,130,246,0.28), rgba(147,51,234,0.18))" }}>
          <span style={{ fontSize: 38 }}>📚</span>
        </div>
        <h1 style={{ ...S.h1, fontSize: 32, letterSpacing: -0.6, marginBottom: 4 }}>DueDash</h1>
        <p style={{ fontFamily: "Inter,sans-serif", fontSize: 12, color: "rgba(60,90,180,0.5)", letterSpacing: 1.2, textTransform: "uppercase", margin: 0 }}>Student Productivity</p>
      </div>

      <div style={{ ...S.glassCard, borderRadius: 30, padding: "26px 22px", background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.38)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(255,255,255,0.55)" }}>
        <h2 style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 23, color: isDark ? "#f8fafc" : "rgba(18,36,80,0.95)", margin: "0 0 4px" }}>Welcome Back! 👋</h2>
        <p style={{ ...S.body, margin: "0 0 22px", fontSize: 13, color: isDark ? "#cbd5e1" : "rgba(40,70,140,0.75)" }}>Stay ahead of every deadline.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Student ID / Email" error={errors.email} theme={theme}>
            <GlassInput theme={theme} value={email} onChange={(v) => { setEmail(v); setErrors((x) => ({ ...x, email: undefined })); }} placeholder="student@university.edu" />
          </Field>

          <Field label="Password" error={errors.password} theme={theme}>
            <div style={{ ...S.glass, borderRadius: 17, display: "flex", alignItems: "center", overflow: "hidden", background: isDark ? "rgba(15,23,42,0.68)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
              <input type={showPw ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }} placeholder="••••••••" style={{ ...S.input, flex: 1, color: isDark ? "#e2e8f0" : undefined }} />
              <button onClick={() => setShowPw((v) => !v)} style={{ background: "none", border: "none", padding: "0 14px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                {showPw ? Ico.eyeOff() : Ico.eye()}
              </button>
            </div>
          </Field>
        </div>

        <div style={{ textAlign: "right", margin: "10px 0 22px" }}>
          <button style={{ background: "none", border: "none", fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 600, color: "#3b82f6", cursor: "pointer" }}>Forgot Password?</button>
        </div>

        <button onClick={submit} disabled={loading} style={{ ...S.primaryBtn, opacity: loading ? 0.6 : 1 }}>
          {loading ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
              Signing In...
            </span>
          ) : "Log In"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(100,140,220,0.18)" }} />
          <span style={{ ...S.caption, fontSize: 11 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "rgba(100,140,220,0.18)" }} />
        </div>

        <button onClick={onLogin} style={S.ghostBtn}>Continue as Timothy</button>
      </div>

      <p style={{ textAlign: "center", ...S.caption, marginTop: 20, fontSize: 12 }}>
        Don't have an account?{" "}
        <button style={{ background: "none", border: "none", color: "#3b82f6", fontFamily: "Inter,sans-serif", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Sign Up</button>
      </p>
    </div>
  );
}

function PomodoroCard({ theme }: { theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("Focus Sprint");

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          setIsRunning(false);
          setSessionLabel("Break time");
          return 5 * 60;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");

  return (
    <div style={{ ...S.glassCard, borderRadius: 24, padding: 16, marginBottom: 18, background: isDark ? "rgba(15,23,42,0.7)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <p style={{ ...S.caption, margin: 0, color: isDark ? "#b5c2d9" : undefined }}>Study Focus</p>
          <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 17, margin: "4px 0 0", color: isDark ? "#f8fafc" : "rgba(18,36,80,0.92)" }}>{sessionLabel}</p>
        </div>
        <div style={{ fontFamily: "Poppins,sans-serif", fontWeight: 800, fontSize: 18, color: "#3b82f6" }}>{minutes}:{seconds}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setIsRunning((v) => !v)} style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff", fontFamily: "Inter,sans-serif", fontWeight: 700, cursor: "pointer" }}>{isRunning ? "Pause" : "Start"}</button>
        <button onClick={() => { setIsRunning(false); setSecondsLeft(25 * 60); setSessionLabel("Focus Sprint"); }} style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(100,140,220,0.2)", background: isDark ? "rgba(15,23,42,0.5)" : "rgba(255,255,255,0.2)", color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.8)", fontFamily: "Inter,sans-serif", fontWeight: 700, cursor: "pointer" }}>Reset</button>
      </div>
    </div>
  );
}

// ─── SCREEN: Dashboard ────────────────────────────────────────────────────────

function DashboardScreen({ deadlines, onNav, onDeadline, onAdd, theme }: { deadlines: Deadline[]; onNav: (s: Screen) => void; onDeadline: (d: Deadline) => void; onAdd: () => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const [loading] = useState(false);
  const todayItems = deadlines.filter((d) => !d.completed && isToday(d.dueDate));
  const weekItems = deadlines.filter((d) => !d.completed && isThisWeek(d.dueDate));
  const completedItems = deadlines.filter((d) => d.completed);
  const streak = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return deadlines.some((d) => d.completed && d.completedAt && new Date(d.completedAt).toDateString() === date.toDateString());
  }).filter(Boolean).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";

  const stats = [
    { label: "Due Today", value: todayItems.length, color: "#ef4444", bg: "rgba(239,68,68,0.09)", emoji: "🔥" },
    { label: "This Week", value: weekItems.length, color: "#f97316", bg: "rgba(249,115,22,0.09)", emoji: "📅" },
    { label: "Completed", value: completedItems.length, color: "#22c55e", bg: "rgba(34,197,94,0.09)", emoji: "✅" },
    { label: "Total Tasks", value: deadlines.length, color: "#3b82f6", bg: "rgba(59,130,246,0.09)", emoji: "📚" },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 8px" }} className="anim-slide">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <p style={{ ...S.caption, margin: 0, fontSize: 13, color: isDark ? "#94a3b8" : "rgba(60,90,160,0.55)" }}>{greeting},</p>
          <h2 style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 22, color: isDark ? "#f8fafc" : "rgba(18,36,80,0.95)", margin: "1px 0 0" }}>Timothy 👋</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onNav("notifications")} style={{ ...S.iconBtn, ...S.glass, background: isDark ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.4)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
            {Ico.bell(false, true)}
          </button>
          <div style={{ width: 44, height: 44, borderRadius: 15, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 17, color: "#fff", boxShadow: "0 4px 14px rgba(59,130,246,0.3)", flexShrink: 0 }}>A</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ ...S.glassCard, borderRadius: 22, padding: "14px 15px", background: isDark ? "rgba(15,23,42,0.72)" : s.bg, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 20 }}>{s.emoji}</span>
              <span style={{ fontFamily: "Poppins,sans-serif", fontWeight: 800, fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</span>
            </div>
            <p style={{ fontFamily: "Inter,sans-serif", fontSize: 12, fontWeight: 600, color: isDark ? "#cbd5e1" : "rgba(60,90,160,0.7)", margin: "8px 0 0" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div style={{ ...S.glassCard, borderRadius: 22, padding: "12px 14px", marginBottom: 18, background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.15)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ ...S.caption, margin: 0 }}>Weekly streak</p>
            <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 800, fontSize: 17, margin: "4px 0 0", color: isDark ? "#f8fafc" : "rgba(18,36,80,0.9)" }}>{streak} day{streak === 1 ? "" : "s"}</p>
          </div>
          <span style={{ fontSize: 26 }}>🔥</span>
        </div>
      </div>

      <PomodoroCard theme={theme} />

      <div style={{ ...S.glassCard, borderRadius: 24, padding: 16, marginBottom: 18, background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.22)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <p style={{ ...S.caption, margin: 0, color: isDark ? "#b5c2d9" : undefined }}>Quiz & Exam Review</p>
            <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 18, margin: "4px 0 0", color: isDark ? "#f8fafc" : "rgba(18,36,80,0.92)" }}>Smart Reviewer</p>
          </div>
          <span style={{ fontSize: 28 }}>🧠</span>
        </div>
        <p style={{ ...S.body, margin: "0 0 12px", color: isDark ? "#cae0ff" : "rgba(40,70,140,0.75)", fontSize: 12 }}>Upload a PDF, notes, or study sheet and generate quick review questions.</p>
        <button onClick={() => onNav("reviewer")} style={{ ...S.primaryBtn, padding: "12px 14px", fontSize: 14 }}>Open Reviewer</button>
      </div>

      {/* Today's Priorities */}
      <SectionHeader title="Today's Priorities" action={<AddBtn onPress={onAdd} />} theme={theme} />
      {loading ? (
        <><SkeletonCard /><SkeletonCard /></>
      ) : todayItems.length === 0 ? (
        <EmptyState emoji="🎉" title="You're All Caught Up!" body="No deadlines due today. Keep it up!" theme={theme} />
      ) : (
        todayItems.map((d) => <DeadlineCard key={d.id} d={d} onPress={() => onDeadline(d)} theme={theme} />)
      )}

      {/* Upcoming */}
      {weekItems.filter((d) => !isToday(d.dueDate)).length > 0 && (
        <>
          <div style={{ height: 16 }} />
          <SectionHeader title="Upcoming This Week" theme={theme} />
          {weekItems.filter((d) => !isToday(d.dueDate)).slice(0, 3).map((d) => (
            <DeadlineCard key={d.id} d={d} onPress={() => onDeadline(d)} theme={theme} />
          ))}
        </>
      )}

      <div style={{ height: 12 }} />
      <button onClick={() => onNav("deadlines")} style={S.ghostBtn}>View All Deadlines →</button>
      <div style={{ height: 8 }} />
    </div>
  );
}

// ─── SCREEN: Deadlines ────────────────────────────────────────────────────────

function ReviewerScreen({ onBack, theme }: { onBack: () => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("No file uploaded yet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<ReviewData | null>(null);

  const generateFromFile = async (file: File) => {
    setLoading(true);
    setError("");

    try {
      let text = "";

      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        text = await readPdfText(file);
      } else if (file.type.startsWith("text/") || [".txt", ".md", ".csv", ".json"].some((ext) => file.name.toLowerCase().endsWith(ext))) {
        text = await file.text();
      } else if (file.type.startsWith("image/")) {
        setReview({
          fileName: file.name,
          summary: ["Image uploaded. For automatic question generation, use a PDF or text-based study file for best results."],
          keywords: ["concept", "important idea", "example"],
          questions: [{ question: "What is the main topic shown in this image?", answer: "Describe the main idea, core diagram, or formula in your own words." }],
        });
        setFileName(file.name);
        setLoading(false);
        return;
      } else {
        throw new Error("Unsupported file type. Please upload a PDF, TXT, MD, CSV, JSON, or image file.");
      }

      if (!text.trim()) {
        throw new Error("This file did not contain readable text. Please try a different study sheet or PDF.");
      }

      const nextReview = buildReviewData(file.name, text);
      setFileName(file.name);
      setReview(nextReview);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The reviewer could not process this file.";
      setError(message);
      setReview(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }} className="anim-slide">
      <BackBtn onPress={onBack} label="Exam Reviewer" />

      <div style={{ ...S.glassCard, borderRadius: 24, padding: 18, marginBottom: 18, background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.2)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
        <p style={{ ...S.caption, margin: 0, color: isDark ? "#b5c2d9" : undefined }}>Upload your study file</p>
        <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 20, margin: "6px 0 12px", color: isDark ? "#f8fafc" : "rgba(18,36,80,0.92)" }}>Auto-generate quiz review</p>

        <button onClick={() => fileInputRef.current?.click()} style={{ ...S.primaryBtn, padding: "14px 16px", fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? "Reviewing file..." : "Upload PDF or notes"}
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.csv,.json,image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) generateFromFile(file); }} style={{ display: "none" }} />

        <p style={{ ...S.caption, margin: "12px 0 0", color: isDark ? "#a7b9d6" : "rgba(60,90,160,0.62)" }}>{fileName}</p>
        {error && <p style={{ marginTop: 12, color: "#ef4444", fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 12 }}>{error}</p>}
      </div>

      {review && (
        <>
          <div style={{ ...S.glassCard, borderRadius: 24, padding: 18, marginBottom: 18, background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.2)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
            <p style={{ ...S.sectionTitle, marginBottom: 10, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)" }}>Quick summary</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
              {review.summary.map((item) => (
                <li key={item} style={{ color: isDark ? "#dfeaf9" : "rgba(18,36,80,0.82)", fontFamily: "Inter,sans-serif", fontSize: 13, lineHeight: 1.6 }}>{item}</li>
              ))}
            </ul>
          </div>

          <div style={{ ...S.glassCard, borderRadius: 24, padding: 18, marginBottom: 18, background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.2)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
            <p style={{ ...S.sectionTitle, marginBottom: 10, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)" }}>Key topics</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {review.keywords.map((item) => (
                <span key={item} style={{ padding: "7px 10px", borderRadius: 999, background: isDark ? "rgba(96,165,250,0.14)" : "rgba(59,130,246,0.09)", color: isDark ? "#dfeaf9" : "rgba(18,36,80,0.8)", fontFamily: "Inter,sans-serif", fontSize: 12, fontWeight: 700 }}>{item}</span>
              ))}
            </div>
          </div>

          <div style={{ ...S.glassCard, borderRadius: 24, padding: 18, marginBottom: 18, background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.2)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
            <p style={{ ...S.sectionTitle, marginBottom: 12, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)" }}>Practice review</p>
            <div style={{ display: "grid", gap: 12 }}>
              {review.questions.map((item, index) => (
                <div key={`${item.question}-${index}`} style={{ background: isDark ? "rgba(30,41,59,0.7)" : "rgba(255,255,255,0.28)", borderRadius: 16, padding: 12, border: isDark ? "1px solid rgba(148,163,184,0.12)" : "1px solid rgba(100,140,220,0.12)" }}>
                  <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 14, margin: "0 0 8px", color: isDark ? "#f8fafc" : "rgba(18,36,80,0.92)" }}>{item.question}</p>
                  <p style={{ margin: 0, fontFamily: "Inter,sans-serif", fontSize: 12.5, lineHeight: 1.6, color: isDark ? "#dfeaf9" : "rgba(18,36,80,0.8)" }}>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DeadlinesScreen({ deadlines, onDeadline, onAdd, theme }: { deadlines: Deadline[]; onDeadline: (d: Deadline) => void; onAdd: () => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("All");

  const filtered = deadlines.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.taskName.toLowerCase().includes(q) || d.subject.toLowerCase().includes(q) || d.taskType.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filter === "Today") return isToday(d.dueDate) && !d.completed;
    if (filter === "This Week") return isThisWeek(d.dueDate) && !d.completed;
    if (filter === "Completed") return d.completed;
    return true;
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 8px" }} className="anim-slide">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ ...S.h2, color: isDark ? "#f8fafc" : undefined }}>My Deadlines</h2>
        <AddBtn onPress={onAdd} />
      </div>

      {/* Search */}
      <div style={{ ...S.glass, borderRadius: 17, display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", marginBottom: 12, background: isDark ? "rgba(15,23,42,0.68)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
        {Ico.search()}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks, subjects..." style={{ flex: 1, background: "transparent", border: "none", fontFamily: "Inter,sans-serif", fontSize: 14, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)", padding: 0 }} />
        {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(80,110,180,0.5)", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 7, marginBottom: 18, paddingBottom: 2, overflowX: "auto" }}>
        {(["All", "Today", "This Week", "Completed"] as FilterType[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ flexShrink: 0, padding: "8px 15px", borderRadius: 22, border: filter === f ? "none" : isDark ? "1px solid rgba(148,163,184,0.2)" : "1px solid rgba(100,140,220,0.22)", background: filter === f ? "linear-gradient(135deg,#3b82f6,#6366f1)" : isDark ? "rgba(15,23,42,0.6)" : "rgba(255,255,255,0.3)", fontFamily: "Inter,sans-serif", fontSize: 12, fontWeight: filter === f ? 700 : 400, color: filter === f ? "#fff" : isDark ? "#cbd5e1" : "rgba(60,90,160,0.7)", cursor: "pointer", transition: "all 0.2s", boxShadow: filter === f ? "0 4px 12px rgba(59,130,246,0.3)" : "none" }}>
            {f}
          </button>
        ))}
      </div>

      {/* Count */}
      <p style={{ ...S.caption, marginBottom: 10, fontSize: 11, letterSpacing: 0.3 }}>{filtered.length} {filtered.length === 1 ? "task" : "tasks"}{filter !== "All" ? ` · ${filter}` : ""}</p>

      {filtered.length === 0 ? (
        search
          ? <EmptyState emoji="🔍" title="No Results Found" body={`No tasks match "${search}"`} theme={theme} />
          : filter === "Completed"
          ? <EmptyState emoji="🌟" title="Nothing Completed Yet" body="Complete a deadline and it will appear here" theme={theme} />
          : <EmptyState emoji="📭" title="No Deadlines Yet" body="Tap + to add your first deadline" theme={theme} />
      ) : (
        filtered.map((d) => <DeadlineCard key={d.id} d={d} onPress={() => onDeadline(d)} theme={theme} />)
      )}
    </div>
  );
}

// ─── SCREEN: Add / Edit Deadline ──────────────────────────────────────────────

interface DeadlineFormProps {
  initial?: Deadline;
  onSave: (data: Omit<Deadline, "id" | "completed" | "completedAt">) => void;
  onBack: () => void;
  title: string;
}

function DeadlineFormScreen({ initial, onSave, onBack, title, theme }: DeadlineFormProps & { theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const [form, setForm] = useState({
    taskName: initial?.taskName ?? "",
    subject: initial?.subject ?? "",
    taskType: (initial?.taskType ?? "Assignment") as TaskType,
    description: initial?.description ?? "",
    dueDate: initial?.dueDate ?? todayStr(),
    dueTime: initial?.dueTime ?? "23:59",
    priority: (initial?.priority ?? "Medium") as Priority,
    revision: (initial?.revision ?? "Not started") as RevisionStatus,
    notes: initial?.notes ?? "",
    attachmentName: initial?.attachmentName ?? "",
    attachmentDataUrl: initial?.attachmentDataUrl ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});

  const handleAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, attachmentName: file.name, attachmentDataUrl: String(reader.result ?? "") }));
    };
    reader.readAsDataURL(file);
  };

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.taskName.trim()) e.taskName = "Task name is required.";
    if (!form.subject.trim()) e.subject = "Please enter a subject.";
    if (!form.dueDate) e.dueDate = "Please enter a valid date.";
    return e;
  };

  const submit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }} className="anim-slide">
      <BackBtn onPress={onBack} label={title} />

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Task Name" error={errors.taskName} theme={theme}>
          <div style={{ borderRadius: 14, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)", boxShadow: isDark ? "inset 0 1px 0 rgba(148,163,184,0.04)" : "none", overflow: "hidden" }}>
            <input value={form.taskName} onChange={(e) => set("taskName", e.target.value)} placeholder="e.g. Final Project" style={{ ...S.input, color: isDark ? "#e2e8f0" : undefined, padding: "14px 16px", fontSize: 15 }} />
          </div>
        </Field>

        <Field label="Subject" error={errors.subject} theme={theme}>
          <div style={{ borderRadius: 14, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)", boxShadow: isDark ? "inset 0 1px 0 rgba(148,163,184,0.04)" : "none", overflow: "hidden" }}>
            <input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Database Management" style={{ ...S.input, color: isDark ? "#e2e8f0" : undefined, padding: "14px 16px", fontSize: 15 }} />
          </div>
        </Field>

        <Field label="Task Type" theme={theme}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 8px", borderRadius: 16, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)" }}>
            {(["Assignment", "Project", "Quiz", "Exam", "Presentation", "Other"] as TaskType[]).map((t) => (
              <button key={t} onClick={() => set("taskType", t)} style={{ minWidth: 92, flex: "1 1 30%", padding: "9px 10px", borderRadius: 12, border: form.taskType === t ? "none" : isDark ? "1px solid rgba(148,163,184,0.14)" : "1px solid rgba(100,140,220,0.18)", background: form.taskType === t ? `${TYPE_COLOR[t]}` : isDark ? "rgba(15,23,42,0.62)" : "rgba(255,255,255,0.24)", fontFamily: "Inter,sans-serif", fontSize: 12, fontWeight: form.taskType === t ? 700 : 600, color: form.taskType === t ? "#fff" : isDark ? "#dfeaf9" : "rgba(60,90,160,0.75)", cursor: "pointer", transition: "all 0.18s", boxShadow: form.taskType === t ? `0 4px 12px ${TYPE_COLOR[t]}44` : "none" }}>
                {TYPE_ICON[t]} {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Description (optional)" theme={theme}>
          <div style={{ borderRadius: 14, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)", boxShadow: isDark ? "inset 0 1px 0 rgba(148,163,184,0.04)" : "none", overflow: "hidden" }}>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Task details, requirements, notes..." rows={3} style={{ ...S.input, resize: "none", lineHeight: 1.5, paddingTop: 14, color: isDark ? "#e2e8f0" : undefined, minHeight: 66 }} />
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Due Date" error={errors.dueDate} theme={theme}>
            <div style={{ position: "relative", borderRadius: 14, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)", overflow: "hidden" }}>
              <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} style={{ ...S.input, fontSize: 13, color: isDark ? "#e2e8f0" : undefined, paddingRight: 38 }} />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.8 }}>{Ico.calendar(false)}</span>
            </div>
          </Field>
          <Field label="Due Time" theme={theme}>
            <div style={{ position: "relative", borderRadius: 14, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)", overflow: "hidden" }}>
              <input type="time" value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} style={{ ...S.input, fontSize: 13, color: isDark ? "#e2e8f0" : undefined, paddingRight: 38 }} />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.8 }}>{Ico.bell(false)}</span>
            </div>
          </Field>
        </div>

        <Field label="Priority" theme={theme}>
          <div style={{ display: "flex", gap: 8, padding: "8px 10px", borderRadius: 16, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)" }}>
            {(["Low", "Medium", "High"] as Priority[]).map((p) => (
              <button key={p} onClick={() => set("priority", p)} style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: form.priority === p ? "none" : `1px solid ${PRIORITY_COLOR[p]}22`, background: form.priority === p ? PRIORITY_COLOR[p] : PRIORITY_BG[p], fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 700, color: form.priority === p ? "#fff" : PRIORITY_COLOR[p], cursor: "pointer", transition: "all 0.18s", boxShadow: form.priority === p ? `0 4px 14px ${PRIORITY_COLOR[p]}44` : "none" }}>
                {p}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Revision status" theme={theme}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["Not started", "Reviewing", "Reviewed"] as RevisionStatus[]).map((s) => (
              <button key={s} onClick={() => set("revision", s)} style={{ padding: "9px 12px", borderRadius: 12, border: form.revision === s ? "none" : isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(100,140,220,0.18)", background: form.revision === s ? REVISION_STYLES[s].bg : isDark ? "rgba(15,23,42,0.5)" : "rgba(255,255,255,0.2)", color: form.revision === s ? REVISION_STYLES[s].color : isDark ? "#dfeaf9" : "rgba(60,90,160,0.72)", fontFamily: "Inter,sans-serif", fontWeight: 700, cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Study notes" theme={theme}>
          <div style={{ borderRadius: 14, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)", overflow: "hidden" }}>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="What should you revise? Include summary points, formulas, or reminders..." rows={3} style={{ ...S.input, resize: "none", lineHeight: 1.5, paddingTop: 14, color: isDark ? "#e2e8f0" : undefined, minHeight: 66 }} />
          </div>
        </Field>

        <Field label="Attachment (PDF / image / notes)" theme={theme}>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 14, background: isDark ? "rgba(12,18,31,0.28)" : "rgba(255,255,255,0.12)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(96,165,250,0.08)", padding: "12px 14px", cursor: "pointer" }}>
            <span style={{ fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 600, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.8)" }}>{form.attachmentName || "Choose a file"}</span>
            <span style={{ fontFamily: "Inter,sans-serif", fontSize: 11, fontWeight: 700, color: "#3b82f6" }}>Upload</span>
            <input type="file" accept="image/*,.pdf,.txt,.doc,.docx" onChange={handleAttachment} style={{ display: "none" }} />
          </label>
        </Field>

        <div style={{ height: 4 }} />
        <button onClick={submit} style={{ ...S.primaryBtn, borderRadius: 20, padding: "18px 16px", fontSize: 16, boxShadow: "0 10px 24px rgba(59,130,246,0.34)" }}>{initial ? "Save Changes" : "Add Deadline"}</button>
      </div>
    </div>
  );
}

// ─── SCREEN: Deadline Detail ──────────────────────────────────────────────────

function DeadlineDetailScreen({ d, onBack, onComplete, onDelete, onEdit, theme }: { d: Deadline; onBack: () => void; onComplete: () => void; onDelete: () => void; onEdit: () => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const countdown = d.completed ? null : getCountdown(d.dueDate, d.dueTime);
  const countdownColor = countdown === "Overdue" ? "#ef4444" : "#3b82f6";
  const [delConfirm, setDelConfirm] = useState(false);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px", position: "relative" }} className="anim-slide">
      <BackBtn onPress={onBack} label="Deadline Details" />

      {/* Hero */}
      <div style={{ ...S.glassCard, borderRadius: 26, padding: "20px", marginBottom: 14, borderLeft: `4px solid ${d.completed ? "#22c55e" : PRIORITY_COLOR[d.priority]}`, background: isDark ? "rgba(15,23,42,0.72)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <TypeBadge taskType={d.taskType} />
            </div>
            <h2 style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 21, color: isDark ? "#f8fafc" : "rgba(18,36,80,0.95)", margin: "4px 0 2px" }}>{d.taskName}</h2>
            <p style={{ fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 600, color: isDark ? "#b5c2d9" : "rgba(60,90,160,0.6)", margin: 0 }}>{d.subject}</p>
          </div>
          <PriorityBadge priority={d.priority} />
        </div>

        {countdown && (
          <div style={{ background: countdown === "Overdue" ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.09)", borderRadius: 16, padding: "12px 16px" }}>
            <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 800, fontSize: 20, color: countdownColor, margin: 0 }}>{countdown}</p>
            <p style={{ ...S.caption, margin: "2px 0 0" }}>until deadline</p>
          </div>
        )}
        {d.completed && (
          <div style={{ background: "rgba(34,197,94,0.1)", borderRadius: 16, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            {Ico.check()}
            <div>
              <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 16, color: "#22c55e", margin: 0 }}>Completed</p>
              {d.completedAt && <p style={{ ...S.caption, margin: "1px 0 0", fontSize: 11 }}>{new Date(d.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Details */}
      <div style={{ ...S.glassCard, borderRadius: 22, padding: "6px 18px", marginBottom: 14, background: isDark ? "rgba(15,23,42,0.68)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
        {[
          { label: "Due Date", value: formatDate(d.dueDate) },
          { label: "Due Time", value: formatTime(d.dueTime) },
          { label: "Task Type", value: `${TYPE_ICON[d.taskType]} ${d.taskType}` },
          { label: "Priority", value: d.priority },
          { label: "Revision", value: d.revision },
        ].map((row, i, arr) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(100,140,220,0.1)" : "none" }}>
            <span style={{ ...S.caption, fontWeight: 500, color: isDark ? "#9db0ca" : undefined }}>{row.label}</span>
            <span style={{ fontFamily: "Inter,sans-serif", fontSize: 14, fontWeight: 600, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)" }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Description */}
      {d.description && (
        <div style={{ ...S.glassCard, borderRadius: 22, padding: "16px 18px", marginBottom: 14, background: isDark ? "rgba(15,23,42,0.68)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
          <p style={{ ...S.label, marginBottom: 8, color: isDark ? "#bfd0ea" : undefined }}>Description</p>
          <p style={{ ...S.body, margin: 0, fontSize: 14, color: isDark ? "#dfeaf9" : undefined }}>{d.description}</p>
        </div>
      )}

      {d.notes && (
        <div style={{ ...S.glassCard, borderRadius: 22, padding: "16px 18px", marginBottom: 14, background: isDark ? "rgba(15,23,42,0.68)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
          <p style={{ ...S.label, marginBottom: 8, color: isDark ? "#bfd0ea" : undefined }}>Study notes</p>
          <p style={{ ...S.body, margin: 0, fontSize: 14, color: isDark ? "#dfeaf9" : undefined }}>{d.notes}</p>
        </div>
      )}

      {d.attachmentName && d.attachmentDataUrl && (
        <div style={{ ...S.glassCard, borderRadius: 22, padding: "16px 18px", marginBottom: 14, background: isDark ? "rgba(15,23,42,0.68)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <p style={{ ...S.label, margin: 0, color: isDark ? "#bfd0ea" : undefined }}>Attachment</p>
            <a href={d.attachmentDataUrl} target="_blank" rel="noreferrer" style={{ fontFamily: "Inter,sans-serif", fontSize: 12, fontWeight: 700, color: "#3b82f6", textDecoration: "none" }}>Open</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: isDark ? "rgba(30,41,59,0.8)" : "rgba(59,130,246,0.04)" }}>
            <span style={{ fontSize: 20 }}>📎</span>
            <span style={{ fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 600, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.8)" }}>{d.attachmentName}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      {!d.completed && (
        <button onClick={onComplete} style={{ ...S.primaryBtn, background: "linear-gradient(135deg,#22c55e,#16a34a)", boxShadow: "0 6px 20px rgba(34,197,94,0.3)", marginBottom: 12 }}>
          ✓ Mark as Complete
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
        <button onClick={onEdit} style={{ padding: "14px", background: "rgba(59,130,246,0.09)", borderRadius: 20, border: "1.5px solid rgba(59,130,246,0.22)", fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 14, color: "#3b82f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {Ico.edit()} Edit
        </button>
        <button onClick={() => setDelConfirm(true)} style={{ padding: "14px", background: "rgba(239,68,68,0.07)", borderRadius: 20, border: "1.5px solid rgba(239,68,68,0.2)", fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 14, color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {Ico.trash()} Delete
        </button>
      </div>

      {/* Delete confirmation */}
      {delConfirm && (
        <div className="anim-fade" style={{ position: "absolute", inset: 0, background: "rgba(16, 24, 40, 0.18)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 20 }}>
          <div className="anim-scale" style={{ ...S.glassCard, width: "100%", maxWidth: 320, borderRadius: 26, padding: "18px 16px 16px", border: "1.5px solid rgba(239,68,68,0.2)", boxShadow: "0 18px 42px rgba(43, 62, 104, 0.18)" }}>
            <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 600, fontSize: 15, color: "rgba(18,36,80,0.9)", margin: "0 0 10px", textAlign: "center" }}>Delete this deadline?</p>
            <p style={{ ...S.caption, margin: "0 0 16px", textAlign: "center" }}>This action cannot be undone.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDelConfirm(false)} style={{ flex: 1, padding: "12px 10px", background: "rgba(100,130,200,0.1)", borderRadius: 16, border: "none", fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "rgba(60,90,160,0.7)", cursor: "pointer", transition: "transform 0.15s ease, opacity 0.15s ease" }}>Cancel</button>
              <button onClick={onDelete} style={{ flex: 1, padding: "12px 10px", background: "#ef4444", borderRadius: 16, border: "none", fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "#fff", cursor: "pointer", transition: "transform 0.15s ease, opacity 0.15s ease" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SCREEN: Completion ───────────────────────────────────────────────────────

function CompletionScreen({ d, deadlines, onDashboard, theme }: { d: Deadline; deadlines: Deadline[]; onDashboard: () => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const completedToday = deadlines.filter((x) => x.completed && x.completedAt && isToday(x.completedAt.split("T")[0])).length;
  const remainingWeek = deadlines.filter((x) => !x.completed && isThisWeek(x.dueDate)).length;
  const weekTotal = deadlines.filter((x) => isThisWeek(x.dueDate)).length;
  const weekDone = deadlines.filter((x) => x.completed && isThisWeek(x.dueDate)).length;
  const pct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 32px", display: "flex", flexDirection: "column", alignItems: "center" }} className="anim-scale">
      <div style={{ height: 40 }} />

      {/* Check */}
      <div style={{ ...S.glassCard, width: 116, height: 116, borderRadius: 38, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 26, background: isDark ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.13)", border: "2px solid rgba(34,197,94,0.38)", boxShadow: "0 16px 48px rgba(34,197,94,0.24)" }}>
        {Ico.checkLg()}
      </div>

      <h2 style={{ ...S.h1, textAlign: "center", marginBottom: 8, fontSize: 28, color: isDark ? "#f8fafc" : undefined }}>Task Completed! 🎉</h2>
      <p style={{ ...S.body, textAlign: "center", margin: "0 0 32px", maxWidth: 280, color: isDark ? "#dfeaf9" : undefined }}>
        Great job! You completed your{" "}
        <strong style={{ color: isDark ? "#f8fafc" : "rgba(18,36,80,0.9)", fontWeight: 600 }}>{d.subject} {d.taskName}</strong>.
      </p>

      {/* Stats */}
      <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={{ ...S.glassCard, borderRadius: 22, padding: "16px", textAlign: "center" }}>
          <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 800, fontSize: 30, color: "#22c55e", margin: 0, lineHeight: 1 }}>{completedToday}</p>
          <p style={{ ...S.caption, margin: "6px 0 0", fontWeight: 500 }}>Completed Today</p>
        </div>
        <div style={{ ...S.glassCard, borderRadius: 22, padding: "16px", textAlign: "center" }}>
          <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 800, fontSize: 30, color: "#f97316", margin: 0, lineHeight: 1 }}>{remainingWeek}</p>
          <p style={{ ...S.caption, margin: "6px 0 0", fontWeight: 500 }}>Remaining This Week</p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ ...S.glassCard, width: "100%", borderRadius: 22, padding: "16px 18px", marginBottom: 28, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 600, color: "rgba(40,70,140,0.8)" }}>Weekly Progress</span>
          <span style={{ fontFamily: "Poppins,sans-serif", fontSize: 16, fontWeight: 800, color: "#3b82f6" }}>{pct}%</span>
        </div>
        <div style={{ background: "rgba(100,140,220,0.15)", borderRadius: 10, height: 12, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#3b82f6,#22c55e)", borderRadius: 10, transition: "width 1.2s cubic-bezier(0.2,0.8,0.2,1)" }} />
        </div>
        <p style={{ ...S.caption, margin: "8px 0 0", fontSize: 11 }}>{weekDone} of {weekTotal} tasks completed this week</p>
      </div>

      <button onClick={onDashboard} style={{ ...S.primaryBtn, width: "100%" }}>← Back to Dashboard</button>
    </div>
  );
}

// ─── SCREEN: Calendar ─────────────────────────────────────────────────────────

function CalendarScreen({ deadlines, onDeadline, theme }: { deadlines: Deadline[]; onDeadline: (d: Deadline) => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const [sel, setSel] = useState(todayStr());
  const [viewMonth, setViewMonth] = useState(new Date());
  const yr = viewMonth.getFullYear(), mo = viewMonth.getMonth();
  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const today = todayStr();

  const byDate = deadlines.reduce<Record<string, Deadline[]>>((acc, d) => { (acc[d.dueDate] ??= []).push(d); return acc; }, {});
  const selDeadlines = byDate[sel] ?? [];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 8px" }} className="anim-slide">
      <h2 style={{ ...S.h2, marginBottom: 16, color: isDark ? "#f8fafc" : undefined }}>Calendar</h2>

      {/* Calendar card */}
      <div style={{ ...S.glassCard, borderRadius: 26, padding: "16px 14px", marginBottom: 14, background: isDark ? "linear-gradient(180deg, rgba(15,23,42,0.9), rgba(11,18,32,0.8))" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined, boxShadow: isDark ? "inset 0 1px 0 rgba(148,163,184,0.06)" : undefined }}>
        {/* Month nav */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button onClick={() => setViewMonth(new Date(yr, mo - 1, 1))} style={{ ...S.iconBtn, background: isDark ? "rgba(96,165,250,0.14)" : "rgba(59,130,246,0.1)", width: 36, height: 36, borderRadius: 12, border: isDark ? "1px solid rgba(96,165,250,0.18)" : undefined }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#dbeafe" : "#3b82f6"} strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: isDark ? "#f8fafc" : "rgba(18,36,80,0.9)" }}>
            {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => setViewMonth(new Date(yr, mo + 1, 1))} style={{ ...S.iconBtn, background: isDark ? "rgba(96,165,250,0.14)" : "rgba(59,130,246,0.1)", width: 36, height: 36, borderRadius: 12, border: isDark ? "1px solid rgba(96,165,250,0.18)" : undefined }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#dbeafe" : "#3b82f6"} strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>

        {/* Day labels */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontFamily: "Inter,sans-serif", fontSize: 11, fontWeight: 700, color: isDark ? "#9db0ca" : "rgba(60,90,160,0.45)", padding: "4px 0" }}>{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const ds = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isSel = ds === sel, isT = ds === today, has = !!byDate[ds];
            const items = byDate[ds] ?? [];
            return (
              <button key={day} onClick={() => setSel(ds)} style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 11, border: "none", cursor: "pointer", background: isSel ? "linear-gradient(135deg,#3b82f6,#6366f1)" : isT ? "rgba(96,165,250,0.12)" : "transparent", transition: "all 0.18s ease", gap: 3, padding: 2, boxShadow: isSel ? "0 10px 24px rgba(59,130,246,0.38)" : "none" }}>
                <span style={{ fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: isT || isSel ? 700 : 500, color: isSel ? "#fff" : isT ? "#dbeafe" : isDark ? "#e2e8f0" : "rgba(18,36,80,0.78)" }}>{day}</span>
                {has && (
                  <div style={{ display: "flex", gap: 2 }}>
                    {items.slice(0, 3).map((dl, idx) => (
                      <div key={idx} style={{ width: 4, height: 4, borderRadius: "50%", background: isSel ? "rgba(255,255,255,0.8)" : TYPE_COLOR[dl.taskType] }} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, paddingLeft: 2 }}>
        {(Object.keys(TYPE_COLOR) as TaskType[]).map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: TYPE_COLOR[t] }} />
            <span style={{ fontFamily: "Inter,sans-serif", fontSize: 11, color: isDark ? "#b5c2d9" : "rgba(60,90,160,0.55)" }}>{t}</span>
          </div>
        ))}
      </div>

      {/* Selected date */}
      <SectionHeader title={`${formatDate(sel)} · ${selDeadlines.length} deadline${selDeadlines.length !== 1 ? "s" : ""}`} theme={theme} />
      {selDeadlines.length === 0
        ? <EmptyState emoji="📅" title="Nothing Scheduled" body="No deadlines on this date" theme={theme} />
        : selDeadlines.map((d) => <DeadlineCard key={d.id} d={d} onPress={() => onDeadline(d)} theme={theme} />)
      }
    </div>
  );
}

// ─── SCREEN: Notifications ────────────────────────────────────────────────────

function NotificationsScreen({ deadlines, onDeadline, theme }: { deadlines: Deadline[]; onDeadline: (d: Deadline) => void; theme: ThemeMode }) {
  const isDark = isDarkTheme(theme);
  const todayItems = deadlines.filter((d) => !d.completed && isToday(d.dueDate));
  const tomorrowStr = offsetDate(1);
  const tomorrowItems = deadlines.filter((d) => !d.completed && d.dueDate === tomorrowStr);

  type NItem = { emoji: string; title: string; body: string; unread: boolean; time: string; deadline?: Deadline };
  const groups: { label: string; items: NItem[] }[] = [
    {
      label: "Today",
      items: [
        ...todayItems.map((d) => ({ emoji: "🔔", title: `${d.subject} ${d.taskType} due today`, body: `"${d.taskName}" is due at ${formatTime(d.dueTime)}. Don't miss it!`, unread: true, time: "Just now", deadline: d })),
        { emoji: "📊", title: "Weekly Summary", body: `${deadlines.filter((d) => isThisWeek(d.dueDate) && !d.completed).length} deadlines remaining this week. Stay on track!`, unread: true, time: "1h ago" },
      ],
    },
    {
      label: "Yesterday",
      items: [
        ...tomorrowItems.map((d) => ({ emoji: "⏰", title: `Reminder: ${d.subject} ${d.taskType}`, body: `"${d.taskName}" is due tomorrow at ${formatTime(d.dueTime)}.`, unread: false, time: "Yesterday", deadline: d })),
        { emoji: "✅", title: "Great Progress!", body: `You completed ${deadlines.filter((d) => d.completed).length} tasks this week. Keep it up!`, unread: false, time: "Yesterday" },
      ],
    },
    {
      label: "Earlier",
      items: [
        { emoji: "🎯", title: "DueDash Tip", body: "Set reminders 24 hours before big exams for better preparation time.", unread: false, time: "3 days ago" },
        { emoji: "📚", title: "Semester Reminder", body: "Don't forget to add all your upcoming deadlines for the semester.", unread: false, time: "5 days ago" },
      ],
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 8px" }} className="anim-slide">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ ...S.h2, color: isDark ? "#f8fafc" : undefined }}>Notifications</h2>
        <button style={{ ...S.iconBtn, ...S.glass, background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.4)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>{Ico.settings()}</button>
      </div>

      {groups.map((grp) => grp.items.length > 0 && (
        <div key={grp.label} style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Inter,sans-serif", fontSize: 11, fontWeight: 700, color: isDark ? "#9db0ca" : "rgba(60,90,160,0.5)", letterSpacing: 1, margin: "0 0 8px", textTransform: "uppercase" }}>{grp.label}</p>
          {grp.items.map((item, i) => (
            <button key={i} onClick={item.deadline ? () => onDeadline(item.deadline!) : undefined} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: item.deadline ? "pointer" : "default", marginBottom: 8, display: "block" }}>
              <div style={{ ...S.glassCard, borderRadius: 20, padding: "13px 14px", display: "flex", gap: 12, alignItems: "flex-start", background: isDark ? "rgba(15,23,42,0.7)" : undefined, border: isDark ? "1px solid rgba(148,163,184,0.18)" : undefined }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, background: item.unread ? "rgba(59,130,246,0.14)" : "rgba(100,140,220,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{item.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <p style={{ fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 600, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.9)", margin: 0, flex: 1 }}>{item.title}</p>
                    {item.unread && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0, marginTop: 4 }} />}
                  </div>
                  <p style={{ fontFamily: "Inter,sans-serif", fontSize: 12, color: isDark ? "#b5c2d9" : "rgba(60,90,160,0.6)", margin: "3px 0 5px", lineHeight: 1.45 }}>{item.body}</p>
                  <span style={{ fontFamily: "Inter,sans-serif", fontSize: 10, color: "rgba(100,140,200,0.48)", letterSpacing: 0.2 }}>{item.time}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── SCREEN: Profile ──────────────────────────────────────────────────────────

function ProfileScreen({ deadlines, onLogout, theme, onThemeChange }: { deadlines: Deadline[]; onLogout: () => void; theme: ThemeMode; onThemeChange: (v: ThemeMode) => void }) {
  const isDark = isDarkTheme(theme);
  const darkText = isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)";
  const darkSub = isDark ? "#a5b4cf" : "rgba(60,90,160,0.5)";
  const darkLabel = isDark ? "#dfeaf9" : "rgba(18,36,80,0.9)";
  const darkPanel = isDark ? "rgba(15,23,42,0.68)" : "rgba(255,255,255,0.38)";
  const darkChip = isDark ? "rgba(96,165,250,0.12)" : "rgba(59,130,246,0.09)";
  const darkCardBorder = isDark ? "rgba(148,163,184,0.18)" : "rgba(100,140,220,0.1)";
  const darkInput = isDark ? "rgba(30,41,59,0.9)" : "rgba(255,255,255,0.4)";

  const completed = deadlines.filter((d) => d.completed).length;
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [reminderDays, setReminderDays] = useState(1);
  const [reminderHours, setReminderHours] = useState(1);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exportCsv = () => {
    const rows = [
      ["taskName", "subject", "taskType", "priority", "dueDate", "dueTime", "status"],
      ...deadlines.map((d) => [d.taskName, d.subject, d.taskType, d.priority, d.dueDate, d.dueTime, d.completed ? "Completed" : "Open"]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "duedash-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const backupJson = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), deadlines }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "duedash-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const restoreJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (Array.isArray(parsed.deadlines)) {
          localStorage.setItem(STORAGE_KEYS.deadlines, JSON.stringify(parsed.deadlines));
          window.location.reload();
        }
      } catch {
        console.warn("Could not restore backup");
      }
    };
    reader.readAsText(file);
  };

  const settings = [
    { key: "reminder", icon: "🔔", label: "Reminder Settings", sub: `${reminderDays} day${reminderDays !== 1 ? "s" : ""} & ${reminderHours} hour${reminderHours !== 1 ? "s" : ""} before due` },
    { key: "notification", icon: "📲", label: "Notification Settings", sub: notificationsEnabled ? "All notifications enabled" : "Notifications muted" },
    { key: "appearance", icon: "🎨", label: "Appearance", sub: `${theme} · Liquid Glass theme` },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 8px" }} className="anim-slide">
      <h2 style={{ ...S.h2, marginBottom: 18, color: isDark ? "#f8fafc" : "rgba(18,36,80,0.95)" }}>Profile</h2>

      {/* Avatar */}
      <div style={{ ...S.glassCard, borderRadius: 28, padding: "24px 20px 20px", marginBottom: 14, textAlign: "center", background: isDark ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.38)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(255,255,255,0.55)", boxShadow: isDark ? "0 8px 24px rgba(2,6,23,0.24), inset 0 1px 0 rgba(148,163,184,0.12)" : "0 4px 24px rgba(80,120,200,0.1), inset 0 1px 0 rgba(255,255,255,0.7)" }}>
        <div style={{ width: 82, height: 82, borderRadius: 28, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 32, color: "#fff", boxShadow: "0 8px 28px rgba(59,130,246,0.32)" }}>T</div>
        <h3 style={{ fontFamily: "Poppins,sans-serif", fontWeight: 700, fontSize: 20, color: isDark ? "#f8fafc" : "rgba(18,36,80,0.95)", margin: "0 0 3px" }}>Timothy</h3>
        <p style={{ ...S.caption, margin: "0 0 16px", color: isDark ? "#b5c2d9" : "rgba(60,90,160,0.55)" }}>Student ID: 2024-CS-00142</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[{ label: "Program", value: "BS Computer Science" }, { label: "Year Level", value: "3rd Year" }].map((it) => (
            <div key={it.label} style={{ ...S.glass, borderRadius: 16, padding: "11px 13px", textAlign: "left", background: isDark ? "rgba(30,41,59,0.88)" : "rgba(255,255,255,0.26)", border: isDark ? "1px solid rgba(148,163,184,0.16)" : "1px solid rgba(255,255,255,0.42)" }}>
              <p style={{ fontFamily: "Inter,sans-serif", fontSize: 10, fontWeight: 700, color: isDark ? "#9db0ca" : "rgba(60,90,160,0.5)", letterSpacing: 0.6, margin: "0 0 3px", textTransform: "uppercase" }}>{it.label}</p>
              <p style={{ fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 600, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)", margin: 0 }}>{it.value}</p>
            </div>
          ))}
        </div>

        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { val: deadlines.length, label: "Total" },
            { val: completed, label: "Done" },
            { val: deadlines.filter((d) => !d.completed && isThisWeek(d.dueDate)).length, label: "This Week" },
          ].map((st) => (
            <div key={st.label} style={{ background: isDark ? "rgba(96,165,250,0.12)" : "rgba(59,130,246,0.08)", borderRadius: 14, padding: "10px 8px" }}>
              <p style={{ fontFamily: "Poppins,sans-serif", fontWeight: 800, fontSize: 20, color: "#7bb5ff", margin: 0 }}>{st.val}</p>
              <p style={{ fontFamily: "Inter,sans-serif", fontSize: 10, fontWeight: 600, color: isDark ? "#cbd5e1" : "rgba(60,90,160,0.55)", margin: "2px 0 0" }}>{st.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div style={{ ...S.glassCard, borderRadius: 24, padding: "4px 16px", marginBottom: 14, background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.38)", border: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(255,255,255,0.55)" }}>
        {settings.map((s, i) => {
          const isOpen = openPanel === s.key;
          return (
            <div key={s.key}>
              <button onClick={() => setOpenPanel(isOpen ? null : s.key)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 0", background: "none", border: "none", borderBottom: i < settings.length - 1 ? `1px solid ${darkCardBorder}` : "none", cursor: "pointer", textAlign: "left", minHeight: 44 }}>
                <div style={{ width: 38, height: 38, borderRadius: 13, background: isDark ? "rgba(96,165,250,0.15)" : "rgba(59,130,246,0.09)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{s.icon}</div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <p style={{ fontFamily: "Inter,sans-serif", fontSize: 14, fontWeight: 600, color: isDark ? "#e2e8f0" : "rgba(18,36,80,0.88)", margin: 0 }}>{s.label}</p>
                  <p style={{ fontFamily: "Inter,sans-serif", fontSize: 11, color: isDark ? "#aebed3" : "rgba(60,90,160,0.5)", margin: "1px 0 0" }}>{s.sub}</p>
                </div>
                {Ico.chevRight(isDark ? "rgba(191,219,254,0.8)" : "rgba(100,130,190,0.45)")}
              </button>

              {isOpen && (
                <div style={{ background: isDark ? "rgba(30,41,59,0.78)" : "rgba(59,130,246,0.04)", borderRadius: 16, padding: 12, margin: "0 0 10px", border: `1px solid ${isDark ? "rgba(148,163,184,0.15)" : "rgba(100,140,220,0.12)"}` }}>
                  {s.key === "reminder" && (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ ...S.caption, fontWeight: 600 }}>Days before</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button onClick={() => setReminderDays((v) => Math.max(0, v - 1))} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontWeight: 700, cursor: "pointer" }}>−</button>
                          <span style={{ minWidth: 22, textAlign: "center", fontFamily: "Inter,sans-serif", fontWeight: 700, color: "rgba(18,36,80,0.9)" }}>{reminderDays}</span>
                          <button onClick={() => setReminderDays((v) => v + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontWeight: 700, cursor: "pointer" }}>+</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ ...S.caption, fontWeight: 600 }}>Hours before</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button onClick={() => setReminderHours((v) => Math.max(0, v - 1))} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontWeight: 700, cursor: "pointer" }}>−</button>
                          <span style={{ minWidth: 22, textAlign: "center", fontFamily: "Inter,sans-serif", fontWeight: 700, color: "rgba(18,36,80,0.9)" }}>{reminderHours}</span>
                          <button onClick={() => setReminderHours((v) => v + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontWeight: 700, cursor: "pointer" }}>+</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {s.key === "notification" && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <span style={{ fontFamily: "Inter,sans-serif", fontSize: 13, fontWeight: 600, color: "rgba(18,36,80,0.9)" }}>{notificationsEnabled ? "Enabled" : "Muted"}</span>
                      <button onClick={() => setNotificationsEnabled((v) => !v)} style={{ position: "relative", width: 48, height: 28, borderRadius: 999, border: "none", background: notificationsEnabled ? "#3b82f6" : "rgba(100,140,220,0.18)", cursor: "pointer", transition: "all 0.2s ease" }}>
                        <span style={{ position: "absolute", top: 4, left: notificationsEnabled ? 26 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "all 0.2s ease", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }} />
                      </button>
                    </div>
                  )}

                  {s.key === "appearance" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                      {(["Light", "Dark", "Ocean", "Sunset"] as ThemeMode[]).map((mode) => (
                        <button key={mode} onClick={() => onThemeChange(mode)} style={{ padding: "9px 10px", borderRadius: 12, border: "none", background: theme === mode ? "linear-gradient(135deg,#3b82f6,#6366f1)" : "rgba(255,255,255,0.4)", color: theme === mode ? "#fff" : "rgba(60,90,160,0.7)", fontFamily: "Inter,sans-serif", fontWeight: 700, cursor: "pointer" }}>
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        <button onClick={exportCsv} style={{ ...S.ghostBtn, padding: 12, fontSize: 13 }}>Export CSV</button>
        <button onClick={backupJson} style={{ ...S.ghostBtn, padding: 12, fontSize: 13 }}>Backup</button>
      </div>
      <button onClick={() => fileInputRef.current?.click()} style={{ ...S.ghostBtn, marginTop: 10, padding: 12, fontSize: 13 }}>Restore</button>
      <input ref={fileInputRef} type="file" accept=".json" onChange={restoreJson} style={{ display: "none" }} />

      <button onClick={onLogout} style={{ ...S.ghostBtn, color: "#ef4444", borderColor: "rgba(239,68,68,0.22)", background: "rgba(239,68,68,0.06)", marginTop: 12, marginBottom: 8 }}>
        Log Out
      </button>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

const NAV_SCREENS: Screen[] = ["dashboard", "deadlines", "calendar", "notifications", "profile"];

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.deadlines);
      return raw ? JSON.parse(raw) as Deadline[] : INITIAL_DEADLINES;
    } catch {
      return INITIAL_DEADLINES;
    }
  });
  const [activeDeadline, setActiveDeadline] = useState<Deadline | null>(null);
  const [activeNav, setActiveNav] = useState<Screen>("dashboard");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode | null;
      return saved ?? "Light";
    } catch {
      return "Light";
    }
  });
  const [animKey, setAnimKey] = useState(0);
  const history = useRef<Screen[]>(["login"]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.deadlines, JSON.stringify(deadlines));
  }, [deadlines]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  const navigate = useCallback((s: Screen) => {
    history.current.push(s);
    setScreen(s);
    setAnimKey((k) => k + 1);
    if (NAV_SCREENS.includes(s)) setActiveNav(s);
  }, []);

  const goBack = useCallback(() => {
    history.current.pop();
    const prev = history.current[history.current.length - 1] ?? "dashboard";
    setScreen(prev);
    setAnimKey((k) => k + 1);
    if (NAV_SCREENS.includes(prev)) setActiveNav(prev);
  }, []);

  const openDeadline = (d: Deadline) => {
    setActiveDeadline(d);
    navigate("deadline-detail");
  };

  const addDeadline = (data: Omit<Deadline, "id" | "completed" | "completedAt">) => {
    const nd: Deadline = { ...data, id: Date.now().toString(), completed: false };
    setDeadlines((ds) => [nd, ...ds]);
    setActiveDeadline(nd);
    history.current.pop(); // replace add-deadline in history
    navigate("deadline-detail");
  };

  const editDeadline = (data: Omit<Deadline, "id" | "completed" | "completedAt">) => {
    if (!activeDeadline) return;
    const updated = { ...activeDeadline, ...data };
    setDeadlines((ds) => ds.map((d) => (d.id === activeDeadline.id ? updated : d)));
    setActiveDeadline(updated);
    history.current.pop();
    navigate("deadline-detail");
  };

  const completeDeadline = () => {
    if (!activeDeadline) return;
    const updated = { ...activeDeadline, completed: true, completedAt: new Date().toISOString() };
    setDeadlines((ds) => ds.map((d) => (d.id === activeDeadline.id ? updated : d)));
    setActiveDeadline(updated);
    navigate("completion");
  };

  const deleteDeadline = () => {
    if (!activeDeadline) return;
    setDeadlines((ds) => ds.filter((d) => d.id !== activeDeadline.id));
    setActiveDeadline(null);
    // go back to where we came from (before detail)
    history.current.pop(); // pop deadline-detail
    const prev = history.current[history.current.length - 1] ?? "deadlines";
    setScreen(prev);
    setAnimKey((k) => k + 1);
    if (NAV_SCREENS.includes(prev)) setActiveNav(prev);
  };

  // Keep activeDeadline synced with deadlines state
  const currentDeadline = activeDeadline ? deadlines.find((d) => d.id === activeDeadline.id) ?? activeDeadline : null;

  const showNav = NAV_SCREENS.includes(screen);

  return (
    <PhoneFrame theme={theme}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .anim-fade { animation: fadeIn 0.28s ease forwards; }
        .anim-slide { animation: slideUp 0.3s cubic-bezier(0.2,0.9,0.3,1) forwards; }
        .anim-scale { animation: scaleIn 0.3s cubic-bezier(0.2,0.9,0.3,1) forwards; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.93); } to { opacity:1; transform:scale(1); } }
        @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
        .shimmer { background:linear-gradient(90deg,rgba(200,215,255,0.15) 25%,rgba(220,230,255,0.4) 50%,rgba(200,215,255,0.15) 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; }
        input::placeholder,textarea::placeholder { color:rgba(80,110,180,0.38); }
        input[type=date],input[type=time] { color-scheme: light; }
        * { -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display:none; }
      `}</style>
      <StatusBar theme={theme} />
      <div key={animKey} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        {screen === "login" && <LoginScreen theme={theme} onLogin={() => { history.current = ["dashboard"]; setScreen("dashboard"); setActiveNav("dashboard"); setAnimKey(k => k + 1); }} />}
        {screen === "dashboard" && <DashboardScreen deadlines={deadlines} onNav={navigate} onDeadline={openDeadline} onAdd={() => navigate("add-deadline")} theme={theme} />}
        {screen === "deadlines" && <DeadlinesScreen deadlines={deadlines} onDeadline={openDeadline} onAdd={() => navigate("add-deadline")} theme={theme} />}
        {screen === "add-deadline" && <DeadlineFormScreen title="Add Deadline" onSave={addDeadline} onBack={goBack} theme={theme} />}
        {screen === "edit-deadline" && currentDeadline && <DeadlineFormScreen title="Edit Deadline" initial={currentDeadline} onSave={editDeadline} onBack={goBack} theme={theme} />}
        {screen === "deadline-detail" && currentDeadline && (
          <DeadlineDetailScreen d={currentDeadline} onBack={goBack} onComplete={completeDeadline} onDelete={deleteDeadline} onEdit={() => navigate("edit-deadline")} theme={theme} />
        )}
        {screen === "completion" && currentDeadline && <CompletionScreen d={currentDeadline} deadlines={deadlines} onDashboard={() => { history.current = ["dashboard"]; setScreen("dashboard"); setActiveNav("dashboard"); setAnimKey(k => k + 1); }} theme={theme} />}
        {screen === "calendar" && <CalendarScreen deadlines={deadlines} onDeadline={openDeadline} theme={theme} />}
        {screen === "notifications" && <NotificationsScreen deadlines={deadlines} onDeadline={openDeadline} theme={theme} />}
        {screen === "profile" && <ProfileScreen deadlines={deadlines} onLogout={() => { history.current = ["login"]; setScreen("login"); setAnimKey(k => k + 1); }} theme={theme} onThemeChange={setTheme} />}
        {screen === "reviewer" && <ReviewerScreen onBack={goBack} theme={theme} />}
      </div>
      {showNav && <BottomNav active={activeNav} onNav={navigate} theme={theme} />}
    </PhoneFrame>
  );
}
