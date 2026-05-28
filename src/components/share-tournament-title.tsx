import {
  formatCategoryHeaderLabel,
  shouldShowCategoryShareHeader,
} from "@/lib/share-tournament-header";

type ShareTournamentTitleProps = {
  tournamentName: string;
  tournamentCategory?: string | null;
  isCategorySpecific?: boolean;
  isPuntuable?: boolean;
  className?: string;
};

export function ShareTournamentTitle({
  tournamentName,
  tournamentCategory,
  isCategorySpecific,
  isPuntuable,
  className = "",
}: ShareTournamentTitleProps) {
  const name = tournamentName.trim() || "Torneo";
  const categoryLabel = formatCategoryHeaderLabel(tournamentCategory ?? "");
  const showCategoryHeader = shouldShowCategoryShareHeader(
    isCategorySpecific,
    tournamentCategory,
  );

  return (
    <h2 className={`share-capture-title ${className}`.trim()}>
      {showCategoryHeader ? (
        <>
          <span>{categoryLabel}</span>
          {isPuntuable ? (
            <>
              <span className="share-capture-title-sep" aria-hidden>
                |
              </span>
              <span className="share-capture-title-puntuable">Puntuable</span>
            </>
          ) : null}
        </>
      ) : (
        <span>{name}</span>
      )}
    </h2>
  );
}
