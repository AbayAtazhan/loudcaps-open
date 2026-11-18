import { Check, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LiveDemo } from "@/components/marketing/LiveDemo";
import { StyleWall } from "@/components/marketing/StyleWall";
import { site, sitePath } from "@/lib/site";

const cta =
  "inline-flex h-14 items-center justify-center rounded-xl bg-loud px-7 text-base font-bold text-ink transition hover:-translate-y-0.5 hover:shadow-[0_6px_0_#fff]";
const ghost = "inline-flex h-14 items-center justify-center rounded-xl border border-edge px-7 text-base font-semibold transition hover:border-paper";

const STEPS = [
  ["Drop a video", "Straight from your camera roll. It opens instantly because nothing is uploaded."],
  ["Pick a style", "Every word is timed for you. Tap a style, fix a word, drag the captions where you want them."],
  ["Export the MP4", "Rendered on your device in full quality, with no watermark. Post it."],
];

const FEATURES = [
  ["Word-level timing", "Highlight each word as it is spoken. Correct any timing or text before exporting."],
  ["50+ languages", "English, Spanish, Portuguese, Russian, Hindi, Arabic and many more."],
  ["Any platform's shape", "Reframe to 9:16, 4:5 or 1:1 with a crop or a blurred background."],
  ["Fix anything", "Edit words, split and join captions, highlight keywords, nudge the sync."],
  ["Subtitles too", "Export SRT, VTT or a plain transcript alongside the video."],
  ["Faster after the first", "The speech model is saved on your device, so your next videos start in seconds."],
];

const FAQ = [
  [
    "Is it really free?",
    "Yes. Unlimited videos, 18 caption styles, 4K and 60 fps export on compatible devices, full editing and no watermark, without an account. Your device does the transcription and rendering.",
  ],
  [
    "Do you upload my video?",
    "No. The video is read, captioned and rendered inside your browser. The only downloads are the app itself and the speech model, which is fetched once and then stored on your device.",
  ],
  [
    "How do batches work?",
    "Open Batch in the studio, choose your videos or a folder, and apply a client preset. Review each transcript and export the MP4s locally.",
  ],
  [
    "Can I resume an edit?",
    "The single-video editor saves the latest draft and its video in this browser. Use New to remove the draft. Batch queues are kept for the current tab.",
  ],
  [
    "Which devices and browsers work?",
    "It is built on web standards found in recent versions of Chrome, Edge, Safari and Firefox. Chrome or Edge on a computer is the most thoroughly tested and the fastest. The first run downloads a speech model and its runtime. The three model options range from 67 to 275 MB, so use Wi-Fi.",
  ],
  [
    "How accurate is it?",
    "It uses OpenAI's open Whisper speech models. Accuracy varies with audio quality, language and background noise. You can correct the transcript before export.",
  ],
  [
    "Can I use it for client work?",
    "Yes. Videos you make with LoudCaps are yours, for personal or commercial use.",
  ],
  [
    "What licence is the code under?",
    "LoudCaps is licensed under AGPL-3.0. You can run it yourself, fork it and contribute changes.",
  ],
];

function Mark({ children }: { children: React.ReactNode }) {
  return <span className="inline-block -rotate-2 bg-loud px-[0.18em] text-ink">{children}</span>;
}

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Logo />
        <nav className="ml-auto hidden items-center gap-6 text-sm text-fog sm:flex">
          <a href="#styles" className="hover:text-paper">Styles</a>
          <a href="#batch" className="hover:text-paper">Batch</a>
          <a href="#faq" className="hover:text-paper">FAQ</a>
          <a href={site.repo} target="_blank" rel="noreferrer" className="hover:text-paper">GitHub</a>
        </nav>
        <a href={sitePath("/studio/")} className="ml-auto inline-flex h-10 items-center rounded-lg bg-paper px-4 text-sm font-bold text-ink sm:ml-0">
          Open studio
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
          <div>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-edge px-3 py-1 text-xs text-fog">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Free and open source
            </p>
            <h1 className="display text-[clamp(2.9rem,8.6vw,6.6rem)]">
              Captions that get <Mark>watched.</Mark>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-fog sm:text-xl">
              Add animated, word-by-word captions to your video. Preview, edit and export on your device without uploading the footage.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href={sitePath("/studio/")} className={cta}>Caption a video, free</a>
              <a href="#styles" className={ghost}>See the styles</a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fog">
              {["No upload", "No sign-up", "No watermark", "50+ languages"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check size={15} className="text-loud" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <LiveDemo />
        </section>

        <section className="border-y border-edge bg-coal">
          <ol className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="display text-6xl text-loud">{i + 1}</span>
                <h2 className="display mt-3 text-2xl">{title}</h2>
                <p className="mt-3 leading-relaxed text-fog">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="styles" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-20">
          <h2 className="display max-w-3xl text-4xl sm:text-6xl">
            18 animated <Mark>caption styles.</Mark>
          </h2>
          <p className="mb-10 mt-5 max-w-xl text-fog">
            Hover to preview a style or open the studio to try it on your own footage.
          </p>
          <StyleWall />
        </section>

        <section className="border-y border-edge bg-coal">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2">
            <div>
              <h2 className="display text-4xl sm:text-5xl">Why is it free?</h2>
              <p className="mt-6 text-lg leading-relaxed text-fog">
                The speech model and video renderer run on your device. Caption and export individual clips or whole batches with no account or watermark.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-4 self-center text-center">
              {[
                ["0", "videos uploaded"],
                ["0", "accounts needed"],
                ["0", "watermarks added"],
              ].map(([figure, label]) => (
                <div key={label} className="rounded-2xl border border-edge bg-ink px-2 py-8">
                  <dd className="display text-6xl text-loud">{figure}</dd>
                  <dt className="mt-2 text-sm text-fog">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="display text-4xl sm:text-5xl">Everything a caption tool should do.</h2>
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, body]) => (
              <div key={title} className="border-t-2 border-loud pt-4">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-2 leading-relaxed text-fog">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="batch" className="scroll-mt-8 border-y border-edge bg-coal">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="display text-4xl sm:text-5xl">Caption a <Mark>whole folder.</Mark></h2>
            <p className="mt-5 max-w-xl leading-relaxed text-fog">Save a client’s style and vocabulary, apply them to a batch of clips, and correct each transcript before exporting on your device.</p>
            <a href={sitePath("/studio/")} className={`${cta} mt-8`}>Open studio</a>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-8 px-5 py-20">
          <h2 className="display text-4xl sm:text-5xl">Questions.</h2>
          <div className="mt-8 divide-y divide-edge border-y border-edge">
            {FAQ.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                  {question}
                  <X size={18} className="shrink-0 rotate-45 text-fog transition group-open:rotate-0" />
                </summary>
                <p className="mt-3 leading-relaxed text-fog">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-5 pb-24 text-center">
          <h2 className="display text-[clamp(3rem,11vw,8rem)]">
            Make it <Mark>loud.</Mark>
          </h2>
          <a href={sitePath("/studio/")} className={`${cta} mt-10`}>Caption a video, free</a>
        </section>
      </main>

      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-fog sm:flex-row sm:items-center">
          <Logo />
          <span className="sm:ml-4">Open source under AGPL-3.0.</span>
          <nav className="flex gap-5 sm:ml-auto">
            <a href={sitePath("/studio/")} className="hover:text-paper">Studio</a>
            <a href={site.repo} target="_blank" rel="noreferrer" className="hover:text-paper">GitHub</a>
            <a href={sitePath("/privacy/")} className="hover:text-paper">Privacy</a>
            <a href={sitePath("/terms/")} className="hover:text-paper">Terms</a>
            <a href={`${site.repo}/issues`} className="hover:text-paper">Feedback</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
