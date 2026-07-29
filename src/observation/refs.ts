import { createHash } from "node:crypto";

import { PumarejoError } from "../shared/errors.js";
import { elementIdFrom } from "../webdriver/protocol.js";
import type {
  RawSemanticDescriptor,
  RawSnapshot,
  SemanticNode,
} from "./schema.js";

export interface SemanticReference {
  readonly ref: string;
  readonly generation: number;
  readonly elementId: string;
  readonly fingerprint: string;
  readonly identity: {
    readonly kind: RawSemanticDescriptor["kind"];
    readonly tag: string;
    readonly role?: string;
    readonly name?: string;
    readonly inputType?: string;
    readonly ownershipContext: string;
  };
}

function fingerprint(descriptor: RawSemanticDescriptor): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: descriptor.kind,
        role: descriptor.role ?? null,
        name: descriptor.identity.name ?? null,
        inputType: descriptor.identity.inputType ?? null,
        ownershipContext: descriptor.identity.ownershipContext,
      }),
    )
    .digest("hex");
}

export class ReferenceTable {
  #generation = 0;
  #references = new Map<string, SemanticReference>();

  get generation(): number {
    return this.#generation;
  }

  replace(snapshot: RawSnapshot): readonly SemanticNode[] {
    const elementIds = snapshot.handles.map(elementIdFrom);
    const generation = this.#generation + 1;
    const refs = snapshot.nodes.map(
      (_node, index) => `e${generation}-${index + 1}`,
    );
    const next = new Map<string, SemanticReference>();
    const nodes = snapshot.nodes.map(({ descriptor, handleIndex }, index) => {
      const ref = refs[index]!;
      const elementId = elementIds[handleIndex];
      if (elementId === undefined) {
        throw new PumarejoError("INTERNAL_ERROR");
      }
      next.set(ref, {
        ref,
        generation,
        elementId,
        fingerprint: fingerprint(descriptor),
        identity: {
          kind: descriptor.kind,
          tag: descriptor.tag,
          ...(descriptor.role === undefined ? {} : { role: descriptor.role }),
          ...(descriptor.identity.name === undefined
            ? {}
            : { name: descriptor.identity.name }),
          ...(descriptor.identity.inputType === undefined
            ? {}
            : { inputType: descriptor.identity.inputType }),
          ownershipContext: descriptor.identity.ownershipContext,
        },
      });
      const relationshipRefs = (
        indices: readonly number[],
      ): readonly string[] => indices.map((target) => refs[target]!);
      const {
        parentIndex,
        identity: _identity,
        nameSafe: _nameSafe,
        ...publicDescriptor
      } = descriptor;
      return {
        ref,
        ...(parentIndex === null ? {} : { parentRef: refs[parentIndex] }),
        ...publicDescriptor,
        relationships: {
          labelledBy: relationshipRefs(descriptor.relationships.labelledBy),
          describedBy: relationshipRefs(descriptor.relationships.describedBy),
          controls: relationshipRefs(descriptor.relationships.controls),
          owns: relationshipRefs(descriptor.relationships.owns),
        },
      };
    });

    this.#references = next;
    this.#generation = generation;
    return nodes;
  }

  resolve(ref: string): SemanticReference {
    const reference = this.#references.get(ref);
    if (reference === undefined) {
      throw new PumarejoError("STALE_ELEMENT_REF");
    }
    return reference;
  }

  advance(): number {
    this.#references = new Map();
    this.#generation += 1;
    return this.#generation;
  }

  clear(): void {
    this.#references = new Map();
  }
}
