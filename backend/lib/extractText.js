const crypto = require("crypto");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

function sniffMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.length >= 5 && buf.slice(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

function extFromName(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function allowedPair(mime, ext) {
  if (mime === "application/pdf" && ext === "pdf") return true;
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    ext === "docx"
  ) {
    return true;
  }
  return false;
}

async function extractText(buffer, mime) {
  if (mime === "application/pdf") {
    const data = await pdfParse(buffer);
    return String(data.text || "").replace(/\0/g, "");
  }
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const r = await mammoth.extractRawText({ buffer });
    return String(r.value || "").replace(/\0/g, "");
  }
  throw new Error("Unsupported type for extraction");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

module.exports = {
  sniffMime,
  extFromName,
  allowedPair,
  extractText,
  sha256Text,
};
