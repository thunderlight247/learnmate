'use client';

// Small uploader component that validates the selected file and forwards only valid PDF uploads.
import { useRef } from 'react';
import { UploadCloud } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function FileUpload({
  onFileSelect,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF document.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert('The PDF must be 10 MB or smaller.');
      e.target.value = '';
      return;
    }

    onFileSelect(file);

    // Allow the same file to be selected again later.
    e.target.value = '';
  };

  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      className="w-full max-w-md border-2 border-dashed border-gray-300 rounded-xl p-12 flex flex-col items-center text-center hover:bg-gray-50 transition-colors cursor-pointer"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf"
        className="hidden"
      />

      <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />

      <h3 className="text-lg font-semibold mb-2">
        Upload Lecture Material
      </h3>

      <p className="text-sm text-gray-500 mb-6">
        PDF documents only (max 10 MB)
      </p>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          fileInputRef.current?.click();
        }}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        Select PDF
      </button>
    </div>
  );
}