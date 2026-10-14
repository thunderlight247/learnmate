// Single source of truth for the upload size limit, shared by the
// FileUpload UI and every upload route (analyze, documents/process).
// Keep in sync with next.config.ts's proxyClientMaxBodySize, which must
// stay >= this value so uploads aren't buffered short.

export const MAX_FILE_SIZE_MB = 200;

export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024; // 209715200 bytes
