import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — LOST AT SQL` : 'LOST AT SQL — Operation: Black Cipher';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
