/**
 * Client-side markdown file read for canonical note import.
 */

export const MAX_MARKDOWN_FILE_BYTES = 2 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = [".md", ".markdown", ".txt"];

export function stripUtf8Bom(text) {
  return String(text ?? "").replace(/^\uFEFF/, "");
}

export function normalizeImportedMarkdown(text) {
  return stripUtf8Bom(String(text ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export function isMarkdownFile(file) {
  if (!file) {
    return false;
  }

  const name = String(file.name ?? "").toLowerCase();
  if (ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return true;
  }

  const type = String(file.type ?? "").toLowerCase();
  return type === "text/markdown" || type === "text/plain";
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsText(file, "UTF-8");
  });
}

/**
 * @param {File} file
 * @returns {Promise<{ text: string, filename: string, size: number }>}
 */
export async function readMarkdownFile(file) {
  if (!file) {
    throw new Error("No file selected.");
  }

  if (!isMarkdownFile(file)) {
    throw new Error("Choose a .md, .markdown, or .txt file.");
  }

  if (file.size > MAX_MARKDOWN_FILE_BYTES) {
    throw new Error("File is too large (max 2 MB).");
  }

  const text = normalizeImportedMarkdown(await readFileAsText(file));

  if (!text.trim()) {
    throw new Error("File is empty.");
  }

  return {
    text,
    filename: file.name || "uploaded file",
    size: file.size,
  };
}

/**
 * @param {FileList|File[]} files
 * @returns {File|null}
 */
export function pickMarkdownFile(files) {
  if (!files?.length) {
    return null;
  }

  for (const file of files) {
    if (isMarkdownFile(file)) {
      return file;
    }
  }

  return null;
}
