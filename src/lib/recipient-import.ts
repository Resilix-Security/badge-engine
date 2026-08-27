import {
  AwardRecipientSchema,
  type AwardRecipient,
} from "shared/interfaces/credential-form-object.interface";

const NAME_HEADERS = [
  "name",
  "naam",
  "recipient",
  "recipient name",
  "ontvanger",
];
const EMAIL_HEADERS = ["email", "e-mail", "email address", "e-mailadres"];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function parseRecipientWorkbook(
  file: File,
): Promise<AwardRecipient[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName)
    throw new Error("The file does not contain a worksheet.");

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) throw new Error("The first worksheet could not be read.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  if (!rows.length) throw new Error("The file is empty.");

  const headers = (rows[0] ?? []).map(normalizeHeader);
  const nameIndex = headers.findIndex((header) =>
    NAME_HEADERS.includes(header),
  );
  const emailIndex = headers.findIndex((header) =>
    EMAIL_HEADERS.includes(header),
  );

  if (nameIndex < 0 || emailIndex < 0) {
    throw new Error('Add columns named "Name" and "Email" to the first row.');
  }

  const recipients: AwardRecipient[] = [];
  const seenEmails = new Set<string>();
  const invalidRows: number[] = [];

  rows.slice(1).forEach((row, index) => {
    const values = Array.isArray(row) ? row : [];
    const candidate = {
      name: String(values[nameIndex] ?? "").trim(),
      email: String(values[emailIndex] ?? "")
        .trim()
        .toLowerCase(),
    };

    if (!candidate.name && !candidate.email) return;

    const result = AwardRecipientSchema.safeParse(candidate);
    if (!result.success) {
      invalidRows.push(index + 2);
      return;
    }

    if (!seenEmails.has(result.data.email)) {
      seenEmails.add(result.data.email);
      recipients.push(result.data);
    }
  });

  if (invalidRows.length) {
    throw new Error(
      `Check the name and email address on row${invalidRows.length === 1 ? "" : "s"} ${invalidRows.join(", ")}.`,
    );
  }
  if (!recipients.length) throw new Error("No recipients were found.");

  return recipients;
}
