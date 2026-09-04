import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  BINDING_PHASES,
  CANDIDATE_DISPOSITIONS,
  JIT_BINDING_VERDICTS,
  PROOF_ACTIONS,
  PUBLICATION_RELATIONS,
  checkSemanticOverlap,
  classifyGitPublicationRelation,
  classifyPublicationRelation,
  evaluateJitBindingEligibility,
  getChangedFilesBetween,
} from "../scripts/publication-relation.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

async function initRepo(t) {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-pubrel-"));
  t.after(async () => {
    await fs.rm(repoDir, { recursive: true, force: true });
  });
  git(repoDir, "init", "-b", "main");
  git(repoDir, "config", "user.email", "test@example.com");
  git(repoDir, "config", "user.name", "Test");
  await fs.writeFile(path.join(repoDir, "base.txt"), "base\n");
  git(repoDir, "add", "base.txt");
  git(repoDir, "commit", "-m", "base");
  return repoDir;
}

async function commitFile(repoDir, filename, content, message) {
  await fs.writeFile(path.join(repoDir, filename), content);
  git(repoDir, "add", filename);
  git(repoDir, "commit", "-m", message);
  return git(repoDir, "rev-parse", "HEAD");
}

function relationFor(repoDir, candidateSha, remoteSha) {
  return classifyGitPublicationRelation(repoDir, candidateSha, remoteSha).relation;
}

test("publication relation uses identity and containment before any phase rule", async (t) => {
  const repoDir = await initRepo(t);
  const baseSha = git(repoDir, "rev-parse", "HEAD");

  git(repoDir, "checkout", "-b", "candidate");
  const candidateSha = await commitFile(repoDir, "delta.txt", "delta\n", "candidate");
  git(repoDir, "checkout", baseSha);
  const remoteSha = await commitFile(repoDir, "remote.txt", "remote\n", "remote advance");

  assert.equal(
    relationFor(repoDir, candidateSha, remoteSha),
    PUBLICATION_RELATIONS.DIVERGED
  );
  assert.equal(
    classifyPublicationRelation({
      candidateSha: "same",
      remoteSha: "same",
      candidateAncestorOfRemote: true,
      remoteAncestorOfCandidate: true,
    }),
    PUBLICATION_RELATIONS.ALREADY_PUBLISHED
  );
});

test("a stale ancestor tip is contained, never DIVERGED", async (t) => {
  const repoDir = await initRepo(t);
  const staleCandidateSha = git(repoDir, "rev-parse", "HEAD");
  const remoteSha = await commitFile(repoDir, "remote.txt", "remote\n", "remote advance");

  assert.equal(
    relationFor(repoDir, staleCandidateSha, remoteSha),
    PUBLICATION_RELATIONS.PUBLISHED_IN_REMOTE_HISTORY
  );
  assert.notEqual(
    relationFor(repoDir, staleCandidateSha, remoteSha),
    PUBLICATION_RELATIONS.DIVERGED
  );
});

test("bindingPhase is mandatory and cannot silently default to PRE_FINAL_JIT", () => {
  assert.throws(
    () => evaluateJitBindingEligibility({ remoteChangedFiles: ["remote.txt"] }),
    /requires an explicit bindingPhase/
  );
  assert.deepEqual(BINDING_PHASES, {
    PRE_FINAL_JIT: "PRE_FINAL_JIT",
    POST_FINAL_JIT: "POST_FINAL_JIT",
  });
});

test("PRE_FINAL_JIT topology-only divergent movement allows one topology rebind", async (t) => {
  const repoDir = await initRepo(t);
  const baseSha = git(repoDir, "rev-parse", "HEAD");

  git(repoDir, "checkout", "-b", "candidate");
  const candidateSha = await commitFile(repoDir, "delta.txt", "delta\n", "candidate");
  git(repoDir, "checkout", baseSha);
  const remoteSha = await commitFile(repoDir, "unrelated.txt", "remote\n", "remote advance");
  const remoteChangedFiles = getChangedFilesBetween(repoDir, baseSha, remoteSha);
  const relation = relationFor(repoDir, candidateSha, remoteSha);

  assert.equal(relation, PUBLICATION_RELATIONS.DIVERGED);
  const result = evaluateJitBindingEligibility({
    bindingPhase: BINDING_PHASES.PRE_FINAL_JIT,
    publicationRelation: relation,
    deltaFiles: ["delta.txt"],
    remoteChangedFiles,
  });

  assert.equal(result.verdict, JIT_BINDING_VERDICTS.TOPOLOGY_REBIND_ELIGIBLE);
  assert.equal(result.rebindAllowed, true);
  assert.equal(result.jitBindingReusable, true);
  assert.equal(result.semanticDeltaPreserved, true);
  assert.equal(result.proofAction, PROOF_ACTIONS.PRESERVE_REUSABLE_PROOF);
});

test("POST_FINAL_JIT does not trip the breaker when fresh remote is a candidate ancestor", async (t) => {
  const repoDir = await initRepo(t);
  const remoteSha = git(repoDir, "rev-parse", "HEAD");
  git(repoDir, "checkout", "-b", "candidate");
  const candidateSha = await commitFile(repoDir, "delta.txt", "delta\n", "candidate");
  const relation = relationFor(repoDir, candidateSha, remoteSha);

  assert.equal(relation, PUBLICATION_RELATIONS.FAST_FORWARD_PUBLISHABLE);
  const result = evaluateJitBindingEligibility({
    bindingPhase: BINDING_PHASES.POST_FINAL_JIT,
    publicationRelation: relation,
    remoteChangedFiles: ["unrelated.txt"],
  });

  assert.equal(result.verdict, JIT_BINDING_VERDICTS.EXISTING_CANDIDATE_PUBLISHABLE);
  assert.notEqual(result.verdict, JIT_BINDING_VERDICTS.SECOND_ADVANCE_CIRCUIT_BREAKER);
  assert.equal(result.rebindAllowed, false);
  assert.equal(result.candidateDisposition, CANDIDATE_DISPOSITIONS.PUBLISHABLE);
  assert.equal(result.publicationRelation, PUBLICATION_RELATIONS.FAST_FORWARD_PUBLISHABLE);
});

test("POST_FINAL_JIT divergent advance is a same-attempt circuit breaker", async (t) => {
  const repoDir = await initRepo(t);
  const baseSha = git(repoDir, "rev-parse", "HEAD");

  git(repoDir, "checkout", "-b", "candidate");
  const candidateSha = await commitFile(repoDir, "delta.txt", "delta\n", "candidate");
  git(repoDir, "checkout", baseSha);
  const remoteSha = await commitFile(repoDir, "intervening.txt", "remote\n", "remote advance");
  const relation = relationFor(repoDir, candidateSha, remoteSha);
  const commitCountBefore = git(repoDir, "rev-list", "--all", "--count");

  assert.equal(relation, PUBLICATION_RELATIONS.DIVERGED);
  const result = evaluateJitBindingEligibility({
    bindingPhase: BINDING_PHASES.POST_FINAL_JIT,
    publicationRelation: relation,
    deltaFiles: ["delta.txt"],
    remoteChangedFiles: ["intervening.txt"],
  });

  assert.equal(result.verdict, JIT_BINDING_VERDICTS.SECOND_ADVANCE_CIRCUIT_BREAKER);
  assert.equal(result.rebindAllowed, false);
  assert.equal(result.candidateDisposition, CANDIDATE_DISPOSITIONS.REFERENCE_ONLY);
  assert.equal(result.publicationAttempt, "LOST_RACE");
  assert.equal(result.nextAttempt, "FRESH_AUTHORITY_CLASSIFICATION");
  assert.equal(result.semanticDeltaPreserved, true);
  assert.equal(result.reusableProofPreserved, true);
  assert.equal(result.semanticState, "SEMANTIC_READY");
  assert.equal(result.semanticStateScope, "CURRENT_ATTEMPT_EVIDENCE_ONLY");
  assert.equal(result.nextAttemptRequiresFreshClassification, true);
  assert.equal(result.proofAction, PROOF_ACTIONS.PRESERVE_REUSABLE_PROOF);
  assert.notEqual(result.verdict, JIT_BINDING_VERDICTS.TOPOLOGY_REBIND_ELIGIBLE);
  assert.equal(git(repoDir, "rev-list", "--all", "--count"), commitCountBefore);
  assert.equal(git(repoDir, "cat-file", "-t", candidateSha), "commit");
});

test("the next explicit PRE_FINAL_JIT attempt can rebind after the breaker", async (t) => {
  const repoDir = await initRepo(t);
  const baseSha = git(repoDir, "rev-parse", "HEAD");

  git(repoDir, "checkout", "-b", "candidate");
  const staleCandidateSha = await commitFile(
    repoDir,
    "delta.txt",
    "delta\n",
    "candidate before race"
  );
  git(repoDir, "checkout", baseSha);
  const freshRemoteSha = await commitFile(
    repoDir,
    "intervening.txt",
    "remote\n",
    "remote advances after final JIT"
  );

  const firstRelation = relationFor(repoDir, staleCandidateSha, freshRemoteSha);
  const breaker = evaluateJitBindingEligibility({
    bindingPhase: BINDING_PHASES.POST_FINAL_JIT,
    publicationRelation: firstRelation,
    deltaFiles: ["delta.txt"],
    remoteChangedFiles: ["intervening.txt"],
  });
  assert.equal(breaker.verdict, JIT_BINDING_VERDICTS.SECOND_ADVANCE_CIRCUIT_BREAKER);

  // A new attempt explicitly re-enters PRE_FINAL_JIT with fresh classification.
  const nextAttempt = evaluateJitBindingEligibility({
    bindingPhase: BINDING_PHASES.PRE_FINAL_JIT,
    publicationRelation: PUBLICATION_RELATIONS.DIVERGED,
    deltaFiles: ["delta.txt"],
    remoteChangedFiles: getChangedFilesBetween(repoDir, baseSha, freshRemoteSha),
  });
  assert.equal(nextAttempt.verdict, JIT_BINDING_VERDICTS.TOPOLOGY_REBIND_ELIGIBLE);
  assert.equal(nextAttempt.rebindAllowed, true);

  git(repoDir, "checkout", "-b", "candidate-rebound", freshRemoteSha);
  const reboundCandidateSha = await commitFile(
    repoDir,
    "delta.txt",
    "delta\n",
    "candidate rebound on fresh authority"
  );
  assert.equal(
    relationFor(repoDir, reboundCandidateSha, freshRemoteSha),
    PUBLICATION_RELATIONS.FAST_FORWARD_PUBLISHABLE
  );
  assert.equal(git(repoDir, "cat-file", "-t", staleCandidateSha), "commit");
});

test("proof-owner-only movement preserves semantic delta but requires targeted refresh", () => {
  const result = evaluateJitBindingEligibility({
    bindingPhase: BINDING_PHASES.PRE_FINAL_JIT,
    publicationRelation: PUBLICATION_RELATIONS.DIVERGED,
    deltaFiles: ["feature.ts"],
    remoteChangedFiles: ["contract.md"],
    proofBoundaryMoved: true,
  });

  assert.equal(result.verdict, JIT_BINDING_VERDICTS.PROOF_BOUNDARY_REFRESH_REQUIRED);
  assert.equal(result.rebindAllowed, false);
  assert.equal(result.jitBindingReusable, false);
  assert.equal(result.semanticDeltaPreserved, true);
  assert.equal(result.proofAction, PROOF_ACTIONS.DIRECTLY_AFFECTED_TARGETED_REFRESH);
  assert.equal(result.nextAction, "REASSESS_FRESH_PUBLICATION_ELIGIBILITY");
  assert.equal("reusable" in result, false);
  assert.equal("BLOCKED_PROOF_BOUNDARY_MOVED" in JIT_BINDING_VERDICTS, false);
});

test("semantic overlap takes precedence over proof-owner-only refresh", () => {
  const overlap = checkSemanticOverlap(["shared.ts"], ["shared.ts", "contract.md"]);
  assert.deepEqual(overlap, {
    hasOverlap: true,
    overlappingFiles: ["shared.ts"],
  });

  const result = evaluateJitBindingEligibility({
    bindingPhase: BINDING_PHASES.PRE_FINAL_JIT,
    publicationRelation: PUBLICATION_RELATIONS.DIVERGED,
    deltaFiles: ["shared.ts"],
    remoteChangedFiles: ["shared.ts", "contract.md"],
    proofBoundaryMoved: true,
  });

  assert.equal(result.verdict, JIT_BINDING_VERDICTS.BLOCKED_SEMANTIC_OVERLAP);
  assert.equal(result.proofAction, PROOF_ACTIONS.READMIT_SEMANTIC_OWNER);
  assert.notEqual(
    result.verdict,
    JIT_BINDING_VERDICTS.PROOF_BOUNDARY_REFRESH_REQUIRED
  );
  assert.notEqual(result.proofAction, PROOF_ACTIONS.DIRECTLY_AFFECTED_TARGETED_REFRESH);
});
