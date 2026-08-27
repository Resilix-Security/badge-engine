"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { FormError } from "~/components/forms/errors";
import { AwardFormSection } from "~/components/forms/award";
import { useRouter } from "next/navigation";
import { useIssuerContext } from "~/providers/issuer-provider";
import { api } from "~/trpc/react";
import { useNotifications } from "~/providers/notification-provider";
import {
  AwardBasicsSectionSchema,
  type AwardRecipient,
} from "../../../../../../../shared/interfaces/credential-form-object.interface";
import { CreateAwardSchema } from "~/server/api/schemas/award.schema";
import Icon from "~/components/icon";
import { parseRecipientWorkbook } from "~/lib/recipient-import";
import { z } from "zod";
// import { useCredentialContext } from "~/providers/award-provider";

export default function Award({
  params,
}: {
  params: { credentialId: string; id: string };
}) {
  // const credential = useCredentialContext();

  const awardFormSchema = AwardBasicsSectionSchema.extend({
    validUntil: z.string(),
  });
  const {
    register,
    handleSubmit,
    trigger,
    control,
    setValue,
    formState: { errors },
  } = useForm<{ recipients: AwardRecipient[]; validUntil: string }>({
    resolver: zodResolver(awardFormSchema),
    defaultValues: {
      recipients: [{ name: "", email: "" }],
      validUntil: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "recipients",
  });

  const { docId: issuerId } = useIssuerContext();
  const router = useRouter();
  const { credentialId } = params;
  const { notify } = useNotifications();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const [importMessage, setImportMessage] = useState<string>();
  const importInputRef = useRef<HTMLInputElement>(null);

  const awardMutation = api.award.create.useMutation({
    onError: (error) => {
      console.error("Award mutation error:", error);
      notify({
        type: "error",
        message: error.message || "Failed to award credentials",
      });
    },
  });

  const importRecipients = async (file?: File) => {
    if (!file) return;
    setImportError(undefined);
    setImportMessage(undefined);

    try {
      const recipients = await parseRecipientWorkbook(file);
      setValue("recipients", recipients, { shouldValidate: true });
      setImportMessage(
        `${recipients.length} recipient${recipients.length === 1 ? "" : "s"} imported.`,
      );
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "The file could not be imported.",
      );
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const onSubmit = handleSubmit(async (data) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      for (const recipient of data.recipients) {
        const awardInput = CreateAwardSchema.omit({
          credentialId: true,
        }).parse({
          identifier: recipient.email,
          profile: {
            name: recipient.name,
          },
          validUntil: data.validUntil || null,
        });

        await awardMutation.mutateAsync({
          ...awardInput,
          credentialId,
        });
      }

      notify({
        type: "success",
        message: "Credentials awarded successfully",
      });
      router.push(`/issuers/${issuerId}/credentials/${credentialId}`);
    } catch {
      // the mutation's onError above already surfaced the failure
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <AwardFormSection>
      <form onSubmit={onSubmit} noValidate>
        <section className="mb-6 rounded-lg border border-gray-2 bg-gray-1 p-5">
          <h2 className="font-semibold">Bulk import recipients</h2>
          <p className="mt-1 text-sm text-gray-5">
            Upload an Excel or CSV file whose first row contains{" "}
            <strong>Name</strong> and <strong>Email</strong> columns.
          </p>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(event) => void importRecipients(event.target.files?.[0])}
          />
          <button
            type="button"
            className="mt-4 rounded-full border-2 border-blue-3 px-4 py-2 font-semibold text-blue-4"
            onClick={() => importInputRef.current?.click()}
          >
            <Icon name="upload" /> Import Excel or CSV
          </button>
          {importMessage && (
            <p className="text-green-6 mt-3 text-sm">{importMessage}</p>
          )}
          {importError && (
            <p className="mt-3 text-sm text-red-5" role="alert">
              {importError}
            </p>
          )}
        </section>

        <div className="mb-6 mt-5">
          <header className="flex border-y border-gray-2 pl-7 font-semibold">
            <div className="required grow px-3 py-4">Recipient Name</div>
            <div className="required grow px-3 py-4">Email</div>
            <div className="w-12 py-4"></div>
          </header>
          {fields.map((field, index) => (
            <div key={field.id} className="flex pl-7 text-gray-5">
              <div className="grow px-3 py-4">
                <input
                  type="text"
                  placeholder="Recipient Name"
                  className={`w-full rounded border px-4 py-3 ${errors?.recipients?.[index]?.name ? "border-2 border-red-5 focus:outline-none" : "border-gray-5"}`}
                  {...register(`recipients.${index}.name`, {
                    required: "Recipient Name is required",
                  })}
                  onBlur={() => trigger(`recipients.${index}.name`)}
                />
                <FormError
                  message={errors?.recipients?.[index]?.name?.message}
                />
              </div>
              <div className="grow px-3 py-4">
                <input
                  type="email"
                  placeholder="Email Address"
                  className={`w-full rounded border px-4 py-3 ${errors?.recipients?.[index]?.email ? "border-2 border-red-5 focus:outline-none" : "border-gray-5"}`}
                  {...register(`recipients.${index}.email`, {
                    required: "Email is required",
                    pattern: {
                      value:
                        /^[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/, // Thanks to https://github.com/manishsaraan/email-validator/blob/master/index.js
                      message: "Invalid email address",
                    },
                  })}
                  onBlur={() => trigger(`recipients.${index}.email`)}
                />
                <FormError
                  message={errors?.recipients?.[index]?.email?.message}
                />
              </div>

              <div className="flex w-12 items-center justify-center">
                {fields.length > 1 && (
                  <div className="flex shrink-0 grow-0 basis-7 flex-col items-center justify-center">
                    <button
                      type="button"
                      className="flex h-5 w-5 flex-col items-center justify-center rounded-full border-2 border-gray-5"
                      onClick={() => {
                        if (fields.length > 1) remove(index);
                      }}
                    >
                      <Icon name="minus" className="h-min w-min text-md" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="px-3 py-4 font-semibold text-blue-4"
            onClick={() => append({ name: "", email: "" })}
          >
            <Icon name="plus" />{" "}
            <span className="underline">Add a Recipient</span>
          </button>
        </div>

        <div className="field mb-7">
          <label htmlFor="validUntil" className="base-form-label">
            Expiration date{" "}
            <span className="font-normal text-gray-5">(optional)</span>
          </label>
          <input
            type="date"
            id="validUntil"
            min={new Date().toISOString().slice(0, 10)}
            className="w-full rounded border border-gray-5 px-4 py-3"
            {...register("validUntil")}
          />
          <p className="text-sm text-gray-5">
            Leave empty if these awarded badges should not expire.
          </p>
        </div>

        <div className="flex justify-between">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`btn disabled:border-2 disabled:border-gray-4 disabled:bg-gray-3 ${isSubmitting ? "disabled" : ""}`}
          >
            {isSubmitting ? "Sending…" : "Award Achievement"}
          </button>
        </div>
      </form>
    </AwardFormSection>
  );
}
