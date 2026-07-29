import { z } from "zod";

import { W3C_ELEMENT_KEY } from "../webdriver/protocol.js";

const boundedString = z.string().max(65_536);
const referenceIndexSchema = z.number().int().nonnegative().max(499);
const finiteNumber = z.number().finite();

export const semanticKindSchema = z.enum([
  "control",
  "content",
  "status",
  "dialog",
  "list",
  "listitem",
  "table",
  "row",
  "cell",
]);

export const boundsSchema = z
  .object({
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber.nonnegative(),
    height: finiteNumber.nonnegative(),
  })
  .strict();

export const rawRelationshipSchema = z
  .object({
    labelledBy: z.array(referenceIndexSchema).max(32),
    describedBy: z.array(referenceIndexSchema).max(32),
    controls: z.array(referenceIndexSchema).max(32),
    owns: z.array(referenceIndexSchema).max(32),
  })
  .strict();

export const semanticIdentitySchema = z
  .object({
    name: z.string().max(65_536).optional(),
    inputType: z.string().max(128).optional(),
    ownershipContext: z.string().max(16_384),
  })
  .strict();

export const rawSemanticDescriptorSchema = z
  .object({
    parentIndex: referenceIndexSchema.nullable(),
    kind: semanticKindSchema,
    tag: z.string().min(1).max(128),
    role: z.string().min(1).max(128).optional(),
    name: boundedString.optional(),
    nameSafe: z.literal(true).optional(),
    text: boundedString.optional(),
    value: boundedString.optional(),
    redacted: z.boolean(),
    enabled: z.boolean(),
    visible: z.boolean(),
    focused: z.boolean(),
    bounds: boundsSchema,
    relationships: rawRelationshipSchema,
    checked: z.union([z.boolean(), z.literal("mixed")]).optional(),
    selected: z.boolean().optional(),
    expanded: z.boolean().optional(),
    pressed: z.union([z.boolean(), z.literal("mixed")]).optional(),
    required: z.boolean().optional(),
    invalid: z
      .union([z.boolean(), z.literal("grammar"), z.literal("spelling")])
      .optional(),
    readOnly: z.boolean().optional(),
    current: z
      .union([
        z.boolean(),
        z.literal("page"),
        z.literal("step"),
        z.literal("location"),
        z.literal("date"),
        z.literal("time"),
      ])
      .optional(),
    identity: semanticIdentitySchema,
  })
  .strict();

export const rawSnapshotSchema = z
  .object({
    scriptVersion: z.literal(1),
    viewport: z
      .object({
        width: finiteNumber.nonnegative(),
        height: finiteNumber.nonnegative(),
      })
      .strict(),
    handles: z
      .array(
        z
          .object({
            [W3C_ELEMENT_KEY]: z.string().min(1).max(4096),
          })
          .passthrough(),
      )
      .max(500),
    nodes: z
      .array(
        z
          .object({
            handleIndex: referenceIndexSchema,
            descriptor: rawSemanticDescriptorSchema,
          })
          .strict(),
      )
      .max(500),
    truncation: z
      .object({
        truncated: z.boolean(),
        reasons: z
          .array(
            z.enum([
              "maxNodes",
              "maxDepth",
              "maxTextLength",
              "fieldBudget",
              "traversalLimit",
            ]),
          )
          .max(5),
        counts: z
          .object({
            visited: z.number().int().nonnegative().max(10_000),
            candidates: z.number().int().nonnegative().max(10_000),
            matched: z.number().int().nonnegative().max(10_000),
            returned: z.number().int().nonnegative().max(500),
            filtered: z.number().int().nonnegative().max(10_000),
          })
          .strict(),
        refineWith: z
          .array(
            z.enum([
              "rootRef",
              "maxNodes",
              "maxDepth",
              "maxTextLength",
              "filters",
            ]),
          )
          .max(5),
      })
      .strict(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.truncation.counts.returned !== snapshot.nodes.length) {
      context.addIssue({
        code: "custom",
        path: ["truncation", "counts", "returned"],
        message: "returned count must match nodes",
      });
    }
    if (
      snapshot.truncation.truncated !==
      snapshot.truncation.reasons.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["truncation", "truncated"],
        message: "truncated must reflect the presence of reasons",
      });
    }
    snapshot.nodes.forEach(({ descriptor, handleIndex }, index) => {
      if (handleIndex >= snapshot.handles.length) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "handleIndex"],
          message: "handle is outside the snapshot",
        });
      }
      if (descriptor.parentIndex !== null && descriptor.parentIndex >= index) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "descriptor", "parentIndex"],
          message: "parent must precede child",
        });
      }
      for (const [relationship, indices] of Object.entries(
        descriptor.relationships,
      )) {
        if (indices.some((target) => target >= snapshot.nodes.length)) {
          context.addIssue({
            code: "custom",
            path: ["nodes", index, "descriptor", "relationships", relationship],
            message: "relationship target is outside the snapshot",
          });
        }
      }
      if (
        descriptor.redacted &&
        (descriptor.text !== undefined || descriptor.value !== undefined)
      ) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index],
          message: "redacted nodes cannot contain text or value",
        });
      }
      if (
        descriptor.redacted &&
        descriptor.name !== undefined &&
        descriptor.nameSafe !== true
      ) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "descriptor", "name"],
          message: "a retained redacted name must be browser-validated as safe",
        });
      }
    });
  });

export type RawSemanticDescriptor = z.infer<typeof rawSemanticDescriptorSchema>;
export type RawSnapshot = z.infer<typeof rawSnapshotSchema>;
export type RawTruncation = RawSnapshot["truncation"];

export interface SemanticTruncation extends Omit<RawTruncation, "reasons"> {
  readonly reasons: readonly (
    | RawTruncation["reasons"][number]
    | "semanticExtraction"
  )[];
}

export interface SemanticRelationships {
  readonly labelledBy: readonly string[];
  readonly describedBy: readonly string[];
  readonly controls: readonly string[];
  readonly owns: readonly string[];
}

export interface SemanticNode
  extends Omit<
    RawSemanticDescriptor,
    "parentIndex" | "relationships" | "identity" | "nameSafe"
  > {
  readonly ref: string;
  readonly parentRef?: string;
  readonly relationships: SemanticRelationships;
}

export interface SemanticSnapshot {
  readonly generation: number;
  readonly observedAt: string;
  readonly window: {
    readonly label: string;
    readonly title: string;
    readonly width: number;
    readonly height: number;
  };
  readonly nodes: readonly SemanticNode[];
  readonly truncation: SemanticTruncation;
  readonly partial?: true;
  readonly issues?: readonly SnapshotIssue[];
}

export interface SnapshotIssue {
  readonly code: "SEMANTIC_EXTRACTION_FAILED";
  readonly message: string;
  readonly phase: "observation";
  readonly retryable: true;
  readonly suggestion: string;
}

export interface SnapshotRequest {
  readonly rootRef?: string;
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxTextLength: number;
  readonly visibleOnly: boolean;
  readonly includeNames?: boolean;
  readonly includeText?: boolean;
  readonly includeValues?: boolean;
  readonly roles?: readonly string[];
  readonly name?: string;
  readonly types?: readonly string[];
}
