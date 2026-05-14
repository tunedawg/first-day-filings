const path = require("node:path");
const fs = require("node:fs");

const KC_FIRM_CARE_OF = "c/o Keenan & Bhatia, LLC\n4600 Madison Ave., Ste. 810\nKansas City, MO 64112";
const STL_FIRM_CARE_OF = "c/o Keenan & Bhatia, LLC\n4625 Lindell Blvd, Ste. 200\nSt. Louis, MO 63108";
const KC_FIRM_BLOCK = "4600 Madison Ave. Ste. 810\nKansas City, Missouri 64112\n(816) 809-2100";
const STL_FIRM_BLOCK = "4625 Lindell Blvd. Ste. 200\nSt. Louis, Missouri 63108\n(314) 987-2273";

const ATTORNEYS = {
  edward_keenan: { displayName: "Edward (E.E.) Keenan", rosterLine: "Edward (E.E.) Keenan (Mo. #62993)", email: "ee@keenanfirm.com" },
  sonal_bhatia:  { displayName: "Sonal Bhatia",          rosterLine: "Sonal Bhatia (Mo. #67519)",          email: "sonal@keenanfirm.com" },
  jr_montgomery: { displayName: "JR Montgomery",          rosterLine: "JR Montgomery (Mo. #68281)",          email: "jr@keenanfirm.com" },
  aaron_hadlow:  { displayName: "Aaron Hadlow",           rosterLine: "Aaron Hadlow (Mo. #70987)",           email: "aaron@keenanfirm.com" },
  hilary_orzick: { displayName: "Hilary J. Orzick",       rosterLine: "Hilary J. Orzick (Mo. #78359)",       email: "hilary@keenanfirm.com" },
};

function getPetitionRegistry() {
  const registryPath = path.join(__dirname, "..", "templates", "petition-registry.json");
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function buildCourtHeader(court = {}) {
  if (court.circuitLabel) return court.circuitLabel;

  const county = (court.county || "[COUNTY]").trim();
  const upper = county.toUpperCase();
  const hasCounty = upper.includes("COUNTY") || upper.includes("CITY");
  let header = `IN THE CIRCUIT COURT OF ${upper}`;
  if (!hasCounty) header += " COUNTY";
  header += "\nSTATE OF MISSOURI";
  if (court.division) header += `\n${court.division.toUpperCase()}`;
  return header;
}


function buildDefendantsCaption(defendants = []) {
  return defendants.map((d, i) => {
    const addressLines = (d.serveAddress || "[SERVICE ADDRESS]").split("\n");
    const lines = [
      `${d.captionName};\t)`,
      `${d.serveLabel || "Serve at:"}\t)`,
      ...addressLines.map(l => `${l}\t)`),
    ];
    // Blank ) line between defendants keeps the column continuous.
    if (i < defendants.length - 1) lines.push("\t)");
    return lines.join("\n");
  }).join("\n");
}

function buildSignatureBlock(intake) {
  const isStl = intake.plaintiff?.firmOffice === "stl";
  const firmBlock = isStl ? STL_FIRM_BLOCK : KC_FIRM_BLOCK;

  const selectedIds = Array.isArray(intake.selectedAttorneys) && intake.selectedAttorneys.length > 0
    ? intake.selectedAttorneys
    : ["edward_keenan"];

  const signingId = intake.signingAttorney || selectedIds[0];
  const signingAtty = ATTORNEYS[signingId];
  const signingLine = signingAtty ? `/s/ ${signingAtty.displayName}` : "/s/ [Attorney Name]";

  const rosterLines = selectedIds.filter((id) => ATTORNEYS[id]).map((id) => ATTORNEYS[id].rosterLine).join("\n");
  const emailLines = selectedIds.filter((id) => ATTORNEYS[id]).map((id) => ATTORNEYS[id].email).join("\n");

  return `KEENAN & BHATIA, LLC\n\n${signingLine}\n${rosterLines}\n${firmBlock}\n${emailLines}`;
}

const PRONOUN_TO_POSSESSIVE = { he: "his", she: "her", they: "their" };

function formatLongDate(raw) {
  if (!raw) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return raw;
  const [, y, m, d] = match;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(+y, +m - 1, +d)));
}

function buildPetitionTokenMap(intake) {
  const court = intake.court || {};
  const plaintiff = intake.plaintiff || {};
  const defendants = Array.isArray(intake.defendants) ? intake.defendants : [];
  const possessive = plaintiff.possessivePronoun || PRONOUN_TO_POSSESSIVE[plaintiff.pronoun] || "their";

  return {
    "{{petitionCourtHeader}}":        buildCourtHeader(court),
    "{{petitionPlaintiffCaptionName}}": (plaintiff.captionName || plaintiff.fullName?.toUpperCase() || "[PLAINTIFF NAME]") + ",",
    "{{petitionFirmCareOf}}":         plaintiff.firmOffice === "stl" ? STL_FIRM_CARE_OF : KC_FIRM_CARE_OF,
    "{{petitionDefendantsCaption}}":  buildDefendantsCaption(defendants),
    "{{petitionCaseTypeLabel}}":      intake.caseTypeLabel || "",
    "{{petitionPlaintiffFullName}}":  plaintiff.fullName || "[Plaintiff Name]",
    "{{petitionIntroGenderClause}}":  possessive,
    "{{petitionPlaintiffRef}}":       plaintiff.refName || plaintiff.fullName || "[Plaintiff]",
    "{{petitionPartiesSection}}":     intake.partiesSection || "",
    "{{petitionJurisdictionVenue}}":  intake.jurisdictionVenue || "",
    "{{petitionFacts}}":              intake.facts || "",
    "{{petitionCounts}}":             intake.counts || "",
    "{{petitionPrayerItems}}":        intake.prayer || "",
    "{{petitionFilingDate}}":         formatLongDate(intake.filingDate) || intake.filingDate || "",
    "{{petitionSignatureBlock}}":     buildSignatureBlock(intake),
    "{{petitionAttorneyForLine}}":    `Attorneys for Plaintiff ${plaintiff.fullName || "[Plaintiff Name]"}`,
  };
}

function buildPetitionDocumentName(intake) {
  const plaintiff = intake.plaintiff?.fullName || "Plaintiff";
  const defendant = intake.collectiveDefendantRef || intake.defendants?.[0]?.refName || "Defendant";
  const lastName = plaintiff.split(" ").pop();
  return `${lastName}_${defendant} - Petition`;
}

module.exports = { buildPetitionTokenMap, buildPetitionDocumentName, getPetitionRegistry, ATTORNEYS };
