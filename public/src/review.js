export function buildReviewItems({ report, library, unmatched = [], blockers = [] }) {
  const items = [];
  const findingName = (id) => {
    const finding = library.findings.find((item) => item.id === id);
    return finding ? finding.name : id;
  };
  const add = (key, title, list) => {
    if (list.length > 0) items.push({ key, title, items: list });
  };

  add("unmatched", "Not written — no library match", unmatched);

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

  add("blockers", "Could not be used", blockers);

  return items;
}
