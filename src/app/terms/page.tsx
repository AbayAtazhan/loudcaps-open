import type { Metadata } from "next";
import { Legal } from "@/components/marketing/Legal";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Terms" };

export default function Page() {
  return (
    <Legal title="Terms">
      <p>Last updated November 2026.</p>
      <h2>Using {site.name}</h2>
      <p>You may use {site.name} for personal and commercial work. Videos you create are yours. You are responsible for having the rights to the footage and audio you edit.</p>
      <h2>The software</h2>
      <p>LoudCaps is licensed under the GNU AGPL-3.0. <a href={site.repo}>Get the source code on GitHub.</a></p>
      <h2>No warranty</h2>
      <p>The software is provided as is, without warranties of any kind. Automatic captions can contain mistakes, so review them before you publish. To the extent the law allows, we are not liable for losses arising from use of the software.</p>
    </Legal>
  );
}
