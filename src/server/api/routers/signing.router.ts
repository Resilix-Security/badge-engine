import { computeProof } from "~/lib/sign-credential";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { createVerifiableAchievementCredentialSchema } from "../schemas/open-badges/credential.schema";

export const signingRouter = createTRPCRouter({
  createProof: protectedProcedure
    .input(createVerifiableAchievementCredentialSchema)
    .mutation(async ({ ctx, input }) => {
      const { docId, context, ...unsecuredCredential } = input;

      const credentialWithoutProof = {
        "@context": context,
        ...unsecuredCredential,
      };

      const proof = await computeProof(credentialWithoutProof);

      const signedCredential = Object.assign({}, credentialWithoutProof);
      signedCredential.proof = [...(input.proof ?? []), proof];

      await ctx.prismaConnect.achievementCredential.update({
        data: { claimed: true },
        where: { docId },
      });

      return signedCredential;
    }),
});
