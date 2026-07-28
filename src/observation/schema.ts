import { z } from "zod";

const boundedString = z.string().max(65_536);
const referenceIndexSchema = z.number().int().nonnegative().max(9_999);
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
    labelledBy: z.array(referenceIndexSchema).max(256),
    describedBy: z.array(referenceIndexSchema).max(256),
    owns: z.array(referenceIndexSchema).max(256),
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
    visible: z.literal(true),
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
    nodes: z
      .array(
        z
          .object({
            handleIndex: referenceIndexSchema,
            descriptor: rawSemanticDescriptorSchema,
          })
          .strict(),
      )
      .max(10_000),
  })
  .strict()
  .superRefine((snapshot, context) => {
    snapshot.nodes.forEach(({ descriptor }, index) => {
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

export interface SemanticRelationships {
  readonly labelledBy: readonly string[];
  readonly describedBy: readonly string[];
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
}
