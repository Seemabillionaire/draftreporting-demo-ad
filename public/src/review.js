export function buildRuleBlockers({
  study,
  sex,
  sideMissing = [],
  sideGroupMissing = [],
  sideFindingChosen = false
}) {
  const blockers = [];
  if (study !== "pelvis" && !["M", "F"].includes(sex)) blockers.push("Sex not stated");
  if (!sideFindingChosen) {
    for (const phrase of sideMissing) blockers.push("Side not stated: " + phrase);
  }
  for (const group of sideGroupMissing) blockers.push("Side not stated for " + group);
  return blockers;
}

export function buildReviewItems({
  report,
  library,
  unmatched = [],
  blockers = [],
  sideConflicts = [],
  spokenImpression = "",
  impressionUnmatched = []
}) {
  const items = [];
  const findingName = (id) => {
    const finding = library.findings.find((item) => item.id === id);
    return finding ? finding.name : id;
  };
  const add = (key, title, list) => {
    if (list.length > 0) items.push({ key, title, items: list });
  };

  add("unmatched", "Not written — no library match", unmatched);

  if (typeof spokenImpression === "string" && spokenImpression.trim() !== "") {
    const impressionItems = [
      "You also said this impression: " + spokenImpression.trim() + ". The report uses your saved lines."
    ];
    for (const phrase of impressionUnmatched) {
      impressionItems.push("Said in the impression but not as a finding: " + phrase);
    }
    add("spokenImpression", "Spoken impression", impressionItems);
  }

  add(
    "sideConflicts",
    "Side conflicts",
    sideConflicts.map((conflict) => {
      return (
        "Both sides were named for " + conflict.group + ": " +
        conflict.findings.map(findingName).join(", ") +
        "."
      );
    })
  );

  if (report) {
    add(
      "conflicts",
      "Segment conflicts — both texts are shown",
      report.flags.conflicts.map((conflict) => {
        const names = conflict.findings.map(findingName).join(" and ");
        return names + " both replace the same sentence.";
      })
    );
    add(
      "forConfirmation",
      "Findings marked for confirmation",
      report.flags.forConfirmation.map((id) => findingName(id))
    );
    add(
      "missingImpressions",
      "Highlighted impression blanks",
      report.flags.missingImpressions.map((id) => findingName(id) + ": impression is blank")
    );
    add(
      "unmatchedAdv",
      "Highlighted Adv: lines to check",
      report.adv.filter((line) => line.highlighted).map((line) => line.text)
    );
  }

  add("blockers", "Must choose before Final", blockers);

  return items;
}
