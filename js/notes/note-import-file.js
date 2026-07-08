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

/**
 * Whether a drag event carries files (vs text selection).
 * @param {DragEvent} event
 * @returns {boolean}
 */
export function dragEventHasFiles(event) {
  const types = event?.dataTransfer?.types;
  if (!types) {
    return false;
  }

  return Array.from(types).includes("Files");
}

/**
 * Bind drag-and-drop markdown file ingest on a target element.
 * @param {HTMLElement} target
 * @param {object} options
 * @param {(payload: { text: string, filename: string, size: number, file: File }) => void|Promise<void>} options.onText
 * @param {(message: string) => void} [options.onError]
 * @param {string} [options.dragOverClass]
 * @param {string} [options.rejectMessage]
 * @returns {() => void} cleanup
 */
export function bindMarkdownFileDrop(target, options = {}) {
  if (!target || typeof options.onText !== "function") {
    return () => {};
  }

  const dragOverClass = options.dragOverClass || "import-drag-over";
  const rejectMessage =
    options.rejectMessage ||
    "Drop a .md, .markdown, or .txt file onto this panel.";

  function clearDragOver() {
    target.classList.remove(dragOverClass);
  }

  function onDragOver(event) {
    if (!dragEventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    target.classList.add(dragOverClass);
  }

  function onDragLeave(event) {
    if (!target.contains(event.relatedTarget)) {
      clearDragOver();
    }
  }

  async function onDrop(event) {
    if (!dragEventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    clearDragOver();

    const file = pickMarkdownFile(event.dataTransfer?.files);
    if (!file) {
      options.onError?.(rejectMessage);
      return;
    }

    try {
      const payload = await readMarkdownFile(file);
      await options.onText({ ...payload, file });
    } catch (err) {
      options.onError?.(err.message || "Could not load file.");
    }
  }

  target.addEventListener("dragover", onDragOver);
  target.addEventListener("dragleave", onDragLeave);
  target.addEventListener("drop", onDrop);

  return () => {
    target.removeEventListener("dragover", onDragOver);
    target.removeEventListener("dragleave", onDragLeave);
    target.removeEventListener("drop", onDrop);
    clearDragOver();
  };
}
