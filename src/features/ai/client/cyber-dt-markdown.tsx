import * as React from "react";

/**
 * A tiny markdown renderer for Cyber DT AI messages.
 *
 * Gemini answers use a small, predictable subset of markdown (headings,
 * bold, bullet/numbered lists, tables, --- separators). This renders that
 * subset as proper React elements — no external markdown library (keeps the
 * offline APK small) and no dangerouslySetInnerHTML (no XSS surface).
 */

/** Renders inline **bold**, *italic* and `code` inside a text line. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\$[^$\n]+\$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-cyan-100">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-cyan-500/20 px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("$")) {
      // Gemini sometimes wraps formulas like $CO_2$ — show the content plain.
      nodes.push(token.slice(1, -1));
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface TableRow {
  cells: string[];
}

/**
 * Renders a full message body: headings, paragraphs, bullet lists,
 * numbered lists, markdown tables and --- separators.
 */
export function CyberDTMessageBody({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isBullet = (s: string) => /^\s*[-*•]\s+/.test(s);
  const isNumbered = (s: string) => /^\s*\d+[.)]\s+/.test(s);
  const isSeparator = (s: string) => /^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(s);
  const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isTableDivider = (s: string) =>
    /^\s*\|[\s:|-]+\|\s*$/.test(s) && s.includes("-");

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading: # ## ### #### (leading ** inside headings is handled inline)
    const heading = line.match(/^\s*(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        React.createElement(
          `h${Math.min(level + 2, 6)}`,
          {
            key: `h${key++}`,
            className:
              "mt-3 mb-1 font-bold text-cyan-100 first:mt-0 leading-snug",
          },
          renderInline(heading[2].replace(/\*+/g, ""), `h${key}`),
        ),
      );
      i++;
      continue;
    }

    if (isSeparator(line)) {
      blocks.push(
        <hr key={`hr${key++}`} className="my-3 border-cyan-400/20" />,
      );
      i++;
      continue;
    }

    // Table: consecutive | rows | (the second row is often a divider)
    if (isTableRow(line)) {
      const rows: TableRow[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        if (!isTableDivider(lines[i])) {
          rows.push({
            cells: lines[i]
              .trim()
              .replace(/^\|/, "")
              .replace(/\|$/, "")
              .split("|")
              .map((c) => c.trim()),
          });
        }
        i++;
      }
      if (rows.length > 0) {
        blocks.push(
          <div
            key={`tbl${key++}`}
            className="my-2 overflow-x-auto rounded-lg border border-cyan-400/30"
          >
            <table className="w-full border-collapse text-xs">
              <tbody>
                {rows.map((row, r) => (
                  <tr
                    key={r}
                    className={
                      r === 0
                        ? "bg-cyan-500/20 font-semibold text-cyan-100"
                        : "border-t border-cyan-400/20"
                    }
                  >
                    {row.cells.map((cell, c) => (
                      <td key={c} className="px-2 py-1 align-top">
                        {renderInline(cell, `t${r}-${c}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    // Bullet list
    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && (isBullet(lines[i]) || (!lines[i].trim() && i + 1 < lines.length && isBullet(lines[i + 1])))) {
        if (isBullet(lines[i])) items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul${key++}`} className="my-1.5 list-disc space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ul${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Numbered list
    if (isNumbered(line)) {
      const items: string[] = [];
      while (i < lines.length && (isNumbered(lines[i]) || (!lines[i].trim() && i + 1 < lines.length && isNumbered(lines[i + 1])))) {
        if (isNumbered(lines[i])) items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol${key++}`} className="my-1.5 list-decimal space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ol${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph: group consecutive plain lines
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^\s*#{1,4}\s+/) &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i]) &&
      !isSeparator(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p${key++}`} className="my-1.5 leading-relaxed first:mt-0">
        {renderInline(para.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <>{blocks}</>;
}
