import Link from "next/link";
import { Logo } from "@/components/Logo";

export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" aria-label="LoudCaps home">
        <Logo />
      </Link>
      <h1 className="display mt-12 text-5xl">{title}</h1>
      <div className="mt-8 space-y-4 leading-relaxed text-fog [&_a]:text-paper [&_a]:underline [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-paper">{children}</div>
    </div>
  );
}
