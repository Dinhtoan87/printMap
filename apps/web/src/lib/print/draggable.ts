import interact from 'interactjs';
import type { Action } from 'svelte/action';
import type { WidgetOffset } from '@printmap/shared';

interface DragParams {
  /** Offset ban đầu; sẽ được cập nhật khi kéo. */
  offset: WidgetOffset;
  /** Bật/tắt kéo-thả (tắt ở chế độ /print). */
  enabled?: boolean;
  /** Selector vùng giới hạn kéo. */
  restrict?: string;
  /** Callback khi offset thay đổi. */
  onChange?: (offset: WidgetOffset) => void;
}

/**
 * Svelte action port từ khối interact('.draggable-element') trong layout.html:
 * chỉ kéo từ .drag-handle, giới hạn trong #a0-print-zone.
 */
export const draggable: Action<HTMLElement, DragParams> = (node, params) => {
  let current: DragParams = params;

  const apply = (x: number, y: number) => {
    node.style.transform = `translate(${x}px, ${y}px)`;
  };
  apply(current.offset.x, current.offset.y);

  const setup = () => {
    interact(node).unset();
    if (current.enabled === false) return;
    interact(node).draggable({
      allowFrom: '.drag-handle',
      modifiers: current.restrict
        ? [interact.modifiers.restrictRect({ restriction: current.restrict, endOnly: false })]
        : [],
      listeners: {
        move(event) {
          current.offset = {
            x: current.offset.x + event.dx,
            y: current.offset.y + event.dy
          };
          apply(current.offset.x, current.offset.y);
          current.onChange?.(current.offset);
        }
      }
    });
  };
  setup();

  return {
    update(next: DragParams) {
      current = next;
      apply(current.offset.x, current.offset.y);
      setup();
    },
    destroy() {
      interact(node).unset();
    }
  };
};
