const { getTemplateRegistry } = require("./templateRegistry");

const DEFAULT_FIRM_NAME = "KEENAN & BHATIA, LLC";
const DEFAULT_FIRM_ADDRESS_BLOCK = "4600 Madison Ave. Ste. 810\nKansas City, Missouri 64112\n(816) 809-2100";
const DEFAULT_CORP_REP_LOCATION = "Known to Defendants.";
const DEFAULT_CORP_REP_DOCUMENT_REQUEST =
  "Pursuant to Mo. S. Ct. R. 57.03(b)(3), the deponent(s) are requested to produce prior to or at the deposition any materials on which they rely in giving their testimony.";
const DEFAULT_PRODUCTION_FORMAT_INSTRUCTIONS =
  "Please respond within thirty days (30) of service of these requests by producing the requested documents electronically, in native format where applicable, by email, secure file transfer, or other reasonably usable electronic means.";
const DEFAULT_RESPONSE_DELIVERY_INSTRUCTIONS =
  "Please respond within thirty days (30) of service of these interrogatories by serving verified responses and objections in accordance with the Missouri Rules of Civil Procedure.";
const DEFAULT_ESI_INSTRUCTION_TEXT =
  "Electronically stored information (\"ESI\") shall be produced in reasonably usable form, including native format where appropriate, together with metadata or load-file information ordinarily maintained in the usual course of business.";
const CLAIM_LABELS = {
  race: "Race discrimination",
  color: "Color discrimination",
  age: "Age discrimination",
  sex: "Sex discrimination",
  disability: "Disability discrimination",
  associational: "Associational discrimination",
  retaliation: "Retaliation",
  workers_comp: "Workers' compensation retaliation",
  whistleblower: "Whistleblower retaliation",
  rsmo_105_055: "RSMo 105.055",
};
const ADVERSE_ACTION_LABELS = {
  discipline: "Discipline",
  pip: "Performance Improvement Plan",
  schedule_reduction: "Schedule reduction",
  termination: "Termination",
  denial_of_accommodation: "Denial of accommodation",
};
const ATTORNEY_DIRECTORY = {
  edward_keenan: {
    displayName: "Edward (E.E.) Keenan",
    rosterLine: "Edward (E.E.) Keenan (Mo. #62993)",
    email: "ee@keenanfirm.com",
  },
  sonal_bhatia: {
    displayName: "Sonal Bhatia",
    rosterLine: "Sonal Bhatia (Mo. #67519)",
    email: "sonal@keenanfirm.com",
  },
  jr_montgomery: {
    displayName: "JR Montgomery",
    rosterLine: "JR Montgomery (Mo. #68281)",
    email: "jr@keenanfirm.com",
  },
  aaron_hadlow: {
    displayName: "Aaron Hadlow",
    rosterLine: "Aaron Hadlow (Mo. #70987)",
    email: "aaron@keenanfirm.com",
  },
  hilary_orzick: {
    displayName: "Hilary J. Orzick",
    rosterLine: "Hilary J. Orzick (Mo. #78359)",
    email: "hilary@keenanfirm.com",
  },
};

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.join("\n");
  }

  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function buildTokenMap(intake) {
  const enrichedIntake = {
    ...intake,
    courtName: buildCourtName(intake),
    plaintiffReferenceName: buildPlaintiffReference(intake),
    plaintiffNameFormal: toTitleCase(normalizeValue(intake.plaintiffName)),
    defendantNameFormal: toTitleCase(normalizeValue(intake.defendantName)),
    firmName: normalizeValue(intake.firmName) || DEFAULT_FIRM_NAME,
    firmAddressBlock: normalizeValue(intake.firmAddressBlock) || DEFAULT_FIRM_ADDRESS_BLOCK,
    signingAttorney: resolveSigningAttorneyName(intake.signingAttorney),
    attorneyForLine: buildAttorneyForLine(intake),
    anAttorneyForPlaintiff: buildAnAttorneyForLine(intake),
    zoomContactName: resolveSigningAttorneyName(intake.signingAttorney),
    zoomContactEmail: resolveSigningAttorneyEmail(intake.signingAttorney),
    attorneyRoster: buildAttorneyRoster(intake.includedAttorneys),
    attorneyEmails: buildAttorneyEmails(intake.includedAttorneys),
    defendantReferenceName: buildDefendantReference(intake),
    collectiveDefendantShortName: buildDefendantShortName(intake),
    targetDefendants: buildTargetDefendants(intake),
    targetDefendantsFormal: buildTargetDefendantsFormal(intake),
    allDefendantsFormal: buildAllDefendantsFormal(intake),
    responseDeliveryInstructions: DEFAULT_RESPONSE_DELIVERY_INSTRUCTIONS,
    productionFormatInstructions: DEFAULT_PRODUCTION_FORMAT_INSTRUCTIONS,
    esiInstructionText: DEFAULT_ESI_INSTRUCTION_TEXT,
    interrogatorySetLabel: "(First Set)",
    rfpSetLabel: "(First Set)",
    protectiveOrderActionName: buildProtectiveOrderActionName(intake),
    matterFolderName: buildMatterFolderName(intake),
    additionalRoleBasedPersons: buildAdditionalRoleBasedPersons(intake),
    serviceDate: formatLongDate(intake.serviceDate) || normalizeValue(intake.serviceDate),
    employmentDateRange: buildLookbackDateRange(intake.serviceDate),
    accommodationDateRange: buildLookbackDateRange(intake.serviceDate),
    corpRepEntity: buildCorpRepEntity(intake),
    corpRepLocation: DEFAULT_CORP_REP_LOCATION,
    corpRepDateTime: buildCorpRepDateTime(intake),
    corpRepFormat: buildCorpRepFormat(intake),
    corpRepDocumentRequest: DEFAULT_CORP_REP_DOCUMENT_REQUEST,
    corpRepTopics: buildCorpRepTopicsBlock(intake),
    confidentialityExamples: "",
    programName: buildProgramName(intake),
    ...buildPronounFields(intake.plaintiffGender),
    plaintiffNameVariationsList: "",
  };

  const directTokens = Object.entries(enrichedIntake).reduce((accumulator, [key, value]) => {
    accumulator[`{{${key}}}`] = normalizeValue(value);
    return accumulator;
  }, {});

  const keyPersons = splitLines(enrichedIntake.keyPersonsList).map(stripRoleDescription);
  const roleBasedPersons = splitLines(enrichedIntake.additionalRoleBasedPersons).map(stripRoleDescription);
  const combinedSubjects = [...keyPersons, ...roleBasedPersons];
  const comparatorEntries = buildComparatorEntries(enrichedIntake);
  const decisionMakerEntries = buildDecisionMakerEntries(enrichedIntake);
  const corpRepIssueTopics = buildCorpRepIssueTopicEntries(enrichedIntake);
  const interrogatoryIssuePrompts = buildInterrogatoryIssuePromptEntries(enrichedIntake);
  const interrogatoryActorComplaintParagraphs = buildInterrogatoryActorComplaintParagraphs(enrichedIntake);
  const interrogatoryTrioMetricsParagraph = buildInterrogatoryTrioMetricsParagraph(enrichedIntake);
  const rfpPlaintiffCommunicationsParagraphs = buildRfpPlaintiffCommunicationsParagraphs(enrichedIntake);
  const rfpActorComplaintParagraphs = buildRfpActorComplaintParagraphs(enrichedIntake);
  const rfpSupervisorCoachingParagraph = buildRfpSupervisorCoachingParagraph(enrichedIntake);
  const rfpSupervisorEmployeeListParagraph = buildRfpSupervisorEmployeeListParagraph(enrichedIntake);
  const rfpSupervisorSeparationParagraph = buildRfpSupervisorSeparationParagraph(enrichedIntake);
  const rfpPlaintiffDisciplineParagraphs = buildRfpPlaintiffDisciplineParagraphs(enrichedIntake);
  const rfpSupervisorTrainingParagraph = buildRfpSupervisorTrainingParagraph(enrichedIntake);
  const rfpSupervisorPeerTrainingParagraph = buildRfpSupervisorPeerTrainingParagraph(enrichedIntake);
  const rfpTrioIssueParagraphs = buildRfpTrioIssueParagraphs(enrichedIntake);

  const omnibusDeponentTokens = buildOmnibusIndividualTokens(enrichedIntake);
  const plaintiffSubjectEntry = toTitleCase(normalizeValue(enrichedIntake.plaintiffName)) || "Plaintiff";
  const fullSubjectList = [plaintiffSubjectEntry, ...combinedSubjects];
  const rfpFullSubjectList = [
    ...fullSubjectList,
    "Any person whom you may call to testify or otherwise give evidence (e.g., a statement or affidavit) in this action.",
  ];

  const individualRfpActorTokens = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      `{{rfpActorComplaintParagraph${i + 1}}}`,
      rfpActorComplaintParagraphs[i] || "",
    ]),
  );
  const individualRfpCommsTokens = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      `{{rfpPlaintiffCommunicationsParagraph${i + 1}}}`,
      rfpPlaintiffCommunicationsParagraphs[i] || "",
    ]),
  );
  const individualRogActorTokens = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      `{{interrogatoryActorComplaintParagraph${i + 1}}}`,
      interrogatoryActorComplaintParagraphs[i] || "",
    ]),
  );
  const individualRfpTrioIssueTokens = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      `{{rfpTrioIssueParagraph${i + 1}}}`,
      rfpTrioIssueParagraphs[i] || "",
    ]),
  );

  const punctuateListItems = (entries) =>
    entries.map((entry, i, arr) => {
      const clean = entry.trimEnd();
      return /[.;]$/.test(clean) ? clean : i === arr.length - 1 ? `${clean}.` : `${clean};`;
    });

  const listTokens = {
    "{{rfpSubjectListBlock}}": punctuateListItems(rfpFullSubjectList),
    "{{rfpEmailBoxSubjectListBlock}}": punctuateListItems(fullSubjectList),
    "{{corpRepIssueTopicsBlock}}": corpRepIssueTopics,
    "{{rfpActorComplaintParagraphsBlock}}": { items: rfpActorComplaintParagraphs.filter(Boolean), appendPerItem: "RESPONSE:" },
    "{{rfpPlaintiffCommunicationsBlock}}": { items: rfpPlaintiffCommunicationsParagraphs.filter(Boolean), appendPerItem: "RESPONSE:" },
    "{{interrogatory3SubjectsBlock}}": punctuateListItems(fullSubjectList),
    "{{interrogatoryActorComplaintParagraphsBlock}}": { items: interrogatoryActorComplaintParagraphs.filter(Boolean), appendPerItem: "ANSWER:" },
  };

  const tokenMap = {
    ...directTokens,
    ...omnibusDeponentTokens,
    ...individualRfpActorTokens,
    ...individualRfpCommsTokens,
    ...individualRogActorTokens,
    ...individualRfpTrioIssueTokens,
    "{{omnibusScheduleBlocks}}": renderOmnibusScheduleBlocks(buildOmnibusDeponents(enrichedIntake)),
    "{{attorneyRosterBlock}}": renderLineList(enrichedIntake.attorneyRoster),
    "{{attorneyEmailBlock}}": renderLineList(enrichedIntake.attorneyEmails),
    "{{keyPersonsBlock}}": renderNumberedList(enrichedIntake.keyPersonsList),
    "{{additionalRoleBasedPersonsBlock}}": renderLetteredList(enrichedIntake.additionalRoleBasedPersons),
    "{{claimsAndCountsBlock}}": renderNumberedList(enrichedIntake.claimsAndCounts),
    "{{protectedTraitsBlock}}": renderNumberedList(enrichedIntake.protectedTraits),
    "{{retaliationActivitiesBlock}}": renderNumberedList(enrichedIntake.retaliationActivities),
    "{{interrogatoryProtectedStatusFields}}": buildInterrogatoryProtectedStatusFields(enrichedIntake),
    "{{interrogatoryComplaintTypes}}": buildInterrogatoryComplaintTypes(enrichedIntake),
    "{{rogPersonDemographicComma}}": buildRogPersonDemographicComma(enrichedIntake),
    "{{rogComplainantDemoCommaAnd}}": buildRogComplainantDemoCommaAnd(enrichedIntake),
    "{{rogComplainantProfileDemographics}}": buildRogComplainantProfileDemographics(enrichedIntake),
    "{{rogComplaintScopeOrPhrase}}": buildRogComplaintScopeOrPhrase(enrichedIntake),
    "{{employmentDateRange}}": `${buildLookbackStart(enrichedIntake)} to the present`,
    "{{adverseActionsBlock}}": renderNumberedList(enrichedIntake.adverseActions),
    "{{complaintTypesBlock}}": renderNumberedList(enrichedIntake.complaintTypes),
    "{{comparatorGroupsBlock}}": renderNumberedEntries(comparatorEntries),
    "{{decisionMakersBlock}}": renderNumberedEntries(decisionMakerEntries),
    "{{interrogatoryIssuePromptsBlock}}": renderNumberedEntries(interrogatoryIssuePrompts),
    "{{interrogatoryTrioMetricsParagraph}}": normalizeValue(interrogatoryTrioMetricsParagraph),
    "{{corpRepTopicsBlock}}": normalizeValue(enrichedIntake.corpRepTopics),
    "{{confidentialityExamplesBlock}}": renderLineList(enrichedIntake.confidentialityExamples),
    "{{rfpSupervisorCoachingParagraph}}": normalizeValue(rfpSupervisorCoachingParagraph),
    "{{rfpSupervisorEmployeeListParagraph}}": normalizeValue(rfpSupervisorEmployeeListParagraph),
    "{{rfpSupervisorSeparationParagraph}}": normalizeValue(rfpSupervisorSeparationParagraph),
    "{{rfpPlaintiffDisciplineParagraphsBlock}}": renderParagraphBlock(rfpPlaintiffDisciplineParagraphs),
    "{{rfpSupervisorTrainingParagraph}}": normalizeValue(rfpSupervisorTrainingParagraph),
    "{{rfpSupervisorPeerTrainingParagraph}}": normalizeValue(rfpSupervisorPeerTrainingParagraph),
    "{{rfpTrioIssueParagraphsBlock}}": renderParagraphBlock(rfpTrioIssueParagraphs),
  };

  return { tokenMap, listTokens };
}

function buildCourtName(intake) {
  const explicitCourtName = normalizeValue(intake.courtName);
  if (explicitCourtName) {
    return explicitCourtName;
  }

  const county = normalizeValue(intake.courtCounty);
  if (!county) {
    return "";
  }

  return `IN THE CIRCUIT COURT OF ${county.toUpperCase()} COUNTY\nSTATE OF MISSOURI`;
}

function toTitleCase(value) {
  return normalizeValue(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Active directory is ATTORNEY_DIRECTORY by default; swapped per-request when DB attorneys are provided.
let _activeDirectory = ATTORNEY_DIRECTORY;

function setAttorneyDirectory(attorneys) {
  if (!Array.isArray(attorneys) || attorneys.length === 0) {
    _activeDirectory = ATTORNEY_DIRECTORY;
    return;
  }
  const dir = {};
  for (const a of attorneys) {
    dir[a.id] = {
      displayName: a.full_name,
      rosterLine: `${a.full_name} (Mo. #${a.bar_number})`,
      email: a.email || "",
    };
  }
  _activeDirectory = dir;
}

function resolveSigningAttorneyName(attorneyId) {
  return _activeDirectory[attorneyId]?.displayName || normalizeValue(attorneyId);
}

function resolveSigningAttorneyEmail(attorneyId) {
  return _activeDirectory[attorneyId]?.email || "";
}

function buildAttorneyForLine(intake) {
  const plaintiffName = toTitleCase(intake.plaintiffName);
  return plaintiffName ? `Attorneys for Plaintiff ${plaintiffName}` : "Attorneys for Plaintiff";
}

function buildAnAttorneyForLine(intake) {
  const plaintiffName = toTitleCase(intake.plaintiffName);
  return plaintiffName ? `An attorney for Plaintiff ${plaintiffName}` : "An attorney for Plaintiff";
}

function buildAttorneyRoster(selectedAttorneyIds) {
  return ensureAttorneySelection(selectedAttorneyIds)
    .map((attorneyId) => _activeDirectory[attorneyId]?.rosterLine)
    .filter(Boolean)
    .join("\n");
}

function buildAttorneyEmails(selectedAttorneyIds) {
  return ensureAttorneySelection(selectedAttorneyIds)
    .map((attorneyId) => _activeDirectory[attorneyId]?.email)
    .filter(Boolean)
    .join("\n");
}

function buildTargetDefendants(intake) {
  const defendants = splitLines(intake.allDefendants);
  const referenceName = normalizeValue(intake.defendantReferenceName) || buildDefendantPartyLabel(intake);
  const partyLabel = buildDefendantPartyLabel(intake);

  if (defendants.length === 0) {
    return "";
  }

  if (defendants.length === 1) {
    return `${defendants[0]} ("${referenceName}" or "${partyLabel}")`;
  }

  const joinedDefendants =
    defendants.length === 2
      ? `${defendants[0]} and ${defendants[1]}`
      : `${defendants.slice(0, -1).join(", ")}, and ${defendants[defendants.length - 1]}`;

  return `${joinedDefendants} ("${referenceName}" or "${partyLabel}")`;
}

function buildCorpRepEntity(intake) {
  return `Corporate Representative(s) for ${buildDefendantPartyLabel(intake)}`;
}

function buildMatterFolderName(intake) {
  const plaintiffLastName = toTitleCase(extractLastName(intake.plaintiffName)) || "Plaintiff";
  const defendantShortName =
    normalizeValue(intake.collectiveDefendantShortName) ||
    normalizeValue(intake.defendantReferenceName) ||
    buildDefendantPartyLabel(intake);

  return `${plaintiffLastName} v. ${defendantShortName}`;
}

function buildProtectiveOrderActionName(intake) {
  const caption = normalizeValue(intake.protectiveOrderActionCaption);
  const caseNumber = normalizeValue(intake.protectiveOrderActionCaseNumber) || normalizeValue(intake.caseNumber);

  if (caption && caseNumber) {
    return `${caption}, Case No. ${caseNumber}`;
  }

  if (caption) {
    return caption;
  }

  if (normalizeValue(intake.protectiveOrderActionName)) {
    return normalizeValue(intake.protectiveOrderActionName);
  }

  return "";
}

function buildAdditionalRoleBasedPersons(intake) {
  const ref = buildPlaintiffReference(intake);
  const defendant = buildDefendantReference(intake);
  return [
    `Any person who participated in the decision to discipline ${ref}`,
    `Any person who participated in ${ref}'s accommodation process at ${defendant}`,
    `Any person who supervised ${ref}`,
    `Any person supervised by a person who supervised ${ref}, from the beginning of ${ref}'s employment to its end`,
    `Any person who replaced ${ref} or assumed any part of ${ref}'s job functions following ${ref}'s departure from ${defendant}`,
  ].join("\n");
}

function buildPlaintiffReference(intake) {
  return normalizeValue(intake.plaintiffReferenceName) || normalizeValue(intake.plaintiffName) || "Plaintiff";
}

function buildDefendantShortName(intake) {
  return (
    normalizeValue(intake.collectiveDefendantShortName) ||
    normalizeValue(intake.defendantReferenceName) ||
    normalizeValue(intake.defendantName) ||
    "Defendant"
  );
}

function buildCorpRepDateTime(intake) {
  const date = formatLongDate(intake.corpRepDate);
  const time = normalizeValue(intake.corpRepTime);

  if (!date && !time) {
    return "";
  }

  if (!date) {
    return `As agreed by the parties or in the absence of such agreement, at ${time}.`;
  }

  if (!time) {
    return `As agreed by the parties or in the absence of such agreement, ${date}.`;
  }

  return `As agreed by the parties or in the absence of such agreement, ${date}, at ${time}.`;
}

function buildCorpRepFormat(intake) {
  const contactName = resolveSigningAttorneyName(intake.signingAttorney);
  const contactEmail = resolveSigningAttorneyEmail(intake.signingAttorney);

  if (!contactEmail) {
    return "Via Zoom.";
  }

  return `Via Zoom. Please contact ${contactName} at ${contactEmail} for Zoom details prior to the deposition.`;
}

function buildCorpRepTopicsBlock(intake) {
  return buildCorpRepIssueTopicEntries(intake).join("\n\n");
}

function ensureAttorneySelection(selectedAttorneyIds) {
  if (Array.isArray(selectedAttorneyIds) && selectedAttorneyIds.length > 0) {
    return selectedAttorneyIds.filter((attorneyId) => _activeDirectory[attorneyId]);
  }

  return [];
}

function buildDefendantReference(intake) {
  return (
    normalizeValue(intake.defendantReferenceName) ||
    normalizeValue(intake.collectiveDefendantShortName) ||
    normalizeValue(intake.defendantName) ||
    buildDefendantPartyLabel(intake)
  );
}

function stripRoleDescription(entry) {
  const idx = entry.indexOf(", ");
  return idx !== -1 ? entry.slice(0, idx).trim() : entry;
}

function buildNamedActorList(intake, limit = 8) {
  const plaintiffName = normalizeValue(intake.plaintiffName).toLowerCase();
  const seen = new Set();

  return splitLines(intake.keyPersonsList)
    .map(stripRoleDescription)
    .filter((name) => {
      const normalizedName = normalizeValue(name);
      if (!normalizedName) {
        return false;
      }

      const lowerName = normalizedName.toLowerCase();
      if (lowerName === plaintiffName || seen.has(lowerName)) {
        return false;
      }

      seen.add(lowerName);
      return true;
    })
    .slice(0, limit);
}

function buildPrimarySupervisor(intake) {
  const supervisors = splitLines(intake.supervisors);
  if (supervisors.length > 0) {
    return supervisors[0];
  }

  const actors = buildNamedActorList(intake, 1);
  return actors[0] || "the relevant supervisor";
}

function buildPrimaryActor(intake) {
  const actors = buildNamedActorList(intake, 1);
  return actors[0] || "the relevant employee";
}

function buildDefendantPartyLabel(intake) {
  return splitLines(intake.allDefendants).length > 1 ? "Defendants" : "Defendant";
}

function buildCorpRepActorNames(intake) {
  const plaintiffName = normalizeValue(intake.plaintiffName).toLowerCase();
  const names = splitLines(intake.keyPersonsList).filter((name) => name.toLowerCase() !== plaintiffName);
  return Array.from(new Set(names));
}

function buildComparatorReference(intake) {
  const comparatorEntries = buildComparatorEntries(intake);
  if (comparatorEntries.length > 0) {
    return comparatorEntries[0].replace(/^[^:]+:\s*/i, "").replace(/^(employees|employee)\s+in\s+/i, "");
  }

  return `the relevant work unit at ${buildDefendantReference(intake)}`;
}

function buildWorkLocationReference(intake) {
  const courtDivision = normalizeValue(intake.courtDivision);
  if (courtDivision) {
    return `${buildDefendantReference(intake)}'s ${courtDivision} location where ${normalizeValue(intake.plaintiffName) || "Plaintiff"} worked`;
  }

  return `the ${buildDefendantReference(intake)} location where ${normalizeValue(intake.plaintiffName) || "Plaintiff"} worked`;
}

function buildLookbackDateRange(serviceDate) {
  return `${buildLookbackStart(serviceDate)} to present`;
}

function extractLastName(fullName) {
  const parts = normalizeValue(fullName)
    .split(/\s+/)
    .filter(Boolean);

  return parts.length > 0 ? parts[parts.length - 1] : "";
}

function joinWithCommasAndAnd(entries) {
  if (entries.length === 0) {
    return "";
  }

  if (entries.length === 1) {
    return entries[0];
  }

  if (entries.length === 2) {
    return `${entries[0]} and ${entries[1]}`;
  }

  return `${entries.slice(0, -1).join(", ")}, and ${entries[entries.length - 1]}`;
}

function pushUniqueTopic(topics, topic) {
  const cleanedTopic = normalizeTopicSentence(topic);
  if (!cleanedTopic) {
    return;
  }

  const normalizedTopic = cleanedTopic.toLowerCase().replace(/\s+/g, " ");
  if (topics.some((existingTopic) => existingTopic.toLowerCase().replace(/\s+/g, " ") === normalizedTopic)) {
    return;
  }

  topics.push(cleanedTopic);
}

function normalizeTopicSentence(topic) {
  const value = normalizeValue(topic).replace(/^\d+[.)]\s*/, "");
  if (!value) {
    return "";
  }

  return /[.?!]$/.test(value) ? value : `${value}.`;
}

function normalizeDecisionMakerEntry(entry) {
  const value = normalizeValue(entry);
  if (!value) {
    return "";
  }

  if (/^persons?\s+/i.test(value)) {
    return value.toLowerCase();
  }

  return value;
}

function parseJsonArray(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderLineList(rawValue) {
  return splitLines(rawValue).join("");
}

function renderNumberedList(rawValue) {
  return splitLines(rawValue)
    .map((entry, index) => `${index + 1}. ${entry}`)
    .join("");
}

function renderNumberedEntries(entries) {
  return entries.map((entry, index) => `${index + 1}. ${entry}`).join("");
}

function renderLetteredList(rawValue) {
  return renderLetteredEntries(splitLines(rawValue));
}

function renderParagraphBlock(entries) {
  return entries.filter(Boolean).join("\n");
}

function splitLines(rawValue) {
  return normalizeValue(rawValue)
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeClaimsAndCounts(intake) {
  const claimValues = Array.isArray(intake.claimsAndCounts)
    ? intake.claimsAndCounts
    : splitLines(intake.claimsAndCounts);

  const normalizedClaims = claimValues
    .map((claim) => CLAIM_LABELS[claim] || claim)
    .filter(Boolean);

  if (
    (Array.isArray(intake.claimsAndCounts) ? intake.claimsAndCounts : []).includes("associational") &&
    normalizeValue(intake.associationalClarification)
  ) {
    return normalizedClaims.map((claim) =>
      claim === "Associational discrimination"
        ? `Associational discrimination (${normalizeValue(intake.associationalClarification)})`
        : claim,
    );
  }

  return normalizedClaims;
}

function getClaimKeys(intake) {
  const rawClaims = Array.isArray(intake.claimsAndCounts)
    ? intake.claimsAndCounts
    : splitLines(intake.claimsAndCounts);

  return rawClaims.map((claim) => normalizeValue(claim).toLowerCase()).filter(Boolean);
}

function claimKeysInclude(claimKeys, matchers) {
  return claimKeys.some((claim) => matchers.some((matcher) => matcher.test(claim)));
}

function buildInterrogatoryProtectedStatusFields(intake) {
  const claimKeys = getClaimKeys(intake);
  const explicitTraits = splitLines(intake.protectedTraits).map((trait) => trait.toLowerCase());
  const fields = [];

  if (
    claimKeysInclude(claimKeys, [/\brace\b/, /race discrimination/]) ||
    explicitTraits.some((trait) => /\brace\b/.test(trait))
  ) {
    fields.push("race");
  }

  if (
    claimKeysInclude(claimKeys, [/\bcolor\b/, /color discrimination/]) ||
    explicitTraits.some((trait) => /\bcolor\b/.test(trait))
  ) {
    fields.push("color");
  }

  if (
    claimKeysInclude(claimKeys, [/\bage\b/, /age discrimination/]) ||
    explicitTraits.some((trait) => /\bage\b/.test(trait))
  ) {
    fields.push("age");
  }

  if (
    claimKeysInclude(claimKeys, [/\bsex\b/, /\bgender\b/, /sex discrimination/]) ||
    explicitTraits.some((trait) => /\bsex\b|\bgender\b/.test(trait))
  ) {
    fields.push("sex");
  }

  if (
    claimKeysInclude(claimKeys, [/\bdisability\b/, /failure to accommodate/, /\bassociational\b/]) ||
    explicitTraits.some((trait) => /\bdisab|accommodat|associat/.test(trait))
  ) {
    fields.push("known disability status");
  }

  return joinWithCommasAndAnd(fields.length > 0 ? fields : ["protected characteristics or statuses at issue"]);
}

function buildInterrogatoryComplaintTypes(intake) {
  const claimKeys = getClaimKeys(intake);
  const complaintTypes = [];

  if (claimKeysInclude(claimKeys, [/\brace\b/, /race discrimination/])) {
    complaintTypes.push("race discrimination");
  }

  if (claimKeysInclude(claimKeys, [/\bcolor\b/, /color discrimination/])) {
    complaintTypes.push("color discrimination");
  }

  if (claimKeysInclude(claimKeys, [/\bage\b/, /age discrimination/])) {
    complaintTypes.push("age discrimination");
  }

  if (claimKeysInclude(claimKeys, [/\bsex\b/, /\bgender\b/, /sex discrimination/])) {
    complaintTypes.push("sex discrimination");
  }

  if (claimKeysInclude(claimKeys, [/\bdisability\b/, /failure to accommodate/])) {
    complaintTypes.push("disability discrimination or failure to accommodate");
  }

  if (claimKeysInclude(claimKeys, [/\bassociational\b/])) {
    complaintTypes.push("associational discrimination");
  }

  if (claimKeysInclude(claimKeys, [/\bretaliation\b/])) {
    complaintTypes.push("retaliation");
  }

  if (claimKeysInclude(claimKeys, [/workers'?_?\s*comp/, /workers'? compensation/])) {
    complaintTypes.push("workers' compensation retaliation");
  }

  if (claimKeysInclude(claimKeys, [/\bwhistleblower\b/, /105\.055/, /rsmo_105_055/])) {
    complaintTypes.push("whistleblowing or violations of RSMo 105.055");
  }

  return joinWithCommasAndAnd(complaintTypes.length > 0 ? complaintTypes : ["discrimination or retaliation"]);
}

// Generates "race, age, known disability status, " (with trailing ", ") for insertion into a
// comma-separated field list. Returns "" when no demographic claims are active.
function buildRogPersonDemographicComma(intake) {
  const claimKeys = getClaimKeys(intake);
  const fields = [];
  if (claimKeysInclude(claimKeys, [/\brace\b/, /\bcolor\b/])) fields.push("race");
  if (claimKeysInclude(claimKeys, [/\bage\b/])) fields.push("age");
  if (claimKeysInclude(claimKeys, [/\bdisability\b/, /failure.to.accommodate/, /\bassociational\b/])) fields.push("known disability status");
  return fields.length > 0 ? fields.join(", ") + ", " : "";
}

// Generates ", race, age, known disability status, and" or " and" (no demographics) for use
// inside the phrase "the identity{{rogComplainantDemoCommaAnd}} contact information".
function buildRogComplainantDemoCommaAnd(intake) {
  const claimKeys = getClaimKeys(intake);
  const fields = [];
  if (claimKeysInclude(claimKeys, [/\brace\b/, /\bcolor\b/])) fields.push("race");
  if (claimKeysInclude(claimKeys, [/\bage\b/])) fields.push("age");
  if (claimKeysInclude(claimKeys, [/\bdisability\b/, /failure.to.accommodate/, /\bassociational\b/])) fields.push("known disability status");
  return fields.length > 0 ? ", " + fields.join(", ") + ", and" : " and";
}

// Generates the demographic profile fields for the "all complainants" rog (rog 4).
// Returns "race, age, known disability status, whether they have ever had a workplace injury, "
// (only the relevant fields) with trailing ", ", or "" if none apply.
function buildRogComplainantProfileDemographics(intake) {
  const claimKeys = getClaimKeys(intake);
  const fields = [];
  if (claimKeysInclude(claimKeys, [/\brace\b/, /\bcolor\b/])) fields.push("race");
  if (claimKeysInclude(claimKeys, [/\bage\b/])) fields.push("age");
  if (claimKeysInclude(claimKeys, [/\bdisability\b/, /failure.to.accommodate/, /\bassociational\b/])) fields.push("known disability status");
  if (claimKeysInclude(claimKeys, [/workers.?comp/])) fields.push("whether they have ever had a workplace injury");
  return fields.length > 0 ? fields.join(", ") + ", " : "";
}

// Generates the complaint scope phrase for "reported any form of X to Defendant".
// E.g., "discrimination or retaliation", "workers' compensation retaliation",
// "discrimination, retaliation, or violations of RSMo 105.055".
function buildRogComplaintScopeOrPhrase(intake) {
  const claimKeys = getClaimKeys(intake);
  const categories = [];
  const hasDiscrim = claimKeysInclude(claimKeys, [/\brace\b/, /\bcolor\b/, /\bage\b/, /\bsex\b/, /\bgender\b/, /\bdisability\b/, /failure.to.accommodate/, /\bassociational\b/]);
  const hasRetaliation = claimKeysInclude(claimKeys, [/\bretaliation\b/]);
  const hasWorkersComp = claimKeysInclude(claimKeys, [/workers.?comp/]);
  const hasWhistleblower = claimKeysInclude(claimKeys, [/\bwhistleblower\b/, /rsmo_105_055/]);
  if (hasDiscrim) categories.push("discrimination");
  if (hasRetaliation) categories.push("retaliation");
  if (hasWorkersComp) categories.push("workers' compensation retaliation");
  if (hasWhistleblower) categories.push("violations of RSMo 105.055");
  return joinWithCommasAndAnd(categories.length > 0 ? categories : ["discrimination or retaliation"]);
}

function normalizeAdverseActions(intake) {
  const actionValues = Array.isArray(intake.adverseActions)
    ? intake.adverseActions
    : splitLines(intake.adverseActions);

  const normalizedActions = actionValues
    .filter((action) => action !== "other")
    .map((action) => ADVERSE_ACTION_LABELS[action] || action)
    .filter(Boolean);

  if (
    (Array.isArray(intake.adverseActions) ? intake.adverseActions : []).includes("other") &&
    normalizeValue(intake.adverseActionsOther)
  ) {
    normalizedActions.push(normalizeValue(intake.adverseActionsOther));
  }

  return normalizedActions;
}

function buildDecisionMakerEntries(intake) {
  const sections = [
    ["disciplineDecisionMakers", "Discipline decision-makers"],
    ["terminationDecisionMakers", "Termination decision-makers"],
    ["accommodationDecisionMakers", "Accommodation decision-makers"],
    ["leaveScheduleDecisionMakers", "Leave or schedule decision-makers"],
    ["complaintRecipients", "Complaint recipients"],
    ["hrParticipants", "HR participants"],
    ["supervisors", "Supervisors"],
    ["otherActors", "Other key actors"],
  ];

  return sections.flatMap(([fieldId, label]) => {
    const names = splitLines(intake[fieldId]);
    if (names.length === 0) {
      return [];
    }

    return `${label}: ${joinWithCommasAndAnd(names)}`;
  });
}

function buildComparatorEntries(intake) {
  const sections = [
    ["sameDepartmentComparators", "Same department or program comparators"],
    ["sameRoleComparators", "Same role or title comparators"],
    ["sameSupervisorComparators", "Same supervisor comparators"],
    ["sameDecisionMakerComparators", "Same decision-maker comparators"],
    ["accommodationComparators", "Accommodation comparators"],
    ["disciplineComparators", "Discipline or PIP comparators"],
    ["replacementComparators", "Replacement or successor comparators"],
    ["otherComparators", "Other comparator groups"],
  ];

  return sections.flatMap(([fieldId, label]) => {
    const entries = splitLines(intake[fieldId]);
    if (entries.length === 0) {
      return [];
    }

    return `${label}: ${joinWithCommasAndAnd(entries)}`;
  });
}

function buildInterrogatoryActorComplaintParagraphs(intake) {
  const actors = buildNamedActorList(intake, 6);
  const lookbackStart = buildLookbackStart(intake.serviceDate);

  if (actors.length === 0) {
    return [];
  }

  return actors.map(
    (actor) =>
      `Please identify all complaints, whether formal or informal, made by any employee against ${actor} from ${lookbackStart} to the present that involve allegations of any form of discrimination, retaliation, or other workplace misconduct. For each complaint, provide the identity, job title, and last known contact information of the person who made the complaint, a summary of the complaint and alleged conduct, to whom and when it was reported, the outcome or resolution, and whether any disciplinary action was taken.`,
  );
}

function buildRfpPlaintiffCommunicationsParagraphs(intake) {
  const actors = buildNamedActorList(intake, 6);
  const plaintiffReference = buildPlaintiffReference(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  const paragraphs = actors.map(
    (actor) =>
      `Please produce all communications between ${plaintiffReference} and ${actor} originating from or sent to any resource or program (e-mail, text, instant message, Slack, Teams, Whatsapp, etc.) associated with Defendants from ${lookbackStart} to present.`,
  );

  paragraphs.push(
    `Please produce all communications between ${plaintiffReference} and ${buildDefendantReference(intake)}'s Human Resources department or any employee therein originating from or sent to any resource or program (e-mail, text, instant message, Slack, Teams, Whatsapp, etc.) associated with Defendants from ${lookbackStart} to present.`,
  );

  return paragraphs;
}

function buildRfpActorComplaintParagraphs(intake) {
  const actors = buildNamedActorList(intake, 8);
  const defendantReference = buildDefendantReference(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  const claimKeys = getClaimKeys(intake);
  const whistleblowerClause = claimKeysInclude(claimKeys, [/\bwhistleblower\b/, /rsmo_105_055/])
    ? ", or violations of RSMo 105.055"
    : "";

  return actors.map(
    (actor) =>
      `Please produce all communications and documents which relate to any complaints made against or about ${actor} by any employee or former employee of ${defendantReference} for discrimination, retaliation${whistleblowerClause} from ${lookbackStart} to present.`,
  );
}

function buildInterrogatoryTrioMetricsParagraph(intake) {
  const defendantShortName = buildDefendantShortName(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  return `With respect to ${defendantShortName}'s annual key metrics reports, performance reports, grant-related reports, or similar submissions from ${lookbackStart} to present, identify the total number of persons or items reported, the actual figures underlying each submission, the name of every person who contributed to or approved each report, and describe in detail the methodology used to determine what was counted or reported.`;
}

function buildRfpSupervisorCoachingParagraph(intake) {
  const supervisor = buildPrimarySupervisor(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  return `Please produce all documents that reflect or relate to any coaching, performance counseling, or other performance-related guidance, whether formal or informal, which has been given to anyone under ${supervisor}'s supervision from ${lookbackStart} to the present.`;
}

function buildRfpSupervisorEmployeeListParagraph(intake) {
  const supervisor = buildPrimarySupervisor(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  return `Please produce all documents which constitute lists or charts of all employees supervised or overseen in any way by ${supervisor} from ${lookbackStart} to the present.`;
}

function buildRfpSupervisorSeparationParagraph(intake) {
  const supervisor = buildPrimarySupervisor(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  return `Please produce all documents which reflect the circumstances of the separation from employment of any employee who reported to ${supervisor} from ${lookbackStart} to the present.`;
}

function buildRfpPlaintiffDisciplineParagraphs(intake) {
  const plaintiffReference = buildPlaintiffReference(intake);
  const supervisor = buildPrimarySupervisor(intake);

  return [
    `Please produce all documents and communication related to placing ${plaintiffReference} on any formal verbal warning or similar disciplinary action, including but not limited to emails, meeting notes, performance reviews, HR documents, and internal communications among ${buildDefendantShortName(intake)} staff, including but not limited to ${supervisor}.`,
    `Please produce all documents and communication related to placing ${plaintiffReference} on any Performance Improvement Plan or similar remedial performance process, including but not limited to emails, meeting notes, performance reviews, HR documents, and internal communications among ${buildDefendantShortName(intake)} staff, including but not limited to ${supervisor}.`,
  ];
}

function buildRfpSupervisorTrainingParagraph(intake) {
  const supervisor = buildPrimarySupervisor(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  return `Please produce all documents reflecting training that ${supervisor} completed from ${lookbackStart} to the present, including trainings that relate to leave policies, including but not limited to medical and FMLA leave, and reasonable accommodations policies implemented by ${buildDefendantShortName(intake)}.`;
}

function buildRfpSupervisorPeerTrainingParagraph(intake) {
  const supervisor = buildPrimarySupervisor(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  return `Please produce all documents reflecting training that any other person with ${supervisor}'s job title completed from ${lookbackStart} to the present, including trainings that relate to leave policies, including but not limited to medical and FMLA leave, and reasonable accommodations policies implemented by ${buildDefendantShortName(intake)}.`;
}

function buildRfpTrioIssueParagraphs(intake) {
  const defendantShortName = buildDefendantShortName(intake);
  const defendantReference = buildDefendantReference(intake);
  const plaintiffReference = buildPlaintiffReference(intake);
  const primaryActor = buildPrimaryActor(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);

  return [
    `Produce all annual performance reports, key metrics reports, grant reports, compliance reports, or similar submissions made by ${defendantShortName} to any governmental agency, accrediting body, or funding source from ${lookbackStart} to present, including all drafts, revisions, and final submitted versions.`,
    `Produce all documents, spreadsheets, databases, rosters, and data compilations used to generate, calculate, or verify the figures included in those reports from ${lookbackStart} to present, including any source data pulled from ${defendantReference}'s internal systems.`,
    `Produce all communications between ${defendantShortName} and any governmental agency, accrediting body, or funding source from ${lookbackStart} to present regarding those reports, including any correspondence about reported figures, compliance, audits, or inquiries into the accuracy of submitted data.`,
    `Produce all communications, including emails, text messages, instant messages, voicemails, and written notes, between ${primaryActor} and any ${defendantShortName} employee, including ${plaintiffReference}, regarding the preparation, drafting, review, or submission of those reports from ${lookbackStart} to present.`,
    `Produce all documents related to any internal investigation conducted following reports, complaints, or concerns raised by ${plaintiffReference} regarding the accuracy of those reports, including the investigation plan, interview notes, witness statements, documents reviewed, findings, conclusions, and any related communications with administration or legal counsel.`,
    `Produce all documents that reflect the actual funding, grants, reimbursements, or other financial support received in connection with the program, grant, or business unit reflected in those reports from ${lookbackStart} to present.`,
    `Produce all training materials, policy documents, procedures, guidelines, or instructions provided to staff regarding the proper methodology for counting, reporting, or verifying data included in those reports.`,
    `Produce all documents, communications, or records reflecting any instruction, direction, or request made by ${primaryActor} or any other ${defendantShortName} employee to include, exclude, add, remove, or modify data in any such report submitted or intended for submission from ${lookbackStart} to present.`,
    `Produce all documents reflecting any audit, review, inquiry, correction, amendment, or resubmission of those reports from ${lookbackStart} to present, including any communications with outside agencies regarding the accuracy or correction of previously submitted data.`,
  ];
}

function buildCorpRepIssueTopicEntries(intake) {
  const defendant = buildDefendantShortName(intake);
  const claimKeys = getClaimKeys(intake);
  const adverseActionKeys = (Array.isArray(intake.adverseActions)
    ? intake.adverseActions
    : splitLines(intake.adverseActions)
  ).filter(Boolean);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  const namedActors = buildNamedActorList(intake, 4);
  const possessive = normalizeValue(intake.plaintiffPossessivePronoun) || "their";

  const hasDisability = claimKeysInclude(claimKeys, [/\bdisability\b/, /failure.to.accommodate/]);
  const hasAssociational = claimKeysInclude(claimKeys, [/\bassociational\b/]);
  const hasFMLA = claimKeysInclude(claimKeys, [/\bfmla\b/, /medical.leave/, /family.leave/]);
  const hasWorkersComp = claimKeysInclude(claimKeys, [/workers.?comp/]);
  const hasRetaliation = claimKeysInclude(claimKeys, [/\bretaliation\b/]);
  const hasWhistleblower = claimKeysInclude(claimKeys, [/\bwhistleblower\b/, /rsmo_105_055/]);
  const hasRace = claimKeysInclude(claimKeys, [/\brace\b/]);
  const hasSex = claimKeysInclude(claimKeys, [/\bsex\b/, /\bgender\b/]);
  const hasAge = claimKeysInclude(claimKeys, [/\bage\b/]);
  const hasColor = claimKeysInclude(claimKeys, [/\bcolor\b/]);

  // Derived: any status-based discrimination claim; any retaliation-type claim.
  const hasDiscrim = hasRace || hasColor || hasAge || hasSex || hasDisability || hasAssociational;
  const hasAnyRetaliation = hasRetaliation || hasWhistleblower || hasWorkersComp;
  // Complaint type phrase used in person-attribute topics.
  const complaintTypeParts = [hasDiscrim && "unlawful discrimination", hasAnyRetaliation && "retaliation"].filter(Boolean);
  const complaintTypePhrase = complaintTypeParts.join(" or ");

  const ADVERSE_ACTION_NOUN = {
    termination: "termination",
    discipline: "formal discipline",
    pip: "placement on a Performance Improvement Plan",
    schedule_reduction: "schedule reduction",
    denial_of_accommodation: "denial of accommodation",
  };
  const adverseActionNounPhrases = adverseActionKeys.map((k) => ADVERSE_ACTION_NOUN[k]).filter(Boolean);
  const adverseActionLabel =
    adverseActionNounPhrases.length > 0 ? joinWithCommasAndAnd(adverseActionNounPhrases) : "termination";

  const topics = [];

  topics.push(`Plaintiff's performance and disciplinary history at ${defendant}.`);

  {
    // Decision-maker topic: build attribute clauses based on active claims.
    const clauses = [];
    if (hasAge) clauses.push("their age");
    if (hasWorkersComp) clauses.push("whether they have ever sustained a workplace injury");
    if (complaintTypePhrase) clauses.push(`whether they have ever previously made complaints of ${complaintTypePhrase}`);
    if (clauses.length > 0) {
      topics.push(
        `The identities and roles of all persons who played any role in Plaintiff's ${adverseActionLabel}. ` +
        `For each such individual, provide ${joinWithCommasAndAnd(clauses)}.`,
      );
    } else {
      topics.push(`The identities and roles of all persons who played any role in Plaintiff's ${adverseActionLabel}.`);
    }
  }

  {
    // Replacement topic: build attribute clauses based on active claims.
    const clauses = [];
    if (hasAge) clauses.push("each such individual's age");
    if (complaintTypePhrase) clauses.push(`whether they had previously made complaints of ${complaintTypePhrase}`);
    if (hasWorkersComp) clauses.push("whether they had a workplace injury");
    if (clauses.length > 0) {
      topics.push(
        `The identity of the person(s) who replaced Plaintiff or assumed any of Plaintiff's job functions ` +
        `following Plaintiff's departure from ${defendant}, including ${joinWithCommasAndAnd(clauses)}.`,
      );
    } else {
      topics.push(
        `The identity of the person(s) who replaced Plaintiff or assumed any of Plaintiff's job functions ` +
        `following Plaintiff's departure from ${defendant}.`,
      );
    }
  }

  topics.push(
    `Your complete reasons for Plaintiff's ${adverseActionLabel}, including all underlying facts and ` +
    `information playing into each decision.`,
  );

  for (const actor of namedActors) {
    topics.push(
      `All complaints or reports of discrimination, harassment, and/or retaliation against ${actor} ` +
      `from ${lookbackStart} to present.`,
    );
  }

  if (hasRace) topics.push(`All complaints or reports of race discrimination at ${defendant} from ${lookbackStart} to present.`);
  if (hasColor) topics.push(`All complaints or reports of color discrimination at ${defendant} from ${lookbackStart} to present.`);
  if (hasAge) topics.push(`All complaints or reports of age discrimination at ${defendant} from ${lookbackStart} to present.`);
  if (hasSex) topics.push(`All complaints or reports of sex discrimination or sexual harassment at ${defendant} from ${lookbackStart} to present.`);
  if (hasDisability) topics.push(`All complaints or reports of disability discrimination or failure to accommodate at ${defendant} from ${lookbackStart} to present.`);
  if (hasAssociational) topics.push(`All complaints or reports of associational discrimination at ${defendant} from ${lookbackStart} to present.`);
  if (hasRetaliation) topics.push(`All complaints or reports of retaliation at ${defendant} from ${lookbackStart} to present.`);
  if (hasWhistleblower) topics.push(`All reports or incidents of whistleblowing or reports of illegal activity at ${defendant} from ${lookbackStart} to present.`);

  if (hasDisability || hasAssociational) {
    topics.push(`Plaintiff's request for a disability accommodation and Your handling of that request.`);
  }
  if (hasFMLA) {
    topics.push(`Plaintiff's requests for medical or family leave and Your handling of each request.`);
  }
  if (hasWorkersComp) {
    topics.push(`Plaintiff's workplace injury or workers' compensation claim, including Your handling of the injury report or claim.`);
    topics.push(`All workplace injury reports and workers' compensation claims at ${defendant} from ${lookbackStart} to present.`);
  }
  if (hasRetaliation) {
    topics.push(`All complaints or protected activity by Plaintiff that preceded any adverse employment action.`);
  }

  if (!hasWorkersComp) {
    topics.push(`All workplace injuries at ${defendant} from ${lookbackStart} to present.`);
  }

  topics.push(`All anti-discrimination, anti-harassment, and anti-retaliation policies.`);
  topics.push(`All policies outlining shifts in departments or changes in job roles.`);
  topics.push(`All policies and procedures relating to employee promotion, demotion, or role changes.`);
  topics.push(`All exit interviews or separation documentation for employees of ${defendant} from ${lookbackStart} to present.`);
  topics.push(`Your disciplinary policies and procedures, including the types of discipline available and progressive discipline practices.`);
  topics.push(`Any and all policies that You believe Plaintiff violated in the course of ${possessive} employment.`);
  topics.push(`Your document retention policies, litigation holds, and the preservation of emails, chats, and other electronically stored information related to Plaintiff's employment and departure.`);
  topics.push(`The location of any cameras in Plaintiff's work location.`);
  topics.push(`The demographic makeup of the ${defendant} location where Plaintiff worked, including the age of its employees.`);
  {
    // Separations topic: age inclusion and complaint/injury clauses are conditional.
    const ageClause = hasAge ? ", including age," : "";
    const trailingClauses = [];
    if (complaintTypePhrase) trailingClauses.push(`whether they have ever complained of ${complaintTypePhrase}`);
    if (hasWorkersComp) trailingClauses.push("whether they have ever reported a workplace injury");
    const trailingPhrase = trailingClauses.length > 0 ? `, ${joinWithCommasAndAnd(trailingClauses)}` : "";
    topics.push(
      `The identities${ageClause} of all individuals who have left ${defendant} voluntarily or been ` +
      `terminated since ${lookbackStart}${trailingPhrase}.`,
    );
  }

  return dedupeEntries(topics);
}

function buildInterrogatoryIssuePromptEntries(intake) {
  const claims = normalizeClaimsAndCounts(intake);
  const adverseActions = normalizeAdverseActions(intake);
  const decisionMakers = buildDecisionMakerEntries(intake);
  const comparatorEntries = buildComparatorEntries(intake);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  const prompts = [];

  if (decisionMakers.length > 0) {
    prompts.push(
      `All persons who participated in the decisions, communications, approvals, or implementation of the challenged actions, including ${joinWithCommasAndAnd(
        decisionMakers.map((entry) => entry.replace(/^[^:]+:\s*/, "")),
      )}.`,
    );
  }

  if (claims.length > 0) {
    prompts.push(
      `All complaints, charges, reports, lawsuits, or internal investigations concerning ${joinWithCommasAndAnd(claims)} from ${lookbackStart} to present.`,
    );
  }

  if (adverseActions.length > 0) {
    prompts.push(
      `All employees subjected to ${joinWithCommasAndAnd(adverseActions)} from ${lookbackStart} to present, including the decision-makers involved and the stated reasons.`,
    );
  }

  if (comparatorEntries.length > 0) {
    prompts.push(
      `Comparator employees or groups, including ${joinWithCommasAndAnd(
        comparatorEntries.map((entry) => entry.replace(/^[^:]+:\s*/, "")),
      )}, and the bases on which they are alleged to be similarly situated.`,
    );
  }

  return dedupeEntries(prompts);
}

function buildLookbackStart(serviceDate) {
  const value = normalizeValue(serviceDate);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const filingYear = match ? Number(match[1]) : new Date().getUTCFullYear();
  return `January 1, ${filingYear - 5}`;
}

function dedupeEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const normalized = normalizeValue(entry).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function formatLongDate(rawValue) {
  const value = normalizeValue(rawValue);
  if (!value) {
    return "";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function renderLetteredEntries(entries) {
  return entries.map((entry, index) => `(${String.fromCharCode(97 + index)}) ${entry}`).join("");
}

// RFP subject list: lettered "(a) Name;" format, final entry gets a period
function renderRfpSubjectList(entries) {
  return entries
    .map((entry, index) => {
      const letter = `(${String.fromCharCode(97 + index)})`;
      const clean = entry.trimEnd();
      const punctuated = /[.;]$/.test(clean)
        ? clean
        : index === entries.length - 1
        ? `${clean}.`
        : `${clean};`;
      return `${letter} ${punctuated}`;
    })
    .join("\n");
}

// ROG subject list: "a. entry;" format with a period on the final entry
function renderRogSubjectList(entries) {
  return entries
    .map((entry, index) => {
      const letter = String.fromCharCode(97 + index);
      const clean = entry.trimEnd();
      const hasPunctuation = /[.;]$/.test(clean);
      const suffix = hasPunctuation ? "" : index === entries.length - 1 ? "." : ";";
      return `${letter}. ${clean}${suffix}`;
    })
    .join("\n");
}

function buildTargetDefendantsFormal(intake) {
  const defendants = splitLines(intake.allDefendants).map(toTitleCase);
  if (defendants.length === 0) return "";
  const referenceName = normalizeValue(intake.defendantReferenceName) || buildDefendantPartyLabel(intake);
  const partyLabel = buildDefendantPartyLabel(intake);
  const joined =
    defendants.length === 1
      ? defendants[0]
      : defendants.length === 2
      ? `${defendants[0]} and ${defendants[1]}`
      : `${defendants.slice(0, -1).join(", ")}, and ${defendants[defendants.length - 1]}`;
  return `${joined} ("${referenceName}" or "${partyLabel}")`;
}

function buildAllDefendantsFormal(intake) {
  const defendants = splitLines(intake.allDefendants).map(toTitleCase);
  if (defendants.length === 0) return "";
  if (defendants.length === 1) return defendants[0];
  if (defendants.length === 2) return `${defendants[0]} and ${defendants[1]}`;
  return `${defendants.slice(0, -1).join(", ")}, and ${defendants[defendants.length - 1]}`;
}

function buildPronounFields(genderValue) {
  const gender = normalizeValue(genderValue) || "she";
  const map = {
    she: { plaintiffTitle: "Ms.", plaintiffSubjectPronoun: "she", plaintiffObjectPronoun: "her", plaintiffPossessivePronoun: "her", plaintiffReflexivePronoun: "herself" },
    he: { plaintiffTitle: "Mr.", plaintiffSubjectPronoun: "he", plaintiffObjectPronoun: "him", plaintiffPossessivePronoun: "his", plaintiffReflexivePronoun: "himself" },
    they: { plaintiffTitle: "Mx.", plaintiffSubjectPronoun: "they", plaintiffObjectPronoun: "them", plaintiffPossessivePronoun: "their", plaintiffReflexivePronoun: "themselves" },
  };
  return map[gender] || map.she;
}


function buildProgramName(intake) {
  return (
    normalizeValue(intake.programName) ||
    normalizeValue(intake.defendantReferenceName) ||
    normalizeValue(intake.collectiveDefendantShortName) ||
    "Defendant"
  );
}

function buildOmnibusIndividualTokens(intake) {
  const count = Number(intake.omnibusDeponentCount || 0);
  const tokens = {};

  for (let index = 1; index <= 8; index += 1) {
    const name = index <= count ? normalizeValue(intake[`omnibusDeponent${index}Name`]) : "";
    const rawDate = index <= count ? normalizeValue(intake[`omnibusDeponent${index}Date`]) : "";
    const time = index <= count ? normalizeValue(intake[`omnibusDeponent${index}Time`]) : "";
    const inPerson = index <= count ? Boolean(intake[`omnibusDeponent${index}InPerson`]) : false;
    const location = index <= count
      ? (inPerson ? normalizeValue(intake[`omnibusDeponent${index}Location`]) : "Via Zoom")
      : "";

    const datePart = formatLongDate(rawDate);
    const dateTime = datePart && time ? `${datePart}\n${time}` : datePart || time;

    tokens[`{{omnibusDeponent${index}Name}}`] = name;
    tokens[`{{omnibusDeponent${index}DateTime}}`] = dateTime;
    tokens[`{{omnibusDeponent${index}Location}}`] = location;
  }

  return tokens;
}

function renderOmnibusScheduleBlocks(rawValue) {
  const items = Array.isArray(rawValue) ? rawValue : parseJsonArray(rawValue);

  return items
    .map((item) =>
      [
        `Deponent: ${normalizeValue(item.deponent)}`,
        `Date & Time: ${normalizeValue(item.date)}${item.time ? `\n${normalizeValue(item.time)}` : ""}`,
        `Location: ${normalizeValue(item.location)}`,
        `Video: ${normalizeValue(item.video)}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function buildOmnibusDeponents(intake) {
  const count = Number(intake.omnibusDeponentCount || 0);
  const items = [];

  for (let index = 1; index <= count; index += 1) {
    const name = normalizeValue(intake[`omnibusDeponent${index}Name`]);
    const date = normalizeValue(intake[`omnibusDeponent${index}Date`]);
    const time = normalizeValue(intake[`omnibusDeponent${index}Time`]);
    const inPerson = Boolean(intake[`omnibusDeponent${index}InPerson`]);
    const location = inPerson ? normalizeValue(intake[`omnibusDeponent${index}Location`]) : "Via Zoom";

    if (!name && !date && !time && !location) {
      continue;
    }

    items.push({
      deponent: name,
      date,
      time,
      location,
      video: `The deposition will be video recorded by ${normalizeValue(intake.videoOperatorName) || "an authorized videographer"}.`,
    });
  }

  return items;
}

function sanitizeFileName(value) {
  return String(value || "document")
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDocumentName(template, intake) {
  const plaintiffLastName = sanitizeFileName(toTitleCase(extractLastName(intake.plaintiffName)) || "Plaintiff");
  const defendantAbbrev = sanitizeFileName(
    normalizeValue(intake.defendantReferenceName) ||
    normalizeValue(intake.collectiveDefendantShortName) ||
    buildDefendantPartyLabel(intake) ||
    "Defendant"
  );
  return `${plaintiffLastName}_${defendantAbbrev} - ${template.title}`;
}

function validateSelections(selectedTemplateIds, intake) {
  const registry = getTemplateRegistry();
  const enrichedIntake = {
    ...intake,
    courtName: buildCourtName(intake),
    firmName: normalizeValue(intake.firmName) || DEFAULT_FIRM_NAME,
    firmAddressBlock: normalizeValue(intake.firmAddressBlock) || DEFAULT_FIRM_ADDRESS_BLOCK,
    signingAttorney: resolveSigningAttorneyName(intake.signingAttorney),
    attorneyForLine: buildAttorneyForLine(intake),
    attorneyRoster: buildAttorneyRoster(intake.includedAttorneys),
    attorneyEmails: buildAttorneyEmails(intake.includedAttorneys),
  };
  const selectedTemplates = registry.documents.filter((document) =>
    selectedTemplateIds.includes(document.id),
  );

  if (selectedTemplates.length === 0) {
    throw new Error("Select at least one document template.");
  }

  const issues = [];

  for (const template of selectedTemplates) {
    if (!template.googleTemplateDocId || template.googleTemplateDocId === "REPLACE_WITH_TEMPLATE_DOC_ID") {
      issues.push(`${template.title}: configure googleTemplateDocId in templates/registry.json`);
    }
  }

  const { tokenMap, listTokens } = buildTokenMap(enrichedIntake);
  return {
    issues,
    selectedTemplates,
    tokenMap,
    listTokens,
  };
}

module.exports = {
  buildDocumentName,
  buildMatterFolderName,
  buildTokenMap,
  normalizeValue,
  setAttorneyDirectory,
  validateSelections,
};
