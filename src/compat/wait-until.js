export class BackgroundTasks {
  constructor() {
    this.pending = new Set();
  }

  run(promise) {
    const tracked = Promise.resolve(promise)
      .catch((error) => console.error("[background]", error))
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    return tracked;
  }

  context() {
    return { waitUntil: (promise) => this.run(promise) };
  }

  async drain(timeoutMs = 10_000) {
    const all = Promise.allSettled([...this.pending]);
    let timer;
    try {
      await Promise.race([
        all,
        new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
