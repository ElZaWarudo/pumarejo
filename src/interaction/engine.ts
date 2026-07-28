import type { ClickInput, PressKeyInput, TypeInput } from "../mcp/schemas.js";
import type { SnapshotEngine } from "../observation/snapshot.js";
import type { ReferenceTable, SemanticReference } from "../observation/refs.js";
import { loadIdentityScript } from "../observation/snapshot-script.js";
import { PumarejoError } from "../shared/errors.js";
import { W3C_ELEMENT_KEY } from "../webdriver/protocol.js";
import { webdriverKey } from "./keys.js";
import { currentIdentitySchema, type CurrentIdentity } from "./schema.js";

interface InteractionWebDriver {
  execute(
    script: string,
    args: readonly unknown[],
    signal?: AbortSignal,
  ): Promise<unknown>;
  click(elementId: string, signal?: AbortSignal): Promise<void>;
  clear(elementId: string, signal?: AbortSignal): Promise<void>;
  type(elementId: string, text: string, signal?: AbortSignal): Promise<void>;
  pressKey(value: string, signal?: AbortSignal): Promise<void>;
}

export interface InteractionEngineOptions {
  readonly webdriver: InteractionWebDriver;
  readonly snapshot: Pick<SnapshotEngine, "interaction" | "references">;
  readonly identityScript?: () => Promise<string>;
}

export interface InteractionResult {
  readonly generation: number;
  readonly action: "click" | "type" | "pressKey";
  readonly ref?: string;
  readonly key?: PressKeyInput["key"];
  readonly cleared?: boolean;
}

function sameIdentity(
  reference: SemanticReference,
  current: CurrentIdentity,
): boolean {
  return (
    current.attached &&
    current.kind === reference.identity.kind &&
    current.role === reference.identity.role &&
    current.name === reference.identity.name &&
    current.inputType === reference.identity.inputType &&
    current.ownershipContext === reference.identity.ownershipContext
  );
}

export class InteractionEngine {
  readonly #webdriver: InteractionWebDriver;
  readonly #snapshot: Pick<SnapshotEngine, "interaction">;
  readonly #references: ReferenceTable;
  readonly #identityScript: () => Promise<string>;

  constructor(options: InteractionEngineOptions) {
    this.#webdriver = options.webdriver;
    this.#snapshot = options.snapshot;
    this.#references = options.snapshot.references;
    this.#identityScript = options.identityScript ?? loadIdentityScript;
  }

  click(input: ClickInput, signal?: AbortSignal): Promise<InteractionResult> {
    return this.#snapshot.interaction(async (refresh) => {
      const reference = await this.requireTarget(input.ref, "click", signal);
      await this.mutate(
        () => this.#webdriver.click(reference.elementId, signal),
        signal,
      );
      const generation = await this.refresh(refresh);
      return { generation, action: "click", ref: input.ref };
    }, signal);
  }

  type(input: TypeInput, signal?: AbortSignal): Promise<InteractionResult> {
    return this.#snapshot.interaction(async (refresh) => {
      if (input.text.length > 65_536) {
        throw new PumarejoError("ELEMENT_NOT_INTERACTABLE");
      }
      const reference = await this.requireTarget(input.ref, "type", signal);
      let mutationStarted = false;
      try {
        if (input.clear) {
          mutationStarted = true;
          await this.#webdriver.clear(reference.elementId, signal);
        }
        mutationStarted = true;
        await this.#webdriver.type(reference.elementId, input.text, signal);
      } catch (error) {
        if (mutationStarted) this.#references.clear();
        throw error;
      }
      const generation = await this.refresh(refresh);
      return {
        generation,
        action: "type",
        ref: input.ref,
        cleared: input.clear,
      };
    }, signal);
  }

  pressKey(
    input: PressKeyInput,
    signal?: AbortSignal,
  ): Promise<InteractionResult> {
    return this.#snapshot.interaction(async (refresh) => {
      const value = webdriverKey(input.key);
      await this.mutate(() => this.#webdriver.pressKey(value, signal), signal);
      const generation = await this.refresh(refresh);
      return { generation, action: "pressKey", key: input.key };
    }, signal);
  }

  private async requireTarget(
    ref: string,
    action: "click" | "type",
    signal?: AbortSignal,
  ): Promise<SemanticReference> {
    const reference = this.#references.resolve(ref);
    let current: CurrentIdentity;
    try {
      const script = await this.#identityScript();
      current = currentIdentitySchema.parse(
        await this.#webdriver.execute(
          script,
          [{ [W3C_ELEMENT_KEY]: reference.elementId }],
          signal,
        ),
      );
    } catch (error) {
      if (
        error instanceof PumarejoError &&
        error.code === "STALE_ELEMENT_REF"
      ) {
        this.#references.clear();
        throw error;
      }
      if (signal?.aborted) throw signal.reason;
      this.#references.clear();
      throw new PumarejoError("STALE_ELEMENT_REF", { cause: error });
    }
    if (!sameIdentity(reference, current)) {
      this.#references.clear();
      throw new PumarejoError("STALE_ELEMENT_REF");
    }
    if (!current.visible) throw new PumarejoError("ELEMENT_HIDDEN");
    if (!current.enabled) throw new PumarejoError("ELEMENT_DISABLED");
    if (
      current.kind !== "control" ||
      (action === "type" && !current.editable)
    ) {
      throw new PumarejoError("ELEMENT_NOT_INTERACTABLE");
    }
    return reference;
  }

  private async mutate(
    action: () => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      signal?.throwIfAborted();
      await action();
    } catch (error) {
      this.#references.clear();
      throw error;
    }
  }

  private async refresh(
    refresh: () => Promise<{ readonly generation: number }>,
  ): Promise<number> {
    this.#references.clear();
    return (await refresh()).generation;
  }
}
