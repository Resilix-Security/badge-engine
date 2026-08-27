import { notFound } from "next/navigation";
import { api } from "~/trpc/server";
import EditCredentialForm from "./EditCredentialForm";

export default async function EditCredentialPage({
  params,
}: {
  params: { id: string; credentialId: string };
}) {
  const credential = await api.credential.find.query({
    docId: params.credentialId,
  });
  if (!credential) return notFound();

  return <EditCredentialForm credential={credential} issuerId={params.id} />;
}
