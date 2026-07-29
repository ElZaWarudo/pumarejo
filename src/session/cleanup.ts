export type CleanupAction = () => Promise<void>;

export const SESSION_CLEANUP_LABELS = [
  "provider-port-reservation",
  "runtime-configuration",
  "application-process",
  "authenticated-proxy",
  "webdriver-session",
] as const;

export type CleanupLabel = (typeof SESSION_CLEANUP_LABELS)[number];

interface CleanupEntry {
  readonly label: CleanupLabel;
  readonly action: CleanupAction;
}

export class CleanupStack {
  readonly #entries: CleanupEntry[] = [];

  get pendingLabels(): readonly CleanupLabel[] {
    return this.#entries.map((entry) => entry.label);
  }

  add(label: CleanupLabel, action: CleanupAction): void {
    this.#entries.push({ label, action });
  }

  complete(label: CleanupLabel): void {
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      if (this.#entries[index]?.label === label) {
        this.#entries.splice(index, 1);
        return;
      }
    }
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
