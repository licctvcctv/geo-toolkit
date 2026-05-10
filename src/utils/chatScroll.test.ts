import assert from 'node:assert/strict';
import test from 'node:test';

import { isChatNearBottom, scrollChatContainerToBottom } from './chatScroll';

test('isChatNearBottom returns true when the user is already near the bottom', () => {
  assert.equal(
    isChatNearBottom({ scrollTop: 520, clientHeight: 360, scrollHeight: 900 }),
    true
  );
});

test('isChatNearBottom returns false when the user has scrolled away from the bottom', () => {
  assert.equal(
    isChatNearBottom({ scrollTop: 180, clientHeight: 360, scrollHeight: 900 }),
    false
  );
});

test('scrollChatContainerToBottom only updates the inner scroll container', () => {
  const container = {
    scrollTop: 0,
    clientHeight: 360,
    scrollHeight: 1280,
  };

  scrollChatContainerToBottom(container);

  assert.equal(container.scrollTop, 920);
});

test('scrollChatContainerToBottom does not create blank space for short content', () => {
  const container = {
    scrollTop: 120,
    clientHeight: 440,
    scrollHeight: 360,
  };

  scrollChatContainerToBottom(container);

  assert.equal(container.scrollTop, 0);
});
