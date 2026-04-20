export function detectViewerType(mimeType?: string, fileName?: string, rawText?: string) {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpg|jpeg|webp|bmp|gif|tiff)$/.test(name)) return "image";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime.includes("csv") ||
    /\.(xlsx|xls|csv)$/.test(name)
  ) return "spreadsheet";
  if (mime.includes("xml") || /\.(xml|idoc)$/.test(name)) return "xml";
  if (mime.includes("html") || name.endsWith(".eml") || name.endsWith(".msg")) return "email";
  if (/\.(x12|edi|edifact|txt)$/.test(name)) {
    const text = rawText || "";
    if (text.includes("UNH+") || text.includes("UNB+")) return "edi";
    if (text.includes("ISA*") || text.includes("GS*") || text.includes("ST*")) return "edi";
  }
  if (rawText && (rawText.includes("ISA*") || rawText.includes("GS*") || rawText.includes("UNH+") || rawText.includes("UNB+"))) {
    return "edi";
  }
  return "text";
}

export function formatXml(xml?: string): string {
  if (!xml) return "";
  const PADDING = "  ";
  const reg = /(>)(<)(\/*)/g;
  let formatted = "";
  let pad = 0;

  xml = xml.replace(reg, "$1\n$2$3");
  for (const node of xml.split("\n")) {
    let indent = 0;
    if (node.match(/^<\/\w/)) {
      if (pad !== 0) pad -= 1;
    } else if (node.match(/^<\w([^>]*[^/])?>.*$/)) {
      indent = 1;
    }
    formatted += PADDING.repeat(pad) + node + "\n";
    pad += indent;
  }
  return formatted.trim();
}

export function safeJsonParse(input?: string): unknown | null {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}