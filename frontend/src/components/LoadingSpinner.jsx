import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ fullScreen, size = 8 }) {
  const content = (
    <div className="flex items-center justify-center">
      <Loader2 className={`w-${size} h-${size} text-indigo-600 animate-spin`} />
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  return content;
}
