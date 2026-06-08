const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");
const path = require("path");

let _client = null;

function bucket() {
  return (
    (process.env.S3_ATTACHMENTS_BUCKET &&
      String(process.env.S3_ATTACHMENTS_BUCKET).trim()) ||
    ""
  );
}

function keyPrefix() {
  const raw = process.env.S3_ATTACHMENTS_KEY_PREFIX;
  if (raw == null || String(raw).trim() === "") return "";
  const p = String(raw).trim().replace(/^\/+|\/+$/g, "");
  return p ? `${p}/` : "";
}

function region() {
  return (
    (process.env.AWS_REGION && String(process.env.AWS_REGION).trim()) ||
    "ap-south-1"
  );
}

function publicBaseUrl() {
  const raw = process.env.S3_ATTACHMENTS_PUBLIC_BASE_URL;
  if (raw == null || String(raw).trim() === "") return "";
  return String(raw).trim().replace(/\/+$/, "");
}

function objectsArePublic() {
  const raw = process.env.S3_ATTACHMENTS_OBJECTS_ARE_PUBLIC;
  if (raw == null || String(raw).trim() === "") return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isS3Configured() {
  return Boolean(bucket() && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function getClient() {
  if (!isS3Configured()) return null;
  if (!_client) {
    _client = new S3Client({
      region: region(),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

function sanitizeFileName(name) {
  const base = path.basename(String(name || "file"));
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 200);
  return cleaned || "file";
}

/** Build S3 object key: {prefix}{category}/{ownerId}/{unique}-{filename} */
function buildAttachmentKey(category, ownerId, fileName) {
  const safeId = String(ownerId || "unknown").replace(/[^\w.-]+/g, "_").slice(0, 64);
  const unique = crypto.randomBytes(4).toString("hex");
  const fname = sanitizeFileName(fileName);
  return `${keyPrefix()}${category}/${safeId}/${unique}-${fname}`;
}

async function uploadAttachment({ key, body, contentType }) {
  const client = getClient();
  if (!client) {
    throw new Error("S3 attachments not configured (S3_ATTACHMENTS_BUCKET, AWS credentials)");
  }
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return key;
}

async function deleteAttachment(key) {
  if (!key || !isS3Configured()) return;
  const client = getClient();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: key,
      }),
    );
  } catch (err) {
    console.error("S3 delete failed", key, err.message || err);
  }
}

function publicUrlForKey(key) {
  const base = publicBaseUrl();
  if (!base || !key) return null;
  return `${base}/${String(key).replace(/^\/+/, "")}`;
}

async function presignedDownloadUrl(key, expiresInSec = 3600) {
  if (!key) return null;
  // Only skip signing when objects are truly world-readable (CDN or public bucket).
  if (objectsArePublic()) {
    const direct = publicUrlForKey(key);
    if (direct) return direct;
  }
  const client = getClient();
  if (!client) return null;
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
      }),
      { expiresIn: expiresInSec },
    );
  } catch (err) {
    console.error("S3 presigned URL failed", key, err.message || err);
    return null;
  }
}

async function getAttachmentBuffer(key) {
  const client = getClient();
  if (!client || !key) return null;
  const out = await client.send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
  const chunks = [];
  for await (const chunk of out.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = {
  isS3Configured,
  buildAttachmentKey,
  uploadAttachment,
  deleteAttachment,
  presignedDownloadUrl,
  getAttachmentBuffer,
  publicUrlForKey,
  objectsArePublic,
  bucket,
};
