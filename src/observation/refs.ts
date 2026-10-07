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

export interface ReferenceGenerationReservation {
  readonly generation: number;
  readonly token: symbol;
}

export interface StagedReferenceTable {
  readonly generation: number;
  readonly nodes: readonly SemanticNode[];
  readonly references: ReadonlyMap<string, SemanticReference>;
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
  #reservation: ReferenceGenerationReservation | undefined;

  get generation(): number {
    return this.#generation;
  }

  replace(snapshot: RawSnapshot): readonly SemanticNode[] {
    const reservation = this.reserve();
    return this.publish(snapshot, reservation);
  }

  stage(
    snapshot: RawSnapshot,
    generation = this.#generation + 1,
  ): StagedReferenceTable {
    const elementIds = snapshot.handles.map(elementIdFrom);
    // A node the collector matched to a previous handle keeps that public ref;
    // everything else receives a ref scoped to the generation that created it.
    const reused = new Set<string>();
    const refs = snapshot.nodes.map((node, index) => {
      const previous =
        node.previousIndex === undefined
          ? undefined
          : snapshot.previousRefs?.[node.previousIndex];
      if (previous !== undefined && !reused.has(previous)) {
        reused.add(previous);
        return previous;
      }
      return `e${generation}-${index + 1}`;
    });
    const fresh = new Set(refs.filter((ref) => !reused.has(ref)));
    if (fresh.size + reused.size !== refs.length) {
      throw new PumarejoError("INTERNAL_ERROR");
    }
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

    return { generation, nodes, references: next };
  }

  reserve(): ReferenceGenerationReservation {
    if (this.#reservation !== undefined) return this.#reservation;
    const reservation = {
      generation: this.#generation + 1,
      token: Symbol("reference-generation"),
    };
    this.#references = new Map();
    this.#generation = reservation.generation;
    this.#reservation = reservation;
    return reservation;
  }

  publish(
    snapshot: RawSnapshot,
    reservation: ReferenceGenerationReservation,
  ): readonly SemanticNode[] {
    if (
      this.#reservation?.token !== reservation.token ||
      this.#generation !== reservation.generation
    ) {
      throw new PumarejoError("INTERNAL_ERROR");
    }
    const staged = this.stage(snapshot, reservation.generation);
    this.#references = new Map(staged.references);
    this.#reservation = undefined;
    return staged.nodes;
  }

  abandon(reservation: ReferenceGenerationReservation): void {
    if (
      this.#reservation?.token !== reservation.token ||
      this.#generation !== reservation.generation
    ) {
      throw new PumarejoError("INTERNAL_ERROR");
    }
    this.#reservation = undefined;
  }

  /** Current refs with their provider handles, in snapshot order. */
  survivalCandidates(): readonly {
    readonly ref: string;
    readonly elementId: string;
  }[] {
    return [...this.#references.values()]
      .slice(0, 500)
      .map(({ ref, elementId }) => ({ ref, elementId }));
  }

  resolve(ref: string): SemanticReference {
    const reference = this.#references.get(ref);
    if (reference === undefined) {
      throw new PumarejoError("STALE_ELEMENT_REF");
    }
    return reference;
  }

  advance(): number {
    return this.reserve().generation;
  }

  clear(): void {
    // Clearing current refs does not consume an already-reserved generation.
    // Only publish() or abandon() may close that reservation.
    this.#references = new Map();
  }
}
