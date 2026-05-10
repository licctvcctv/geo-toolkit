type ScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

type ScrollableContainer = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

const BOTTOM_THRESHOLD_PX = 24;

export function isChatNearBottom(
  { scrollTop, clientHeight, scrollHeight }: ScrollMetrics,
  threshold = BOTTOM_THRESHOLD_PX
): boolean {
  return scrollTop + clientHeight >= scrollHeight - threshold;
}

export function scrollChatContainerToBottom(container: ScrollableContainer | null): void {
  if (!container) return;
  container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
}
