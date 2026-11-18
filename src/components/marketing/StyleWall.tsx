"use client";

import { TemplateCard } from "@/components/TemplateCard";
import { TEMPLATES } from "@/lib/captions/templates";
import { sitePath } from "@/lib/site";

/** Every caption style, drawn live by the same renderer the studio uses. */
export function StyleWall() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {TEMPLATES.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          href={sitePath("/studio/")}
        />
      ))}
    </div>
  );
}
