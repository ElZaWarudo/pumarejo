import { z } from "zod";

import { semanticKindSchema } from "../observation/schema.js";

export const currentIdentitySchema = z
  .object({
    attached: z.boolean(),
    visible: z.boolean(),
    enabled: z.boolean(),
    editable: z.boolean(),
    tag: z.string().min(1).max(128).optional(),
    kind: semanticKindSchema.optional(),
    role: z.string().max(128).optional(),
    name: z.string().max(65_536).optional(),
    inputType: z.string().max(128).optional(),
    ownershipContext: z.string().max(16_384).optional(),
  })
  .strict();

export type CurrentIdentity = z.infer<typeof currentIdentitySchema>;
