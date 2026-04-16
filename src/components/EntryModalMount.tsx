import { useEffect, useState } from "react";
import type { Skill } from "../data/skills";
import EntryModal from "./EntryModal";

/**
 * Single-instance modal mount that listens for a global custom event and shows
 * `EntryModal` for the requested skill. This lets any Astro page dispatch
 * `skillforge:open-modal` without having to own React state itself.
 *
 * Dispatch from anywhere:
 *   window.dispatchEvent(new CustomEvent("skillforge:open-modal", {
 *     detail: { skillId: "sales-ops" },
 *   }));
 */
export const OPEN_MODAL_EVENT = "skillforge:open-modal";

type Props = {
  skills: Skill[];
};

export default function EntryModalMount({ skills }: Props) {
  const [openSkill, setOpenSkill] = useState<Skill | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ skillId?: string }>).detail;
      const skill = skills.find((s) => s.id === detail?.skillId);
      if (skill) setOpenSkill(skill);
    };
    window.addEventListener(OPEN_MODAL_EVENT, handler);
    return () => window.removeEventListener(OPEN_MODAL_EVENT, handler);
  }, [skills]);

  return <EntryModal open={!!openSkill} skill={openSkill} onClose={() => setOpenSkill(null)} />;
}
