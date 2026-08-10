"use client";

import { useContext } from "react";
import { IssuerContext } from "~/providers/issuer-provider";
import { IssuingOrganizationForm } from "~/components/forms/issuing-organization";
import { DeleteIssuerButton } from "~/components/forms/delete-issuer-button";
import { IssuerDetailSidebarLayout } from "~/components/issuer";
import { TRPCReactProvider } from "~/trpc/react";

export default function Issuer() {
  const issuer = useContext(IssuerContext);

  if (!issuer) return "";

  return (
    <IssuerDetailSidebarLayout>
      <h1 className="mb-6 text-xl font-bold">Org Settings</h1>
      <IssuingOrganizationForm issuer={issuer} />

      <div className="mt-10 border-t border-gray-2 pt-6">
        <h2 className="mb-3 text-lg font-bold">Danger Zone</h2>
        <TRPCReactProvider>
          <DeleteIssuerButton
            docId={issuer.docId}
            name={issuer.name ?? "this organization"}
          />
        </TRPCReactProvider>
      </div>
    </IssuerDetailSidebarLayout>
  );
}
