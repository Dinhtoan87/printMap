import type { Action } from 'svelte/action';
import type { WidgetOffset } from '@printmap/shared';

interface DragParams {
  /** Offset ban đầu; sẽ được cập nhật khi kéo. */
  offset: WidgetOffset;
  /** Bật/tắt kéo-thả (tắt ở chế độ /print). */
  enabled?: boolean;
  /**
   * Hệ số thu nhỏ của bản vẽ trên màn hình (transform: scale ở khung xem trước).
   * Delta chuột theo px màn hình phải chia cho hệ số này để ra px trong khung in.
   */
  scale?: number;
  /** Callback khi offset thay đổi. */
  onChange?: (offset: WidgetOffset) => void;
}

/**
 * Kéo-thả bằng Pointer Events (thay interact.js — interact.js không bù được
 * transform: scale của khung xem trước nên "kéo không nhúc nhích").
 * Chỉ kéo khi bấm vào .drag-handle; bù tỉ lệ để con trỏ bám sát widget.
 */
export const draggable: Action<HTMLElement, DragParams> = (node, params) => {
  let current: DragParams = params;

  const apply = (x: number, y: number) => {
    node.style.transform = `translate(${x}px, ${y}px)`;
  };
  apply(current.offset.x, current.offset.y);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startOffX = 0;
  let startOffY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (current.enabled === false) return;
    const target = e.target as HTMLElement | null;
    if (!target || !target.closest('.drag-handle')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startOffX = current.offset.x;
    startOffY = current.offset.y;
    node.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const s = current.scale && current.scale > 0 ? current.scale : 1;
    const next: WidgetOffset = {
      x: startOffX + (e.clientX - startX) / s,
      y: startOffY + (e.clientY - startY) / s
    };
    current.offset = next;
    apply(next.x, next.y);
    current.onChange?.(next);
  };

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      node.releasePointerCapture(e.pointerId);
    } catch {
      /* con trỏ có thể đã mất capture */
    }
  };

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', endDrag);
  node.addEventListener('pointercancel', endDrag);

  return {
    update(next: DragParams) {
      current = next;
      if (!dragging) apply(current.offset.x, current.offset.y);
    },
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', endDrag);
      node.removeEventListener('pointercancel', endDrag);
    }
  };
};
