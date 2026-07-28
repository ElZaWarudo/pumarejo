export type CleanupAction = () => Promise<void>;

interface CleanupEntry {
  readonly label: string;
  readonly action: CleanupAction;
}

export class CleanupStack {
  readonly #entries: CleanupEntry[] = [];

  get pendingLabels(): readonly string[] {
    return this.#entries.map((entry) => entry.label);
  }

  add(label: string, action: CleanupAction): void {
    this.#entries.push({ label, action });
  }

  async run(): Promise<void> {
    const failures: unknown[] = [];
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      const entry = this.#entries[index];
      if (entry === undefined) continue;
      try {
        await entry.action();
        this.#entries.splice(index, 1);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Owned resource cleanup failed.");
    }
  }
}
