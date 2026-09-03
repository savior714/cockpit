#!/usr/bin/env node
// Canonical publication-relation classifier and JIT fresh-remote binding evaluator.
//
// Canonical semantics owner: docs/operations/DEVELOPMENT.md §6 and §7.
// This module implements:
// 1. Publication relation classification: pure topological relation (A-D)
// 2. JIT binding eligibility: evaluating whether a proven semantic delta
//    can be bound to fresh remote authority without repeating full proof.
//
// Read-only by default: it never force-pushes, merges, or cherry-picks.

import { spawnSync } from "node:child_process";

export const PUBLICATION_RELATIONS = Object.freeze({
  ALREADY_PUBLISHED: "ALREADY_PUBLISHED",
  PUBLISHED_IN_REMOTE_HISTORY: "PUBLISHED_IN_REMOTE_HISTORY",
  FAST_FORWARD_PUBLISHABLE: "FAST_FORWARD_PUBLISHABLE",
  DIVERGED: "DIVERGED",
});

export const BINDING_PHASES = Object.freeze({
  PRE_FINAL_JIT: "PRE_FINAL_JIT",
  POST_FINAL_JIT: "POST_FINAL_JIT",
});

export const JIT_BINDING_VERDICTS = Object.freeze({
  ALREADY_CONTAINED: "ALREADY_CONTAINED",
  EXISTING_CANDIDATE_PUBLISHABLE: "EXISTING_CANDIDATE_PUBLISHABLE",
  NO_REBIND_REQUIRED: "NO_REBIND_REQUIRED",
  TOPOLOGY_REBIND_ELIGIBLE: "TOPOLOGY_REBIND_ELIGIBLE",
  SECOND_ADVANCE_CIRCUIT_BREAKER: "SECOND_ADVANCE_CIRCUIT_BREAKER",
  BLOCKED_SEMANTIC_OVERLAP: "BLOCKED_SEMANTIC_OVERLAP",
  PROOF_BOUNDARY_REFRESH_REQUIRED: "PROOF_BOUNDARY_REFRESH_REQUIRED",
});

export const PROOF_ACTIONS = Object.freeze({
  NONE: "NONE",
  PRESERVE_REUSABLE_PROOF: "PRESERVE_REUSABLE_PROOF",
  DIRECTLY_AFFECTED_TARGETED_REFRESH: "DIRECTLY_AFFECTED_TARGETED_REFRESH",
  READMIT_SEMANTIC_OWNER: "READMIT_SEMANTIC_OWNER",
});

export const CANDIDATE_DISPOSITIONS = Object.freeze({
  ALREADY_CONTAINED: "ALREADY_CONTAINED",
  PUBLISHABLE: "PUBLISHABLE",
  REFERENCE_ONLY: "REFERENCE_ONLY",
});

/**
 * Pure canonical order A–D. EXPECTED_BASE is intentionally not an input:
 * the relation depends only on fresh remote vs candidate containment.
 */
export function classifyPublicationRelation({
  candidateSha,
  remoteSha,
  candidateAncestorOfRemote,
  remoteAncestorOfCandidate,
}) {
  if (!candidateSha || !remoteSha) {
    throw new Error("classifyPublicationRelation requires candidateSha and remoteSha");
  }
  // A. remote == candidate.
  if (candidateSha === remoteSha) {
    return PUBLICATION_RELATIONS.ALREADY_PUBLISHED;
  }
  // B. candidate is a strict ancestor of remote.
  if (candidateAncestorOfRemote) {
    return PUBLICATION_RELATIONS.PUBLISHED_IN_REMOTE_HISTORY;
  }
  // C. remote is a strict ancestor of candidate.
  if (remoteAncestorOfCandidate) {
    return PUBLICATION_RELATIONS.FAST_FORWARD_PUBLISHABLE;
  }
  // D. neither is ancestor of the other.
  return PUBLICATION_RELATIONS.DIVERGED;
}

function runGit(repoPath, args) {
  const result = spawnSync("git", args, {
    cwd: repoPath,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

export function resolveSha(repoPath, rev) {
  const result = runGit(repoPath, ["rev-parse", "--verify", rev]);
  if (result.status !== 0) {
    throw new Error(`cannot resolve rev '${rev}': ${(result.stderr || "").trim()}`);
  }
  return result.stdout.trim();
}

export function isAncestor(repoPath, ancestorRev, descendantRev) {
  const ancestor = resolveSha(repoPath, ancestorRev);
  const descendant = resolveSha(repoPath, descendantRev);
  if (ancestor === descendant) {
    return true;
  }
  const result = runGit(repoPath, ["merge-base", "--is-ancestor", ancestor, descendant]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(
    `merge-base --is-ancestor failed: ${(result.stderr || "").trim()}`
  );
}

/**
 * Read-only Git-backed classification against fresh remote authority.
 * Callers must fetch fresh origin/main first and pass its SHA (or a ref
 * that already points at the freshly fetched authority) as remoteRev.
 */
export function classifyGitPublicationRelation(repoPath, candidateRev, remoteRev) {
  const candidateSha = resolveSha(repoPath, candidateRev);
  const remoteSha = resolveSha(repoPath, remoteRev);
  if (candidateSha === remoteSha) {
    return {
      relation: PUBLICATION_RELATIONS.ALREADY_PUBLISHED,
      candidateSha,
      remoteSha,
    };
  }
  const candidateAncestorOfRemote = isAncestor(repoPath, candidateSha, remoteSha);
  if (candidateAncestorOfRemote) {
    return {
      relation: PUBLICATION_RELATIONS.PUBLISHED_IN_REMOTE_HISTORY,
      candidateSha,
      remoteSha,
    };
  }
  const remoteAncestorOfCandidate = isAncestor(repoPath, remoteSha, candidateSha);
  return {
    relation: remoteAncestorOfCandidate
      ? PUBLICATION_RELATIONS.FAST_FORWARD_PUBLISHABLE
      : PUBLICATION_RELATIONS.DIVERGED,
    candidateSha,
    remoteSha,
  };
}

/** Lists files changed between two Git revisions. */
export function getChangedFilesBetween(repoPath, fromRev, toRev) {
  const result = runGit(repoPath, ["diff", "--name-only", fromRev, toRev]);
  if (result.status !== 0) {
    throw new Error(`git diff --name-only failed: ${(result.stderr || "").trim()}`);
  }
  return result.stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Determines whether remote-changed files semantically overlap with the delta. */
export function checkSemanticOverlap(deltaFiles, remoteChangedFiles) {
  const deltaSet = new Set(
    deltaFiles.filter((filename) => !isMechanicalBuildArtifact(filename))
  );
  const overlapping = remoteChangedFiles.filter(
    (filename) =>
      !isMechanicalBuildArtifact(filename) && deltaSet.has(filename)
  );
  return {
    hasOverlap: overlapping.length > 0,
    overlappingFiles: overlapping,
  };
}

function isMechanicalBuildArtifact(filename) {
  return (
    filename === "dist/.build-stamp.json" ||
    filename.startsWith("dist/assets/")
  );
}

function resolvePublicationRelation({
  publicationRelation,
  candidateSha,
  remoteSha,
  candidateAncestorOfRemote,
  remoteAncestorOfCandidate,
  alreadyContained,
}) {
  if (publicationRelation !== undefined) {
    if (!Object.values(PUBLICATION_RELATIONS).includes(publicationRelation)) {
      throw new Error(`Unknown publication relation: ${publicationRelation}`);
    }
    return publicationRelation;
  }

  // Keep the old boolean as a narrow compatibility shortcut. It is still
  // evaluated before any phase-specific race handling, just like containment.
  if (alreadyContained) {
    return PUBLICATION_RELATIONS.PUBLISHED_IN_REMOTE_HISTORY;
  }

  const identityValues = [
    candidateSha,
    remoteSha,
    candidateAncestorOfRemote,
    remoteAncestorOfCandidate,
  ];
  if (identityValues.every((value) => value === undefined)) {
    return undefined;
  }

  if (
    typeof candidateSha !== "string" ||
    typeof remoteSha !== "string" ||
    typeof candidateAncestorOfRemote !== "boolean" ||
    typeof remoteAncestorOfCandidate !== "boolean"
  ) {
    throw new Error(
      "publication relation requires candidateSha, remoteSha, and both containment booleans"
    );
  }

  return classifyPublicationRelation({
    candidateSha,
    remoteSha,
    candidateAncestorOfRemote,
    remoteAncestorOfCandidate,
  });
}

function withRelation(result, bindingPhase, publicationRelation) {
  const enriched = { ...result, bindingPhase };
  if (publicationRelation !== undefined) {
    enriched.publicationRelation = publicationRelation;
  }
  return enriched;
}

/**
 * Evaluates whether a proven semantic delta can be JIT-bound onto fresh remote authority.
 *
 * `bindingPhase` is intentionally required. It is transient context for this
 * invocation, not task state. For POST_FINAL_JIT, callers must also provide
 * the direct candidate-versus-fresh-remote relation (or its equivalent
 * identity/containment inputs), so a second-advance verdict cannot be inferred
 * from a bare remote-movement signal.
 */
export function evaluateJitBindingEligibility({
  bindingPhase,
  deltaFiles = [],
  remoteChangedFiles = [],
  proofBoundaryMoved = false,
  publicationRelation,
  candidateSha,
  remoteSha,
  candidateAncestorOfRemote,
  remoteAncestorOfCandidate,
  alreadyContained = false,
}) {
  if (!Object.values(BINDING_PHASES).includes(bindingPhase)) {
    throw new Error(
      "evaluateJitBindingEligibility requires an explicit bindingPhase: PRE_FINAL_JIT or POST_FINAL_JIT"
    );
  }

  const relation = resolvePublicationRelation({
    publicationRelation,
    candidateSha,
    remoteSha,
    candidateAncestorOfRemote,
    remoteAncestorOfCandidate,
    alreadyContained,
  });

  // Identity/containment always precedes phase-specific second-advance logic.
  if (
    relation === PUBLICATION_RELATIONS.ALREADY_PUBLISHED ||
    relation === PUBLICATION_RELATIONS.PUBLISHED_IN_REMOTE_HISTORY
  ) {
    return withRelation(
      {
        verdict: JIT_BINDING_VERDICTS.ALREADY_CONTAINED,
        rebindAllowed: false,
        jitBindingReusable: false,
        semanticDeltaPreserved: true,
        candidateDisposition: CANDIDATE_DISPOSITIONS.ALREADY_CONTAINED,
        proofAction: PROOF_ACTIONS.NONE,
        reason: "Fresh remote already contains the target candidate; do not rematerialize",
      },
      bindingPhase,
      relation
    );
  }

  if (relation === PUBLICATION_RELATIONS.FAST_FORWARD_PUBLISHABLE) {
    return withRelation(
      {
        verdict: JIT_BINDING_VERDICTS.EXISTING_CANDIDATE_PUBLISHABLE,
        rebindAllowed: false,
        jitBindingReusable: true,
        semanticDeltaPreserved: true,
        candidateDisposition: CANDIDATE_DISPOSITIONS.PUBLISHABLE,
        proofAction: PROOF_ACTIONS.PRESERVE_REUSABLE_PROOF,
        reason:
          "Fresh remote is a strict ancestor of the existing candidate; publish it without rebind",
      },
      bindingPhase,
      relation
    );
  }

  if (bindingPhase === BINDING_PHASES.POST_FINAL_JIT) {
    if (relation !== PUBLICATION_RELATIONS.DIVERGED) {
      throw new Error(
        "POST_FINAL_JIT requires direct identity/containment classification before second-advance handling"
      );
    }

    return withRelation(
      {
        verdict: JIT_BINDING_VERDICTS.SECOND_ADVANCE_CIRCUIT_BREAKER,
        rebindAllowed: false,
        jitBindingReusable: false,
        semanticDeltaPreserved: true,
        reusableProofPreserved: true,
        semanticState: "SEMANTIC_READY",
        semanticStateScope: "CURRENT_ATTEMPT_EVIDENCE_ONLY",
        candidateDisposition: CANDIDATE_DISPOSITIONS.REFERENCE_ONLY,
        publicationAttempt: "LOST_RACE",
        nextAttempt: "FRESH_AUTHORITY_CLASSIFICATION",
        proofAction: PROOF_ACTIONS.PRESERVE_REUSABLE_PROOF,
        nextAttemptRequiresFreshClassification: true,
        reason:
          "A new divergent remote advance occurred after final JIT; end this publication attempt without same-attempt rebind",
      },
      bindingPhase,
      relation
    );
  }

  const { hasOverlap, overlappingFiles } = checkSemanticOverlap(
    deltaFiles,
    remoteChangedFiles
  );

  if (hasOverlap) {
    return withRelation(
      {
        verdict: JIT_BINDING_VERDICTS.BLOCKED_SEMANTIC_OVERLAP,
        rebindAllowed: false,
        jitBindingReusable: false,
        candidateDisposition: CANDIDATE_DISPOSITIONS.REFERENCE_ONLY,
        proofAction: PROOF_ACTIONS.READMIT_SEMANTIC_OWNER,
        reason: `Remote advance overlaps with delta scope: ${overlappingFiles.join(", ")}`,
        overlappingFiles,
      },
      bindingPhase,
      relation
    );
  }

  if (proofBoundaryMoved) {
    return withRelation(
      {
        verdict: JIT_BINDING_VERDICTS.PROOF_BOUNDARY_REFRESH_REQUIRED,
        rebindAllowed: false,
        jitBindingReusable: false,
        semanticDeltaPreserved: true,
        proofAction: PROOF_ACTIONS.DIRECTLY_AFFECTED_TARGETED_REFRESH,
        nextAction: "REASSESS_FRESH_PUBLICATION_ELIGIBILITY",
        reason:
          "Proof owner or criterion moved without semantic overlap; preserve the semantic delta and refresh only the directly affected targeted proof",
      },
      bindingPhase,
      relation
    );
  }

  const divergentMovementObserved =
    relation === PUBLICATION_RELATIONS.DIVERGED || remoteChangedFiles.length > 0;
  if (!divergentMovementObserved) {
    return withRelation(
      {
        verdict: JIT_BINDING_VERDICTS.NO_REBIND_REQUIRED,
        rebindAllowed: false,
        jitBindingReusable: true,
        semanticDeltaPreserved: true,
        proofAction: PROOF_ACTIONS.PRESERVE_REUSABLE_PROOF,
        reason: "No divergent remote movement requires a topology rebind",
      },
      bindingPhase,
      relation
    );
  }

  return withRelation(
    {
      verdict: JIT_BINDING_VERDICTS.TOPOLOGY_REBIND_ELIGIBLE,
      rebindAllowed: true,
      jitBindingReusable: true,
      semanticDeltaPreserved: true,
      proofAction: PROOF_ACTIONS.PRESERVE_REUSABLE_PROOF,
      reason:
        "Pre-final-JIT topology-only divergent movement: preserve semantic/proof evidence and allow one topology rebind",
    },
    bindingPhase,
    relation
  );
}
