import type { Metadata } from "next";
import Studio from "@/components/studio/Studio";

export const metadata: Metadata = {
  title: "Studio",
  description: "Add animated captions to a video in your browser. Free, private, no watermark.",
};

export default function Page() {
  return <Studio />;
}
