// PDF generation for the Documents area.
//
// Uses @react-pdf/renderer to produce a real vector PDF with selectable
// text — accessible, searchable (Cmd-F), copy/pasteable, small file
// size, sharp at any zoom. This is best-practice for client-facing
// documents.
//
// The markdown is parsed into an mdast tree (unified + remark-parse +
// remark-gfm) and walked into react-pdf primitives. We hand-roll the
// walker rather than reusing react-markdown because:
//   1. react-markdown emits HTML primitives; react-pdf wants its own
//      <Text>/<View>/<Link> components.
//   2. AST walking lets us properly track ordered-list state and nested
//      list depths, which a component-mapping approach can't.

import {
  Document,
  Page,
  Text,
  View,
  Link,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { Fragment, type ReactNode } from "react";

export interface GeneratePdfArgs {
  title: string;
  bodyMarkdown: string;
}

// Heavy implementation. Reachable only via the thin entry-point at
// generateDocumentPdf.ts, which dynamic-imports this module so that
// @react-pdf/renderer + pdfkit (~600KB gzipped) stay out of the main
// bundle and only load when an operator/practice clicks Download.
export async function renderPdf({
  title,
  bodyMarkdown,
}: GeneratePdfArgs): Promise<void> {
  const cleanTitle = title.trim() || "Untitled";
  const filename = sanitiseFilename(cleanTitle) + ".pdf";

  const blob = await pdf(
    <Document title={cleanTitle} author="Dentaloptima">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{cleanTitle}</Text>
        {renderMarkdown(bodyMarkdown)}
      </Page>
    </Document>,
  ).toBlob();

  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so Firefox/Safari have a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function sanitiseFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// ── Markdown → react-pdf renderer ───────────────────────────────────

// Minimal structural types for the mdast nodes we handle. The full mdast
// type set is broader, but typing only what we render keeps this file
// self-contained and removes the runtime dependency on @types/mdast.
interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  // Heading
  depth?: number;
  // List
  ordered?: boolean;
  start?: number | null;
  spread?: boolean;
  // ListItem
  checked?: boolean | null;
  // Link
  url?: string;
  // Code
  lang?: string | null;
  // Table
  align?: Array<"left" | "right" | "center" | null>;
}

function renderMarkdown(markdown: string): ReactNode {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdNode;
  return (tree.children ?? []).map((node, i) => (
    <Fragment key={i}>{renderBlock(node)}</Fragment>
  ));
}

function renderBlock(node: MdNode): ReactNode {
  switch (node.type) {
    case "heading":
      return renderHeading(node);
    case "paragraph":
      return (
        <Text style={styles.paragraph}>{renderInlineChildren(node.children)}</Text>
      );
    case "list":
      return renderList(node);
    case "blockquote":
      return (
        <View style={styles.blockquote}>
          {(node.children ?? []).map((c, i) => (
            <Fragment key={i}>{renderBlock(c)}</Fragment>
          ))}
        </View>
      );
    case "thematicBreak":
      return <View style={styles.hr} />;
    case "code":
      return (
        <View style={styles.pre}>
          <Text>{node.value ?? ""}</Text>
        </View>
      );
    case "table":
      return renderTable(node);
    case "html":
      // Raw HTML — render as plain text rather than trying to interpret it.
      return <Text style={styles.paragraph}>{node.value ?? ""}</Text>;
    default:
      return null;
  }
}

function renderHeading(node: MdNode): ReactNode {
  const depth = (node.depth ?? 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const style = HEADING_STYLES[depth] ?? HEADING_STYLES[6];
  // wrap={false} keeps a heading from being orphaned at the bottom of a page.
  return (
    <Text style={style} wrap={false}>
      {renderInlineChildren(node.children)}
    </Text>
  );
}

function renderList(node: MdNode): ReactNode {
  const ordered = !!node.ordered;
  const start = node.start ?? 1;
  const items = node.children ?? [];
  return (
    <View style={styles.list}>
      {items.map((item, i) => {
        const marker =
          item.checked === true
            ? "☑"
            : item.checked === false
              ? "☐"
              : ordered
                ? `${start + i}.`
                : "•";
        return (
          <View key={i} style={styles.listItem} wrap={false}>
            <Text style={styles.listMarker}>{marker}</Text>
            <View style={styles.listContent}>
              {renderListItemChildren(item.children ?? [])}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// List items that contain a single paragraph render as a single Text
// (no extra block margins). Items with multiple blocks (e.g. a paragraph
// plus a nested list) render each as its own block.
function renderListItemChildren(children: MdNode[]): ReactNode {
  if (children.length === 1 && children[0].type === "paragraph") {
    return <Text>{renderInlineChildren(children[0].children)}</Text>;
  }
  return children.map((c, i) => <Fragment key={i}>{renderBlock(c)}</Fragment>);
}

function renderTable(node: MdNode): ReactNode {
  const rows = node.children ?? [];
  if (rows.length === 0) return null;
  const colCount = rows[0].children?.length ?? 0;
  return (
    <View style={styles.table}>
      {rows.map((row, ri) => {
        const isHeader = ri === 0;
        const cells = row.children ?? [];
        return (
          <View
            key={ri}
            style={[styles.tableRow, isHeader ? styles.tableHeaderRow : null]}
            wrap={false}
          >
            {cells.map((cell, ci) => (
              <View
                key={ci}
                style={[
                  styles.tableCell,
                  ci === colCount - 1 ? styles.tableCellLast : null,
                ]}
              >
                <Text style={isHeader ? styles.tableCellHeader : undefined}>
                  {renderInlineChildren(cell.children)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function renderInlineChildren(children: MdNode[] | undefined): ReactNode {
  if (!children) return null;
  return children.map((c, i) => (
    <Fragment key={i}>{renderInline(c)}</Fragment>
  ));
}

function renderInline(node: MdNode): ReactNode {
  switch (node.type) {
    case "text":
      return node.value ?? "";
    case "strong":
      return <Text style={styles.bold}>{renderInlineChildren(node.children)}</Text>;
    case "emphasis":
      return <Text style={styles.italic}>{renderInlineChildren(node.children)}</Text>;
    case "delete":
      return <Text style={styles.strike}>{renderInlineChildren(node.children)}</Text>;
    case "inlineCode":
      return <Text style={styles.code}>{node.value ?? ""}</Text>;
    case "link":
      return (
        <Link src={node.url || "#"} style={styles.link}>
          {renderInlineChildren(node.children)}
        </Link>
      );
    case "break":
      return "\n";
    case "html":
      // Inline HTML — strip tags rather than render literal markup.
      return (node.value ?? "").replace(/<[^>]+>/g, "");
    default:
      return null;
  }
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 48,
    paddingVertical: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111111",
    lineHeight: 1.5,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 16,
    color: "#111111",
  },
  h1: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 6,
    color: "#111111",
  },
  h2: {
    fontSize: 13.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 5,
    color: "#111111",
  },
  h3: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 4,
    color: "#111111",
  },
  h4: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 4,
    color: "#111111",
  },
  h5: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
    color: "#111111",
  },
  h6: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
    color: "#111111",
  },
  paragraph: {
    marginBottom: 6,
  },
  blockquote: {
    marginVertical: 6,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#cccccc",
    color: "#555555",
  },
  list: {
    marginVertical: 6,
    paddingLeft: 4,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 2,
  },
  listMarker: {
    width: 16,
    fontSize: 11,
  },
  listContent: {
    flex: 1,
  },
  hr: {
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
    marginVertical: 12,
  },
  code: {
    fontFamily: "Courier",
    fontSize: 10,
    backgroundColor: "#f4f4f5",
  },
  pre: {
    fontFamily: "Courier",
    fontSize: 9.5,
    backgroundColor: "#f4f4f5",
    padding: 8,
    marginVertical: 6,
  },
  link: {
    color: "#1f3a8a",
    textDecoration: "underline",
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  italic: {
    fontFamily: "Helvetica-Oblique",
  },
  strike: {
    textDecoration: "line-through",
  },
  table: {
    marginVertical: 8,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#cccccc",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableHeaderRow: {
    backgroundColor: "#f4f4f5",
  },
  tableCell: {
    flex: 1,
    padding: 5,
    fontSize: 10,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#cccccc",
  },
  tableCellLast: {},
  tableCellHeader: {
    fontFamily: "Helvetica-Bold",
  },
});

const HEADING_STYLES = {
  1: styles.h1,
  2: styles.h2,
  3: styles.h3,
  4: styles.h4,
  5: styles.h5,
  6: styles.h6,
} as const;
