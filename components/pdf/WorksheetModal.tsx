'use client';

import React, { useState } from 'react';
import { FileUp, X, Check, Image as ImageIcon, FileText } from 'lucide-react';

interface WorksheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertWorksheet: (dataUrl: string, fileName: string, isLocked: boolean) => void;
}

export const WorksheetModal: React.FC<WorksheetModalProps> = ({
  isOpen,
  onClose,
  onInsertWorksheet,
}) => {
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    dataUrl: string;
    isPdf: boolean;
  } | null>(null);

  const [isLocked, setIsLocked] = useState(true);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSelectedFile({
        name: file.name,
        size: file.size,
        dataUrl,
        isPdf: file.type === 'application/pdf',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (!selectedFile) return;
    onInsertWorksheet(selectedFile.dataUrl, selectedFile.name, isLocked);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <FileUp className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Import Math Worksheet or Image
              </h3>
              <p className="text-xs text-slate-500">
                Annotate, circle problem regions, and solve with Gemma 4
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload Zone */}
        <div className="p-6 space-y-4">
          {!selectedFile ? (
            <label className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-400 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-950/40">
              <FileUp className="w-10 h-10 text-slate-400 mb-3" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Choose a PDF or math worksheet image
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Supports PNG, JPEG, WebP, PDF (up to 20MB)
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                    {selectedFile.isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-xs">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-xs text-rose-500 hover:underline"
                >
                  Change
                </button>
              </div>

              {/* Preview thumbnail if image */}
              {!selectedFile.isPdf && (
                <div className="max-h-48 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 flex items-center justify-center">
                  <img
                    src={selectedFile.dataUrl}
                    alt="Worksheet Preview"
                    className="max-h-48 object-contain"
                  />
                </div>
              )}

              {/* Lock as background toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    Lock as Canvas Background
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Prevents moving the worksheet while writing notes over it
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isLocked}
                  onChange={(e) => setIsLocked(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedFile}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md disabled:opacity-50 transition-all"
          >
            <Check className="w-4 h-4" />
            Place on Canvas
          </button>
        </div>
      </div>
    </div>
  );
};
