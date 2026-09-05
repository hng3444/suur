/** One history guard for every overlay. Only the foremost layer handles Back. */
export class BackLayers {
  private layers = new Map<symbol, { priority: number; close: () => void }>();
  private armed = false;
  private consuming = false;
  private port: { push: () => void; back: () => void };
  constructor(port: { push: () => void; back: () => void }) { this.port = port; }

  add(priority: number, close: () => void) {
    const id = Symbol();
    this.layers.set(id, { priority, close });
    this.arm();
    return () => {
      this.layers.delete(id);
      // StrictMode immediately re-registers effects. Wait before consuming the guard.
      queueMicrotask(() => {
        if (!this.layers.size && this.armed && !this.consuming) {
          this.armed = false;
          this.consuming = true;
          this.port.back();
        }
      });
    };
  }

  private arm() {
    if (this.layers.size && !this.armed && !this.consuming) {
      this.port.push();
      this.armed = true;
    }
  }

  back() {
    const top = [...this.layers.values()].sort((a, b) => b.priority - a.priority)[0];
    top?.close();
  }

  popped() {
    if (this.consuming) {
      this.consuming = false;
      this.arm();
      return;
    }
    this.armed = false;
    this.arm();
    this.back();
  }
}
