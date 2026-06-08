const {
  isS3Configured,
  buildAttachmentKey,
  uploadAttachment,
  deleteAttachment,
  presignedDownloadUrl,
} = require("./s3Attachments");

function apiAttachmentDownloadUrl(s3Key) {
  if (!s3Key) return null;
  return `/api/attachments/download?key=${encodeURIComponent(s3Key)}`;
}
const { isS3AccessDenied } = require("./apiErrors");

function s3FallbackToDbEnabled() {
  const raw = process.env.S3_ATTACHMENTS_FALLBACK_TO_DB;
  if (raw == null || String(raw).trim() === "") return true;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isS3UploadFailure(err) {
  return (
    isS3AccessDenied(err) ||
    err?.name === "Forbidden" ||
    err?.Code === "Forbidden" ||
    err?.$metadata?.httpStatusCode === 403
  );
}

function stripBase64Prefix(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const i = dataUrl.indexOf("base64,");
  if (i === -1) return dataUrl;
  return dataUrl.slice(i + 7);
}

function isFreshDataUrl(dataUrl) {
  return typeof dataUrl === "string" && dataUrl.startsWith("data:");
}

async function cvFileFromDbRow(row) {
  if (!row) return null;
  const base = {
    name: row.file_name || "resume",
    mime: row.mime_type || "",
    ext: (row.file_ext || "").toLowerCase(),
    size: Number(row.size_bytes || 0),
  };

  const s3Key = row.s3_key || null;
  if (s3Key) {
    const presigned = await presignedDownloadUrl(s3Key);
    const downloadUrl = presigned || apiAttachmentDownloadUrl(s3Key);
    return {
      ...base,
      s3Key,
      downloadUrl: downloadUrl || undefined,
    };
  }

  if (row.file_data_base64) {
    const mime = row.mime_type || "application/octet-stream";
    return {
      ...base,
      dataUrl: `data:${mime};base64,${row.file_data_base64}`,
    };
  }

  return null;
}

const CV_SELECT_WITH_S3 = `file_name, mime_type, file_ext, size_bytes, file_data_base64, s3_key`;

/**
 * Resolve CV bytes/key from client payload and persist to S3 when configured.
 * @returns {{ s3Key: string|null, base64: string|null, oldKeyToDelete: string|null }}
 */
async function resolveCvUpload(category, ownerId, cvFile, existingS3Key) {
  if (!cvFile) {
    return { s3Key: null, base64: null, oldKeyToDelete: null };
  }

  const existingKey =
    cvFile.s3Key || existingS3Key || null;

  if (isFreshDataUrl(cvFile.dataUrl)) {
    const b64 = stripBase64Prefix(cvFile.dataUrl);
    if (!b64) {
      return { s3Key: existingKey, base64: null, oldKeyToDelete: null };
    }
    const body = Buffer.from(b64, "base64");
    if (isS3Configured()) {
      const key = buildAttachmentKey(
        category,
        ownerId,
        cvFile.name || "resume",
      );
      try {
        await uploadAttachment({
          key,
          body,
          contentType: cvFile.mime || "application/octet-stream",
        });
        const oldKeyToDelete =
          existingKey && existingKey !== key ? existingKey : null;
        return { s3Key: key, base64: null, oldKeyToDelete };
      } catch (err) {
        if (s3FallbackToDbEnabled() && isS3UploadFailure(err)) {
          console.warn(
            "[cvStorage] S3 upload failed; storing CV in PostgreSQL instead.",
            err.message || err,
          );
          return { s3Key: null, base64: b64, oldKeyToDelete: null };
        }
        throw err;
      }
    }
    return { s3Key: null, base64: b64, oldKeyToDelete: null };
  }

  if (existingKey) {
    return { s3Key: existingKey, base64: null, oldKeyToDelete: null };
  }

  if (cvFile.dataUrl && !isFreshDataUrl(cvFile.dataUrl)) {
    return {
      s3Key: null,
      base64: stripBase64Prefix(cvFile.dataUrl),
      oldKeyToDelete: null,
    };
  }

  return { s3Key: null, base64: null, oldKeyToDelete: null };
}

async function insertCvAttachmentRow(client, table, idColumn, ownerId, cvFile, resolved) {
  const { s3Key, base64 } = resolved;
  if (!s3Key && !base64) return;

  if (table === "cv_attachment") {
    try {
      await client.query(
        `INSERT INTO cv_attachment (candidate_id, file_name, mime_type, file_ext, size_bytes, file_data_base64, s3_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          ownerId,
          cvFile.name || "file",
          cvFile.mime || "",
          (cvFile.ext || "").replace(/^\./, ""),
          cvFile.size || 0,
          base64,
          s3Key,
        ],
      );
    } catch (e) {
      if (e.code === "42703") {
        await client.query(
          `INSERT INTO cv_attachment (candidate_id, file_name, mime_type, file_ext, size_bytes, file_data_base64)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            ownerId,
            cvFile.name || "file",
            cvFile.mime || "",
            (cvFile.ext || "").replace(/^\./, ""),
            cvFile.size || 0,
            base64,
          ],
        );
      } else {
        throw e;
      }
    }
    return;
  }

  try {
    await client.query(
      `INSERT INTO talent_pool_cv_file (talent_pool_id, file_name, mime_type, file_ext, size_bytes, file_data_base64, s3_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        ownerId,
        cvFile.name || "file",
        cvFile.mime || "",
        (cvFile.ext || "").replace(/^\./, ""),
        cvFile.size || 0,
        base64,
        s3Key,
      ],
    );
  } catch (e) {
    if (e.code === "42703") {
      await client.query(
        `INSERT INTO talent_pool_cv_file (talent_pool_id, file_name, mime_type, file_ext, size_bytes, file_data_base64)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          ownerId,
          cvFile.name || "file",
          cvFile.mime || "",
          (cvFile.ext || "").replace(/^\./, ""),
          cvFile.size || 0,
          base64,
        ],
      );
    } else {
      throw e;
    }
  }
}

module.exports = {
  CV_SELECT_WITH_S3,
  cvFileFromDbRow,
  resolveCvUpload,
  insertCvAttachmentRow,
  deleteAttachment,
  stripBase64Prefix,
  isFreshDataUrl,
};
