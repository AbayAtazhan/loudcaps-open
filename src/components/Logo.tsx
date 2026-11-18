export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`display inline-flex items-center text-xl leading-none ${className}`}>
      Loud
      <span className="ml-0.5 inline-block -rotate-3 rounded-[3px] bg-loud px-1 py-0.5 text-ink">Caps</span>
    </span>
  );
}
