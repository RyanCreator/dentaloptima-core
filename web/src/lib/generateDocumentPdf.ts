// Thin entry-point for PDF generation. The actual renderer + its heavy
// dependency chain (@react-pdf/renderer + pdfkit + unified + remark) is
// in `./generateDocumentPdf.impl`. Vite code-splits the dynamic import,
// so the main bundle stays lean and the PDF code only loads when an
// operator clicks Download PDF.

export interface GeneratePdfArgs {
  title: string;
  bodyMarkdown: string;
}

export async function generateDocumentPdf(args: GeneratePdfArgs): Promise<void> {
  const { renderPdf } = await import("./generateDocumentPdf.impl");
  return renderPdf(args);
}
