/** Component-owned single flight. Never cancels requests in a shared cache. */
export class LocalRequestLane {
  private active?: { key: string; controller: AbortController; promise: Promise<void> };

  run(key: string, work: (controller: AbortController) => Promise<void>): Promise<void> {
    if (this.active?.key === key) return this.active.promise;
    this.cancel();
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => {
      if (!controller.signal.aborted) return work(controller);
    }).finally(() => {
      if (this.active?.controller === controller) this.active = undefined;
    });
    this.active = { key, controller, promise };
    return promise;
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = undefined;
  }
}
