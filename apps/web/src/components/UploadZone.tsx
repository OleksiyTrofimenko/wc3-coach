"use client";

import { useState, useCallback, DragEvent, ChangeEvent, useRef } from "react";

interface UploadZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadZone({ onFile, disabled }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return;
      if (!file.name.endsWith(".w3g")) {
        alert("Please select a .w3g replay file.");
        return;
      }
      onFile(file);
    },
    [onFile, disabled]
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    // reset so same file can be re-uploaded
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      className={[
        "upload-zone",
        dragging ? "upload-zone--dragging" : "",
        disabled ? "upload-zone--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Upload .w3g replay file"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".w3g"
        onChange={onChange}
        style={{ display: "none" }}
        disabled={disabled}
      />

      <div className="upload-zone__icon">
        {/* WC3 scroll icon in ASCII art */}
        <span style={{ fontSize: "2.5rem", lineHeight: 1 }}>⚔</span>
      </div>

      <p className="upload-zone__title">
        {disabled ? "Analyzing..." : "Drop a .w3g replay here"}
      </p>
      <p className="upload-zone__sub">
        {disabled ? "Please wait" : "or click to browse — Orc replays only"}
      </p>

      <style>{`
        .upload-zone {
          border: 2px dashed var(--border-gold-bright);
          border-radius: 6px;
          background: var(--bg-raised);
          padding: 3rem 2rem;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
          user-select: none;
          outline: none;
        }
        .upload-zone:hover:not(.upload-zone--disabled),
        .upload-zone:focus:not(.upload-zone--disabled) {
          border-color: var(--gold);
          background: var(--bg-elevated);
          box-shadow: 0 0 24px rgba(200, 151, 42, 0.15);
        }
        .upload-zone--dragging {
          border-color: var(--gold-light);
          background: var(--bg-elevated);
          box-shadow: 0 0 40px rgba(200, 151, 42, 0.3);
        }
        .upload-zone--disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .upload-zone__icon {
          margin-bottom: 0.75rem;
          color: var(--gold-dim);
        }
        .upload-zone__title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }
        .upload-zone__sub {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
