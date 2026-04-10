"use client";

import { useState, useRef, useEffect } from "react";
import type { Brief, EntityType, QAPair } from "@/lib/types";
import { ChevronDown, Pencil, Check } from "lucide-react";

interface BriefContentProps {
  brief: Brief;
  entityType: EntityType;
  onContentChange?: (newContent: string) => void;
}

interface Section {
  title: string;
  content: string;
  alwaysOpen?: boolean;
}

function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split("\n");
  let currentTitle = "";
  let currentContent: string[] = [];
  let isFirst = true;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentTitle || currentContent.length > 0) {
        sections.push({
          title: currentTitle || "Vue d'ensemble",
          content: currentContent.join("\n").trim(),
          alwaysOpen: isFirst,
        });
        isFirst = false;
      }
      currentTitle = line.replace("## ", "");
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentTitle || currentContent.length > 0) {
    sections.push({
      title: currentTitle || "Contenu",
      content: currentContent.join("\n").trim(),
      alwaysOpen: isFirst,
    });
  }

  return sections;
}

function sectionsToMarkdown(sections: Section[]): string {
  return sections
    .map((s) => {
      const header = `## ${s.title}`;
      return `${header}\n${s.content}`;
    })
    .join("\n\n");
}

function CollapsibleSection({
  section,
  onEdit,
}: {
  section: Section;
  onEdit?: (newContent: string) => void;
}) {
  const [expanded, setExpanded] = useState(section.alwaysOpen ?? false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(section.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      // Auto-resize
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    if (editText !== section.content && onEdit) {
      onEdit(editText);
    }
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setEditText(section.content);
    setEditing(true);
  };

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => !section.alwaysOpen && setExpanded(!expanded)}
        className={`w-full text-left px-4 py-3 flex items-center justify-between transition-opacity ${
          expanded || section.alwaysOpen
            ? "opacity-100"
            : "opacity-70 hover:opacity-90"
        }`}
      >
        <h3 className="text-sm font-semibold text-foreground">
          {section.title}
        </h3>
        <div className="flex items-center gap-1">
          {onEdit && (expanded || section.alwaysOpen) && !editing && (
            <span
              onClick={handleStartEdit}
              className="p-1.5 rounded-lg hover:bg-background transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
          )}
          {!section.alwaysOpen && (
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          )}
        </div>
      </button>

      {(expanded || section.alwaysOpen) && (
        <div className="px-4 pb-4">
          {editing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => {
                  setEditText(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground font-mono resize-none focus:outline-none focus:border-teal"
                rows={6}
              />
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 text-xs text-teal hover:text-teal-light transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Enregistrer
              </button>
            </div>
          ) : (
            <div
              className="text-sm text-foreground leading-relaxed prose prose-invert prose-sm max-w-none
                prose-table:border-border prose-th:border-border prose-td:border-border
                prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2
                prose-table:text-sm"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(section.content),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function QASection({ qaPairs }: { qaPairs: QAPair[] }) {
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);

  return (
    <div className="border-b border-border last:border-0">
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Q&A</h3>
      </div>
      <div className="px-4 pb-4 space-y-3">
        {qaPairs.map((pair, i) => (
          <div
            key={i}
            className="bg-background border border-border rounded-lg p-3 space-y-2"
          >
            <p className="text-sm text-foreground font-medium">
              {i + 1}. {pair.question}
            </p>
            {revealedIndex === i ? (
              <div className="text-sm text-muted-foreground">
                <p>{pair.model_answer}</p>
                {pair.key_points.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {pair.key_points.map((kp, j) => (
                      <li key={j} className="text-xs text-teal">
                        • {kp}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <button
                onClick={() => setRevealedIndex(i)}
                className="text-xs text-teal hover:underline"
              >
                Voir la réponse
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Simple markdown to HTML — handles tables, bold, italic, lists */
function renderMarkdown(md: string): string {
  let html = md
    // Tables
    .replace(/\|(.+)\|\n\|[-| :]+\|\n/g, (match, header) => {
      const headers = header
        .split("|")
        .map((h: string) => h.trim())
        .filter(Boolean);
      let table = '<table class="w-full border-collapse border border-border mb-4"><thead><tr>';
      headers.forEach((h: string) => {
        table += `<th class="border border-border bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">${h}</th>`;
      });
      table += "</tr></thead><tbody>";
      return table;
    })
    .replace(
      /\|(.+)\|/g,
      (match, row) => {
        if (row.includes("---")) return "";
        const cells = row
          .split("|")
          .map((c: string) => c.trim())
          .filter(Boolean);
        let tr = "<tr>";
        cells.forEach((c: string) => {
          tr += `<td class="border border-border px-3 py-2 text-sm">${c}</td>`;
        });
        tr += "</tr>";
        return tr;
      }
    )
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Numbered lists
    .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4">$1</li>')
    // Bullet lists
    .replace(/^[-•]\s(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Paragraphs
    .replace(/\n\n/g, "</p><p>")
    // Line breaks
    .replace(/\n/g, "<br>");

  // Close any open table
  if (html.includes("<tbody>") && !html.includes("</tbody>")) {
    html += "</tbody></table>";
  }

  return `<p>${html}</p>`;
}

export function BriefContent({ brief, entityType, onContentChange }: BriefContentProps) {
  const [sections, setSections] = useState(() => parseSections(brief.content));
  const qaPairs = (brief.qa_pairs || []) as QAPair[];

  const handleSectionEdit = (index: number, newContent: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], content: newContent };
    setSections(updated);

    const newMarkdown = sectionsToMarkdown(updated);
    onContentChange?.(newMarkdown);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {sections.map((section, i) => (
        <CollapsibleSection
          key={i}
          section={section}
          onEdit={onContentChange ? (content) => handleSectionEdit(i, content) : undefined}
        />
      ))}
      {qaPairs.length > 0 && <QASection qaPairs={qaPairs} />}
    </div>
  );
}
