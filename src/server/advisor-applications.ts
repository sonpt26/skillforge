/**
 * "Become an advisor" submissions.
 *
 * Public form (no auth) writes a row here. An operator reviews the queue
 * later and flips status to 'reviewing' / 'accepted' / 'rejected' out of band.
 */
import { generateId } from "./auth";

export const SPECIALTY_OPTIONS = [
  { id: "revenue", label: "Revenue / Sales Ops" },
  { id: "marketing", label: "Marketing" },
  { id: "content", label: "Content / Editorial" },
  { id: "operations", label: "Operations / Automation" },
  { id: "people", label: "People Ops / HR" },
  { id: "product", label: "Product" },
  { id: "design", label: "Design" },
  { id: "engineering", label: "Engineering" },
  { id: "finance", label: "Finance" },
  { id: "other", label: "Other" },
] as const;

export type SpecialtyId = (typeof SPECIALTY_OPTIONS)[number]["id"];

export const SPECIALTY_IDS: readonly string[] = SPECIALTY_OPTIONS.map(
  (s) => s.id,
);

export type AdvisorApplicationInput = {
  name: string;
  email: string;
  phone?: string;
  specialty: string;
  brief?: string;
};

export async function createAdvisorApplication(
  db: D1Database,
  input: AdvisorApplicationInput,
): Promise<{ id: string; createdAt: string }> {
  const id = generateId("aap");
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO advisor_applications (id, name, email, phone, specialty, brief, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`,
    )
    .bind(
      id,
      input.name,
      input.email.toLowerCase(),
      input.phone ?? null,
      input.specialty,
      input.brief ?? null,
      createdAt,
    )
    .run();
  return { id, createdAt };
}
