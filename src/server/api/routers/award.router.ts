import { z } from "zod";
import { IdentifierType, type Prisma } from "@prisma/client";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../trpc";
import { CreateAwardSchema } from "../schemas/award.schema";
import { createVerifiableAchievementCredentialSchema } from "../schemas/open-badges/credential.schema";
import {
  protectedAchievementCredentialInclude,
  publicAchievementCredentialSelect,
  // publicAchievementCredentialStatusSelect,
} from "~/server/db/queries";
import { env } from "~/env.mjs";
import { mongoDbObjectId } from "../schemas/util.schema";
import { computeProof } from "~/lib/sign-credential";
import { sendAwardEmail } from "../network-functions/send-award-email";
import logger from "shared/utils/logger/createLogger";
// import { addCredentialStatus } from "../network-functions/add-credential-status";

export const awardRouter = createTRPCRouter({
  // Finds a credential by id, includes credentialStatus
  find: protectedProcedure
    .input(mongoDbObjectId)
    .query(async ({ ctx, input }) => {
      return ctx.prismaConnect.achievementCredential.findUniqueOrThrow({
        where: { docId: input },
        include: protectedAchievementCredentialInclude,
      });
    }),

  // Public lookup for the recipient-facing credential page. No auth required —
  // an awarded credential's URL is meant to be shared/verified by anyone.
  findPublic: publicProcedure
    .input(mongoDbObjectId)
    .query(async ({ ctx, input }) => {
      return ctx.prismaConnect.achievementCredential.findUniqueOrThrow({
        where: { docId: input },
        include: protectedAchievementCredentialInclude,
      });
    }),

  // returns a list of awarded credentials by ID
  index: protectedProcedure
    .input(
      z.object({
        credentialId: mongoDbObjectId,
        query: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prismaConnect.achievementCredential.findMany({
        include: {
          credentialStatus: true,
          credentialSubject: {
            include: {
              profile: true,
            },
          },
        },
        where: {
          credentialSubject: {
            achievementId: input.credentialId,
            ...(input.query
              ? {
                  profile: {
                    OR: ["name", "familyName", "givenName", "email"].map(
                      (f) => ({
                        [f]: { contains: input.query, mode: "insensitive" },
                      }),
                    ),
                  },
                }
              : {}),
          },
        },
        take: 10,
        orderBy: {
          awardedDate: "desc",
        },
      });
    }),

  // Creates a new achievementCredential for the specified learner Profile,
  // signs it, and emails the recipient a link to view/download it.
  create: protectedProcedure
    .input(CreateAwardSchema)
    .mutation(async ({ ctx, input }) => {
      const { credentialId, identifier, profile } = input;

      const { docId } = await ctx.prismaConnect.$transaction(
        async (prisma) => {
          const credential = await prisma.achievement.findUniqueOrThrow({
            where: { docId: credentialId },
            select: {
              docId: true,
              creatorId: true,
              name: true,
              description: true,
              imageId: true,
            },
          });

          const identityObject = await prisma.identityObject.create({
            data: {
              type: "IdentityObject",
              identityHash: identifier,
              identityType: IdentifierType.emailAddress,
              hashed: false,
            },
            select: { id: true },
          });

          const awardSubject: Prisma.AchievementSubjectCreateInput = {
            identifier: { connect: { id: identityObject.id } },
            achievement: { connect: { docId: credential.docId } },
            type: ["AchievementSubject"],
            source: { connect: { docId: credential.creatorId! } },
            profile: {
              create: {
                ...profile,
                email: identifier,
              },
            },
          };

          const awardee = await prisma.achievementSubject.create({
            data: awardSubject,
          });

          const awardedCredential: Prisma.AchievementCredentialCreateInput = {
            name: credential.name,
            type: ["AchievementCredential"],
            description: credential.description,
            id: awardee.docId, // Temporarily assign URI until a database ID is available.
            awardedDate: new Date().toISOString(),
            validFrom: new Date().toISOString(),
            credentialSubject: { connect: { docId: awardee.docId } },
            issuer: { connect: { docId: credential.creatorId! } },
            ...(credential.imageId
              ? { image: { connect: { docId: credential.imageId } } }
              : {}),
          };

          const { docId } = await prisma.achievementCredential.create({
            data: awardedCredential,
            select: { docId: true },
          });

          await prisma.achievementCredential.update({
            where: { docId },
            data: {
              id: `${env.NEXTAUTH_URL.replace(/\/$/, "")}/awards/${docId}`,
            },
          });

          return { docId };
        },
      );

      // Signing (JSON-LD canonicalization + hashing) and sending mail are
      // both slow relative to Prisma's interactive transaction timeout, so
      // they run after the award itself has committed.
      const fullCredential =
        await ctx.prismaConnect.achievementCredential.findUniqueOrThrow({
          where: { docId },
          include: protectedAchievementCredentialInclude,
        });

      const { context, ...rest } = fullCredential;

      const parsedInput = createVerifiableAchievementCredentialSchema.parse({
        context: context.length >= 2 ? context : undefined,
        ...rest,
        type: ["VerifiableCredential", ...rest.type],
      });

      const { context: parsedContext, ...unsecuredCredential } = parsedInput;

      const proof = await computeProof({
        "@context": parsedContext,
        ...unsecuredCredential,
      });

      await ctx.prismaConnect.achievementCredential.update({
        where: { docId },
        data: {
          claimed: true,
          proof: {
            create: [
              {
                type: proof.type,
                cryptosuite: proof.cryptosuite,
                created: new Date(proof.created),
                verificationMethod: proof.verificationMethod,
                proofPurpose: proof.proofPurpose,
                proofValue: proof.proofValue,
              },
            ],
          },
        },
      });

      // A failed email doesn't undo the award — it's already persisted and
      // signed. Log it so it can be spotted/re-sent rather than silently lost.
      try {
        await sendAwardEmail({
          to: identifier,
          recipientName: profile.name,
          credentialName: fullCredential.name,
          issuerName: fullCredential.issuer.name ?? "your issuer",
          credentialUrl: fullCredential.id,
          imageId: fullCredential.image?.id,
        });
      } catch (error) {
        logger.error(
          `Failed to send award email for credential ${docId} to ${identifier}: `,
          error,
        );
      }

      return ctx.prismaConnect.achievementCredential.findUniqueOrThrow({
        where: { docId },
        select: publicAchievementCredentialSelect,
      });

      // const awardedCredentialWithStatus = await addCredentialStatus(
      //   awardedCredentialWithId,
      // );

      // console.log("Cred with status:", awardedCredentialWithStatus);

      // return prisma.achievementCredential.update({
      //   where: { docId },
      //   data: {
      //     credentialStatus: {
      //       id: awardedCredentialWithStatus.docId,
      //       type: awardedCredentialWithStatus._type,
      //     },
      //   },
      //   select: publicAchievementCredentialStatusSelect,
      // });
    }),
});
