"use client";

import { useState } from "react";

interface SyllabusVersionRow {
  id: number;
  versionNum: number;
  title: string;
  content: string;
  fileUrl: string | null;
  fileName: string | null;
  createdByName: string;
  createdAt: string;
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
  const [error, setError] = useState<string | null>(null);

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
    const response = await fetch(`/api/subjects/${subjectId}/syllabus-versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    if (response.status === 201) {
      setTitle("");
      setContent("");
      await refresh();
      return;
    }
    setError((await response.json()).error);
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
        <button
          type="button"
          onClick={handleCreate}
          className="w-fit rounded bg-blue-600 px-3 py-2 text-white"
        >
          Save New Version
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {versions.map((version) => (
          <li key={version.id} className="rounded border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800">
                v{version.versionNum} · {version.title}
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
