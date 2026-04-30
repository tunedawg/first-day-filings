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
    plaintiffNameVariationsList: buildPlaintiffNameVariationsList(intake.plaintiffName),
  };

  const directTokens = Object.entries(enrichedIntake).reduce((accumulator, [key, value]) => {
    accumulator[`{{${key}}}`] = normalizeValue(value);
    return accumulator;
  }, {});

  const keyPersons = splitLines(enrichedIntake.keyPersonsList);
  const roleBasedPersons = splitLines(enrichedIntake.additionalRoleBasedPersons);
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

  const listTokens = {
    "{{rfpSubjectListBlock}}": renderRfpSubjectList(rfpFullSubjectList).split("\n"),
    "{{rfpEmailBoxSubjectListBlock}}": renderRfpSubjectList(fullSubjectList).split("\n"),
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
    "{{interrogatory3SubjectsBlock}}": renderRogSubjectList(fullSubjectList),
    "{{claimsAndCountsBlock}}": renderNumberedList(enrichedIntake.claimsAndCounts),
    "{{protectedTraitsBlock}}": renderNumberedList(enrichedIntake.protectedTraits),
    "{{retaliationActivitiesBlock}}": renderNumberedList(enrichedIntake.retaliationActivities),
    "{{interrogatoryProtectedStatusFields}}": buildInterrogatoryProtectedStatusFields(enrichedIntake),
    "{{interrogatoryComplaintTypes}}": buildInterrogatoryComplaintTypes(enrichedIntake),
    "{{adverseActionsBlock}}": renderNumberedList(enrichedIntake.adverseActions),
    "{{complaintTypesBlock}}": renderNumberedList(enrichedIntake.complaintTypes),
    "{{comparatorGroupsBlock}}": renderNumberedEntries(comparatorEntries),
    "{{decisionMakersBlock}}": renderNumberedEntries(decisionMakerEntries),
    "{{corpRepIssueTopicsBlock}}": corpRepIssueTopics.join("\n"),
    "{{interrogatoryIssuePromptsBlock}}": renderNumberedEntries(interrogatoryIssuePrompts),
    "{{interrogatoryActorComplaintParagraphsBlock}}": renderParagraphBlock(interrogatoryActorComplaintParagraphs),
    "{{interrogatoryTrioMetricsParagraph}}": normalizeValue(interrogatoryTrioMetricsParagraph),
    "{{corpRepTopicsBlock}}": normalizeValue(enrichedIntake.corpRepTopics),
    "{{confidentialityExamplesBlock}}": renderLineList(enrichedIntake.confidentialityExamples),
    "{{rfpPlaintiffCommunicationsBlock}}": renderParagraphBlock(rfpPlaintiffCommunicationsParagraphs),
    "{{rfpActorComplaintParagraphsBlock}}": renderParagraphBlock(rfpActorComplaintParagraphs),
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

  return `IN THE CIRCUIT COURT OF ${county.toUpperCase()} COUNTY, MISSOURI`;
}

function toTitleCase(value) {
  return normalizeValue(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveSigningAttorneyName(attorneyId) {
  return ATTORNEY_DIRECTORY[attorneyId]?.displayName || normalizeValue(attorneyId);
}

function resolveSigningAttorneyEmail(attorneyId) {
  return ATTORNEY_DIRECTORY[attorneyId]?.email || "";
}

function buildAttorneyForLine(intake) {
  const plaintiffName = toTitleCase(intake.plaintiffName);
  return plaintiffName ? `Attorneys for Plaintiff ${plaintiffName}` : "Attorneys for Plaintiff";
}

function buildAttorneyRoster(selectedAttorneyIds) {
  return ensureAttorneySelection(selectedAttorneyIds)
    .map((attorneyId) => ATTORNEY_DIRECTORY[attorneyId]?.rosterLine)
    .filter(Boolean)
    .join("\n");
}

function buildAttorneyEmails(selectedAttorneyIds) {
  return ensureAttorneySelection(selectedAttorneyIds)
    .map((attorneyId) => ATTORNEY_DIRECTORY[attorneyId]?.email)
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
  const plaintiffLastName = extractLastName(intake.plaintiffName) || "Plaintiff";
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
  const plaintiffName = normalizeValue(intake.plaintiffName) || "Plaintiff";
  const claims = normalizeClaimsAndCounts(intake);
  const protectedTraits = splitLines(intake.protectedTraits);
  const adverseActions = normalizeAdverseActions(intake);
  const decisionMakers = buildDecisionMakerEntries(intake);
  const defendantReference = buildDefendantReference(intake);
  const actorNames = buildCorpRepActorNames(intake);
  const comparatorReference = buildComparatorReference(intake);
  const workLocationReference = buildWorkLocationReference(intake);
  const additionalTopics = buildCorpRepIssueTopicEntries(intake);
  const issuePrompts = buildInterrogatoryIssuePromptEntries(intake);
  const topics = [];

  pushUniqueTopic(
    topics,
    `${plaintiffName}'s employment history, job duties, performance evaluations, and disciplinary history.`,
  );

  const actorSentence = actorNames.length > 0 ? joinWithCommasAndAnd(actorNames) : "all persons";
  const claimsSentence =
    claims.length > 0
      ? joinWithCommasAndAnd(claims.map((claim) => claim.replace(/^Count\s+[IVXLC0-9]+[:.\-\s]*/i, "")))
      : "the claims and charges asserted in this matter";

  pushUniqueTopic(
    topics,
    `The identities and roles of ${actorSentence} who played any role in decisions concerning ${plaintiffName}'s claims and charges, including ${claimsSentence}, discipline, leave, accommodations, or any other adverse employment action.`,
  );

  if (claims.length > 0) {
    pushUniqueTopic(
      topics,
      `All facts relating to the claims and charges asserted by ${plaintiffName}, including ${claimsSentence}.`,
    );
  }

  if (adverseActions.length > 0) {
    pushUniqueTopic(
      topics,
      `All facts relating to the adverse actions at issue, including ${joinWithCommasAndAnd(adverseActions)}.`,
    );
  }

  if (protectedTraits.length > 0) {
    pushUniqueTopic(
      topics,
      `All facts relating to the protected traits, statuses, or conditions at issue, including ${joinWithCommasAndAnd(protectedTraits)}.`,
    );
  }

  if (decisionMakers.length > 0) {
    pushUniqueTopic(
      topics,
      `The identities, roles, and involvement of ${joinWithCommasAndAnd(
        decisionMakers.map((entry) => normalizeDecisionMakerEntry(entry)),
      )}.`,
    );
  }

  if (claims.some((claim) => /retaliation/i.test(claim))) {
    pushUniqueTopic(topics, `All complaints or reports of retaliation made to or against ${defendantReference}.`);
  }

  if (claims.some((claim) => /disab|accommodat/i.test(claim))) {
    pushUniqueTopic(
      topics,
      `All complaints or reports of disability discrimination, failure to accommodate, or accommodation-related issues made to or against ${defendantReference}.`,
    );
  }

  if (claims.some((claim) => /\bage\b/i.test(claim))) {
    pushUniqueTopic(topics, `All complaints or reports of age discrimination made to or against ${defendantReference}.`);
  }

  if (claims.some((claim) => /whistleblower|105\.055|fraud|falsification/i.test(claim))) {
    pushUniqueTopic(
      topics,
      `All complaints or reports of suspected fraud, unlawful conduct, or violation of whistleblower rights made to or against ${defendantReference}.`,
    );
  }

  if (claims.some((claim) => /workers'? compensation/i.test(claim))) {
    pushUniqueTopic(
      topics,
      `All complaints or reports of workers' compensation-related retaliation made to or against ${defendantReference}.`,
    );
  }

  if (actorNames.length > 0) {
    pushUniqueTopic(
      topics,
      `All complaints or reports of discrimination, harassment, and/or retaliation against ${joinWithCommasAndAnd(actorNames)}.`,
    );
  }

  pushUniqueTopic(
    topics,
    `All disciplinary policies and procedures maintained by ${defendantReference}, including progressive discipline practices and use of Performance Improvement Plans.`,
  );

  pushUniqueTopic(
    topics,
    `The identities of all employees in ${comparatorReference} who have been placed on a Performance Improvement Plan, including their age, race, color, sex, and disability status.`,
  );

  pushUniqueTopic(
    topics,
    `The demographic makeup, including age, race, color, sex, and disability status, of employees in ${comparatorReference}.`,
  );

  pushUniqueTopic(
    topics,
    `${defendantReference}'s document retention policies, litigation holds, and preservation of electronically stored information related to ${plaintiffName}'s employment.`,
  );

  pushUniqueTopic(
    topics,
    `All anti-discrimination, anti-harassment, anti-retaliation, and complaint-reporting policies maintained by ${defendantReference}.`,
  );

  pushUniqueTopic(topics, `The location of any cameras in ${plaintiffName}'s work location at ${defendantReference}.`);

  pushUniqueTopic(
    topics,
    `The demographic makeup of ${workLocationReference}, including the age, race, color, sex, and disability status of its employees.`,
  );

  issuePrompts.forEach((topic) => pushUniqueTopic(topics, topic));
  additionalTopics.forEach((topic) => pushUniqueTopic(topics, topic));

  return topics
    .map((topicText, index) => `${index + 1}. ${topicText}`)
    .join("\n\n");
}

function ensureAttorneySelection(selectedAttorneyIds) {
  if (Array.isArray(selectedAttorneyIds) && selectedAttorneyIds.length > 0) {
    return selectedAttorneyIds.filter((attorneyId) => ATTORNEY_DIRECTORY[attorneyId]);
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

function buildNamedActorList(intake, limit = 8) {
  const plaintiffName = normalizeValue(intake.plaintiffName).toLowerCase();
  const seen = new Set();

  return splitLines(intake.keyPersonsList)
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
      `Please identify all complaints, whether formal or informal, made by any employee against ${actor} from ${lookbackStart} to the present that involve allegations of any form of discrimination, retaliation, or other workplace misconduct. For each complaint, provide the identity, race, age, known disability status, job title, and last known contact information of the person who made the complaint, a summary of the complaint and alleged conduct, to whom and when it was reported, the outcome or resolution, and whether any disciplinary action was taken.`,
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
  const plaintiffRef = buildPlaintiffReference(intake);
  const claimKeys = getClaimKeys(intake);
  const adverseActionKeys = (Array.isArray(intake.adverseActions)
    ? intake.adverseActions
    : splitLines(intake.adverseActions)
  ).filter(Boolean);
  const lookbackStart = buildLookbackStart(intake.serviceDate);
  const topics = [];

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

  // Builds the inline demographic/status clause used in the circumstances and replacement topics.
  // Demographics are claim-specific; injury history and prior complaint status are always included.
  function demographicClause() {
    const fields = [];
    if (hasAge) fields.push("age");
    if (hasSex) fields.push("sex");
    if (hasRace) fields.push("race");
    if (hasColor) fields.push("color");
    if (hasDisability) fields.push("disability status");
    if (hasAssociational) fields.push("associational status");
    fields.push("workers' compensation and workplace injury history");
    return joinWithCommasAndAnd(fields) + ", and whether they had previously complained of unlawful discrimination or retaliation";
  }

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

  // 1. Plaintiff's history
  topics.push(`${plaintiffRef}'s performance and disciplinary history at ${defendant}.`);

  // 2. Circumstances of the adverse action — reasons, actors, and demographics in one topic
  topics.push(
    `The circumstances of ${plaintiffRef}'s ${adverseActionLabel}, including all reasons and the identities and roles of all persons who played any role in that decision, their ${demographicClause()}.`,
  );

  // 3. Complete reasons (standalone, invites full factual development)
  topics.push(
    `${defendant}'s complete reasons for ${plaintiffRef}'s ${adverseActionLabel}, including all underlying facts and information that played into the decision.`,
  );

  // 4. Replacement / successor — demographics bundled in
  topics.push(
    `The identity of the person who replaced ${plaintiffRef} or assumed ${plaintiffRef}'s job functions following ${plaintiffRef}'s departure, including their ${demographicClause()}.`,
  );

  // Plaintiff-specific claim circumstances
  if (hasDisability || hasAssociational) {
    topics.push(`${plaintiffRef}'s request for a disability accommodation and ${defendant}'s handling of that request.`);
  }

  if (hasFMLA) {
    topics.push(`${plaintiffRef}'s requests for medical or family leave and ${defendant}'s handling of each request.`);
  }

  if (hasWorkersComp) {
    topics.push(
      `${plaintiffRef}'s workplace injury or workers' compensation claim, including ${defendant}'s handling of the injury report or claim.`,
    );
  }

  if (hasRetaliation) {
    topics.push(`All complaints or protected activity by ${plaintiffRef} that preceded any adverse employment action.`);
  }

  // Per-claim complaint history — one topic per claim type
  if (hasRace) topics.push(`All complaints or reports of race discrimination at ${defendant} from ${lookbackStart} to present.`);
  if (hasColor) topics.push(`All complaints or reports of color discrimination at ${defendant} from ${lookbackStart} to present.`);
  if (hasAge) topics.push(`All complaints or reports of age discrimination at ${defendant} from ${lookbackStart} to present.`);
  if (hasSex) topics.push(`All complaints or reports of sex discrimination or sexual harassment at ${defendant} from ${lookbackStart} to present.`);
  if (hasDisability) topics.push(`All complaints or reports of disability discrimination or failure to accommodate at ${defendant} from ${lookbackStart} to present.`);
  if (hasAssociational) topics.push(`All complaints or reports of associational discrimination at ${defendant} from ${lookbackStart} to present.`);
  if (hasRetaliation) topics.push(`All complaints or reports of retaliation at ${defendant} from ${lookbackStart} to present.`);
  if (hasWhistleblower) topics.push(`All reports or incidents of whistleblowing or reports of illegal activity at ${defendant} from ${lookbackStart} to present.`);

  // Age-specific hiring comparator
  if (hasAge) {
    topics.push(
      `The age of each person hired into the position in which ${plaintiffRef} was last employed at ${defendant} from ${lookbackStart} to present.`,
    );
  }

  // Workers' comp omnibus — name, injury, outcome, current employment status
  if (hasWorkersComp) {
    topics.push(
      `All workplace injury reports and workers' compensation claims at ${defendant} from ${lookbackStart} to present, including the name of the employee, the nature of the injury, the outcome, whether the employee is still employed, and if not, the reason for separation.`,
    );
  }

  // Exit interviews
  topics.push(`All exit interviews conducted at ${defendant} from ${lookbackStart} to present.`);

  // Disciplinary policies and progressive discipline departure
  topics.push(
    `${defendant}'s disciplinary policies and procedures, including the types of discipline available and any progressive discipline process.`,
  );
  if (adverseActionKeys.some((k) => ["termination", "discipline", "pip"].includes(k))) {
    topics.push(
      `The reasons ${defendant} did not follow its progressive discipline policies and procedures in connection with the employment decisions at issue.`,
    );
  }

  // Accommodation/leave policies (if applicable)
  if (hasDisability || hasAssociational || hasFMLA) {
    topics.push(
      `${defendant}'s policies governing disability accommodation requests${hasFMLA ? " and employee requests for medical or family leave" : ""} from ${lookbackStart} to present.`,
    );
  }

  // Document retention
  topics.push(
    `${defendant}'s document retention policies, litigation holds, and preservation of emails, HRIS records, and other electronically stored information related to ${plaintiffRef}'s employment.`,
  );

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

// RFP subject list: plain semicolon list, final entry gets a period
function renderRfpSubjectList(entries) {
  return entries
    .map((entry, index) => {
      const clean = entry.trimEnd();
      if (/[.;]$/.test(clean)) return clean;
      return index === entries.length - 1 ? `${clean}.` : `${clean};`;
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

function buildPlaintiffNameVariationsList(fullName) {
  const parts = normalizeValue(fullName).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "";

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const variations = [];

  // First name: add trailing 'e' if not already there
  if (!/e$/i.test(firstName)) {
    variations.push(firstName + "e");
  }
  // First name: double the last consonant
  if (/[^aeiou]$/i.test(firstName)) {
    variations.push(firstName + firstName[firstName.length - 1]);
  }

  // Last name: drop trailing 'e'
  if (/e$/i.test(lastName) && lastName.length > 2) {
    variations.push(lastName.slice(0, -1));
  }
  // Last name: y → i substitution (and drop trailing 'e' of the result)
  if (/y/i.test(lastName)) {
    const withI = lastName.replace(/y/g, "i").replace(/Y/g, "I");
    if (withI.toLowerCase() !== lastName.toLowerCase()) {
      variations.push(withI);
      if (/e$/i.test(withI) && withI.length > 2) {
        variations.push(withI.slice(0, -1));
      }
    }
  }

  const origLower = new Set([firstName.toLowerCase(), lastName.toLowerCase()]);
  const unique = [...new Set(variations)].filter((v) => !origLower.has(v.toLowerCase()));

  if (unique.length === 0) return "";
  if (unique.length === 1) return `'${unique[0]}'`;
  return `${unique.slice(0, -1).map((v) => `'${v}'`).join(", ")}, and '${unique[unique.length - 1]}'`;
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
  validateSelections,
};
