export default function Pager({
  page,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: {
  page: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}
    >
      <button disabled={!canGoPrev} onClick={onPrev}>
        Previous
      </button>
      <span>Page {page}</span>
      <button disabled={!canGoNext} onClick={onNext}>
        Next
      </button>
    </div>
  );
}
