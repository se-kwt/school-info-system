"use client";

import { useState } from "react";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

interface SyllabusVersionRow {
  id: number;
  versionNum: number;
  title: string;
  content: string;
  fileUrl: string | null;
  fileName: string | null;
  isCurrent: boolean;
  createdByName: string;
  createdAt: string;
}

async function uploadSyllabusFile(
  file: File
): Promise<{ ok: true; fileUrl: string; fileName: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/subjects/upload", { method: "POST", body: formData });
  const body = await response.json();
  if (!response.ok) {
    return { ok: false, error: body.error };
  }
  return { ok: true, fileUrl: body.url, fileName: body.name };
}

export function SyllabusHistoryView({
  subjectId,
  subjectName,
  initialVersions,
}: {
  subjectId: number;
  subjectName: string;
  initialVersions: SyllabusVersionRow[];
}) {
  const [versions, setVersions] = useState(initialVersions);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function refresh() {
    const response = await fetch(`/api/subjects/${subjectId}/syllabus-versions`);
    setVersions(await response.json());
  }

  async function handleCreate() {
    setError(null);
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required");
      return;
    }

    await run(async () => {
      let fileUrl: string | undefined;
      let fileName: string | undefined;
      if (file) {
        const uploadResult = await uploadSyllabusFile(file);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        fileUrl = uploadResult.fileUrl;
        fileName = uploadResult.fileName;
      }

      const response = await fetch(`/api/subjects/${subjectId}/syllabus-versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, content, fileUrl, fileName }),
      });
      if (response.status === 201) {
        setTitle("");
        setContent("");
        setFile(null);
        await refresh();
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-500">Syllabus history for {subjectName}</p>

      <div className="mt-3 flex flex-col gap-2 rounded border border-gray-200 p-3">
        <input
          type="text"
          aria-label="Version title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="e.g. Term 1 revision"
        />
        <textarea
          aria-label="Version content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          rows={4}
          placeholder="Units, topics, notes…"
        />
        <input
          type="file"
          aria-label="Attach file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={isSubmitting}
          className="w-fit rounded bg-blue-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Publishing…" : "Publish Version"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {versions.map((version) => (
          <li key={version.id} className="rounded border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-gray-800">
                <span>
                  v{version.versionNum} · <span>{version.title}</span>
                </span>
                {version.isCurrent && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                    Current
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-400">
                {version.createdByName} · {new Date(version.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{version.content}</p>
            {version.fileUrl && (
              <a href={version.fileUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-blue-600 underline">
                {version.fileName ?? "View attachment"}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
