// One-shot generator for sample.docx + sample.xlsx using the deps we
// already installed (xlsx + jszip). docx is built as a minimal raw zip
// with the OOXML structure mammoth needs.
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import JSZip from "jszip";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node gen-office-samples.mjs <outDir>");
  process.exit(1);
}

// XLSX
{
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Metric", "Q1", "Q2", "Q3", "Q4"],
    ["Signups", 120, 180, 240, 310],
    ["Activations", 95, 150, 210, 280],
    ["Revenue ($)", 4200, 6300, 8400, 10500],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Numbers");
  const ws2 = XLSX.utils.aoa_to_sheet([
    ["Note"],
    ["Sample workbook for SEO Office viewer verification."],
    ["Two sheets, four columns, four rows on Sheet 1."],
  ]);
  XLSX.utils.book_append_sheet(wb, ws2, "Notes");
  XLSX.writeFile(wb, path.join(outDir, "sample.xlsx"));
}

// DOCX — minimal OOXML structure that mammoth can read.
{
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>SEO Office — Sample Document</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is a minimal docx generated to verify the in-browser viewer (mammoth.convertToHtml). It contains a heading, a body paragraph, and a second paragraph.</w:t></w:r></w:p>
    <w:p><w:r><w:t>If you can read this rendered inside an OS window, the docx viewer works end-to-end.</w:t></w:r></w:p>
  </w:body>
</w:document>`,
  );
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(path.join(outDir, "sample.docx"), buf);
}

console.log("samples ok");
