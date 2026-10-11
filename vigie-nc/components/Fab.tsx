import Link from "next/link";

/** Bouton « + » pour signaler — posé juste au-dessus de la liste. */
export function Fab() {
  return (
    <Link
      href="/signaler"
      aria-label="Signaler un événement"
      className="absolute right-3.5 bottom-full mb-4 w-[54px] h-[54px] rounded-full flex items-center justify-center z-[15] animate-fab-in shadow-[0_10px_22px_-6px_rgba(193,68,14,0.55)]"
      style={{
        background: "linear-gradient(160deg, #E8622F, #C1440E)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2.4}
        strokeLinecap="round"
        className="w-[22px] h-[22px]"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}
