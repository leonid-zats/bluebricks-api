import { z } from "zod";

const nonEmptyString = z.string().trim().min(1, "must be non-empty");

export const createBlueprintSchema = z
  .object({
    name: nonEmptyString,
    version: nonEmptyString,
    author: nonEmptyString,
    blueprint_data: z
      .record(z.string(), z.unknown())
      .refine((v) => typeof v === "object" && v !== null && !Array.isArray(v), {
        message: "blueprint_data must be a JSON object",
      }),
  })
  .strict();

export type CreateBlueprintInput = z.infer<typeof createBlueprintSchema>;

/** PUT body: all keys optional; present keys validated like create (scalars non-empty, blueprint_data object). */
export const mergeUpdateSchema = z
  .object({
    name: nonEmptyString.optional(),
    version: nonEmptyString.optional(),
    author: nonEmptyString.optional(),
    blueprint_data: z
      .record(z.string(), z.unknown())
      .refine((v) => typeof v === "object" && v !== null && !Array.isArray(v), {
        message: "blueprint_data must be a JSON object",
      })
      .optional(),
  })
  .strict();

export type MergeUpdateInput = z.infer<typeof mergeUpdateSchema>;

export function bodyErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
  }
  return "Invalid request body";
}
