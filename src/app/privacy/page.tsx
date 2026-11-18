import type { Metadata } from "next";
import { Legal } from "@/components/marketing/Legal";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return (
    <Legal title="Privacy">
      <p>Last updated November 2026.</p>
      <h2>Your videos stay on your device</h2>
      <p>{site.name} reads, captions and renders your video inside your browser. Your video, its audio and its transcript are never sent to us or to anyone else.</p>
      <h2>What is downloaded</h2>
      <p>The app downloads the speech model from Hugging Face and Transformers.js and its runtime from jsDelivr. Your browser caches these downloads. These providers and the web host receive standard connection information when you fetch their files.</p>
      <h2>What is stored on your device</h2>
      <p>The single-video editor saves your latest draft, including the source video and captions, in this browser so you can resume after reloading. Choose New in the editor to delete the draft. The browser can remove local data when storage runs low.</p>
      <p>The speech model, saved client presets, and vocabulary are also stored locally. Clearing this site&apos;s data removes them. Files you download or save to a folder are managed separately on your device.</p>
      <h2>Contact</h2>
      <p>For questions about how LoudCaps handles data, see the <a href={site.repo}>LoudCaps repository</a>.</p>
    </Legal>
  );
}
