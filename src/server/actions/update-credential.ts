"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AchievementType } from "@prisma/client";
import { api } from "~/trpc/server";

const UpdateCredentialFormSchema = z.object({
  docId: z.string(),
  issuerId: z.string(),
  name: z.string().min(1),
  description: z.string().min(1),
  achievementType: z.nativeEnum(AchievementType),
  isPublic: z.boolean(),
  criteria: z.string().min(1),
  tag: z.array(z.string()),
  supportingResearchAndRationale: z.string().min(1),
  resources: z.string().min(1),
});

export async function updateCredential(formData: FormData) {
  const data = UpdateCredentialFormSchema.parse({
    docId: formData.get("docId"),
    issuerId: formData.get("issuerId"),
    name: formData.get("name"),
    description: formData.get("description"),
    achievementType: formData.get("achievementType"),
    isPublic: formData.get("isPublic") === "on",
    criteria: formData.get("criteria"),
    tag: String(formData.get("tag") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    supportingResearchAndRationale: formData.get(
      "supportingResearchAndRationale",
    ),
    resources: formData.get("resources"),
  });

  const imageFile = formData.get("image");
  const image =
    imageFile instanceof Blob && imageFile.size
      ? await api.image.upload.mutate(imageFile)
      : undefined;

  const { issuerId: _issuerId, ...credentialData } = data;
  const updated = await api.credential.update.mutate({
    ...credentialData,
    image: image ?? undefined,
  });

  if (!updated) throw new Error("The badge could not be updated.");

  revalidatePath(`/issuers/${data.issuerId}`);
  revalidatePath(`/issuers/${data.issuerId}/credentials/${data.docId}`);
  return { docId: updated.docId };
}
