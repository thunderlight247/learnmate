'use client';

import { useCallback, useState } from 'react';
import { RotateCw } from 'lucide-react';

interface Flashcard {
  id: string;
  front: string;
  back: string;
}

interface FlashcardsTabProps {
  workspaceId: string | null;
}

const RATINGS: Array<{ quality: number; label: string }> = [
  { quality: 0, label: 'Blackout' },
  { quality: 2, label: 'Hard' },
  { quality: 3, label: 'Good' },
  { quality: 5, label: 'Easy' },
];

export default function FlashcardsTab({ workspaceId }: FlashcardsTabProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/flashcards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate flashcards.');
      setCards(data.flashcards as Flashcard[]);
      setIndex(0);
      setFlipped(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate flashcards.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const review = async (quality: number) => {
    const card = cards[index];
    if (!card) return;
    setFlipped(false);
    setIndex((i) => i + 1);
    try {
      await fetch('/api/flashcards/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flashcardId: card.id, quality }),
      });
    } catch {
      // The rating is best-effort; the card still advances.
    }
  };

  if (!workspaceId) {
    return <p className="p-4 text-sm text-gray-500">Upload a document to create flashcards.</p>;
  }

  const card = cards[index];
  const done = cards.length > 0 && index >= cards.length;

  return (
    <div className="flex flex-col gap-4 p-4">
      {cards.length === 0 && (
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate flashcards'}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {card && (
        <>
          <p className="text-xs text-gray-500">
            Card {index + 1} of {cards.length}
          </p>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="min-h-[180px] rounded-xl border border-gray-200 bg-white p-6 text-center text-base text-gray-900 shadow-sm"
          >
            {flipped ? card.back : card.front}
          </button>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="flex items-center gap-1 self-start text-xs text-gray-600 hover:text-gray-900"
          >
            <RotateCw className="h-3 w-3" /> Flip
          </button>
          {flipped && (
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.quality}
                  type="button"
                  onClick={() => review(r.quality)}
                  className="rounded-lg border border-gray-200 px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {r.label} ({r.quality})
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {done && (
        <div className="flex flex-col gap-2 text-sm text-gray-700">
          <p>You reviewed all {cards.length} cards.</p>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate more'}
          </button>
        </div>
      )}
    </div>
  );
}
