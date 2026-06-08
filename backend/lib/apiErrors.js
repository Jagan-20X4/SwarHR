/** Map thrown errors to HTTP status + safe client message. */

function isS3AccessDenied(err) {
  return (
    err &&
    (err.name === "AccessDenied" ||
      err.Code === "AccessDenied" ||
      err.code === "S3_ACCESS_DENIED" ||
      String(err.message || "").includes("AccessDenied") ||
      String(err.message || "").includes("not authorized to perform"))
  );
}

function wrapS3Error(err) {
  if (!isS3AccessDenied(err)) return err;
  const e = new Error(
    "CV storage failed: AWS IAM user lacks s3:PutObject permission on the attachments bucket. Ask your AWS admin to grant PutObject, GetObject, and DeleteObject on arn:aws:s3:::swar-hr/*",
  );
  e.status = 503;
  e.code = "S3_ACCESS_DENIED";
  return e;
}

function clientErrorPayload(err) {
  if (err.code === "S3_ACCESS_DENIED" || isS3AccessDenied(err)) {
    const wrapped = wrapS3Error(err);
    return {
      status: 503,
      body: {
        error: wrapped.message,
        code: "S3_ACCESS_DENIED",
      },
    };
  }
  const status = err.status || 500;
  if (status === 403) {
    return { status: 403, body: { error: "Forbidden" } };
  }
  if (status === 404) {
    return { status: 404, body: { error: "Not found" } };
  }
  if (status === 400) {
    return { status: 400, body: { error: String(err.message || "Bad request") } };
  }
  if (status === 409) {
    return {
      status: 409,
      body: {
        error: String(err.message || "Conflict"),
        ...(err.code ? { code: err.code } : {}),
        ...(err.daysRemaining != null ? { daysRemaining: err.daysRemaining } : {}),
        ...(err.eligibleAt ? { eligibleAt: err.eligibleAt } : {}),
      },
    };
  }
  if (status === 429) {
    return { status: 429, body: { error: String(err.message || "Too many requests") } };
  }
  return {
    status: 500,
    body: {
      error: "Internal server error",
      ...(process.env.NODE_ENV !== "production" && err.message
        ? { detail: String(err.message) }
        : {}),
    },
  };
}

function sendApiError(res, err) {
  const { status, body } = clientErrorPayload(err);
  res.status(status).json(body);
}

module.exports = {
  isS3AccessDenied,
  wrapS3Error,
  clientErrorPayload,
  sendApiError,
};
