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
  const stackedCategoryPuntuable = showCategoryHeader && !!isPuntuable;
  const titleLayoutClass = stackedCategoryPuntuable
    ? "share-capture-title--stacked"
    : "share-capture-title--single";

  return (
    <h2
      className={`share-capture-title ${titleLayoutClass} ${className}`.trim()}
    >
      {showCategoryHeader ? (
        stackedCategoryPuntuable ? (
          <span className="share-capture-title-lines">
            <span className="share-capture-title-line">{categoryLabel}</span>
            <span className="share-capture-title-line share-capture-title-puntuable">
              Puntuable
            </span>
          </span>
        ) : (
          <span>{categoryLabel}</span>
        )
      ) : (
        <span>{name}</span>
      )}
    </h2>
  );
}
