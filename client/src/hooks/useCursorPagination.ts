import { useState } from 'react';

// Manages the "after" cursor stack for a Prev/Next paged list backed by the
// API's ?after=<uuid>&limit=<n> convention (X-Next-Cursor response header).
// Pushing a page's next cursor lets you go forward; popping the stack lets
// you go back to a cursor you've already seen, with no extra requests.
export function useCursorPagination() {
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const pageIndex = cursorStack.length - 1;
  const after = cursorStack[pageIndex];

  function goNext(nextCursor: string | null | undefined) {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, nextCursor]);
  }

  function goPrev() {
    setCursorStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
  }

  function reset() {
    setCursorStack([undefined]);
  }

  return {
    after,
    page: pageIndex + 1,
    canGoPrev: pageIndex > 0,
    goNext,
    goPrev,
    reset,
  };
}
