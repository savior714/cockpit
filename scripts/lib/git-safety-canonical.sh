#!/bin/sh
# bootstrap-git-safety — central canonical implementation.
#
# Single semantic authority for the cross-project Git Safety Baseline.
# Repo-local entrypoints (scripts/git-safety) and any convenience aliases
# must delegate here. Do not copy this logic into entrypoints or aliases.
#
# Scope (intentionally small): fresh remote BASE admission, task-owned linked
# worktree create/check, and a fresh pre-publication topology check primitive.
# Out of scope: queues, locks, ownership services, ledgers, reconciliation,
# merge/rebase engines, release orchestration, workflow engines.
#
# Only official stable Git primitives are used:
#   git fetch / ls-remote / rev-parse / worktree add|list / merge-base /
#   remote get-url / status --porcelain
#
# Output is stable KEY: value lines for automation. See `version` and `help`.
set -eu

GIT_SAFETY_CONTRACT_ID="bootstrap-git-safety"
GIT_SAFETY_CONTRACT_VERSION="1"
GIT_SAFETY_CONTRACT="${GIT_SAFETY_CONTRACT_ID}/${GIT_SAFETY_CONTRACT_VERSION}"

EXIT_OK=0
EXIT_USAGE=2
EXIT_BLOCKED=3

out() { printf '%s\n' "$*"; }

blocked() {
	# blocked REASON [KEY: value ...] — no fallback, no reconciliation, no cleanup.
	_reason=$1
	shift
	out "GIT_SAFETY: BLOCKED"
	out "REASON: ${_reason}"
	out "REQUIRED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
	out "OBSERVED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
	for _kv in "$@"; do
		out "${_kv}"
	done
	out "REMEDIATION: resolve the reported REASON and retry the same git-safety command; do not bypass with raw git (no manual 'git worktree add', branch, merge, rebase, cherry-pick, or force push) and do not reimplement safety logic locally"
	exit $EXIT_BLOCKED
}

not_applicable() {
	# $1 = detail key-value (e.g. "REMOTE: origin (not configured)")
	out "GIT_SAFETY: NOT_APPLICABLE"
	out "REASON: NO_SHARED_REMOTE"
	out "CONTRACT: ${GIT_SAFETY_CONTRACT}"
	out "$1"
	out "DETAIL: repository has no shared remote; the Git Safety Baseline is not forced here"
	exit $EXIT_OK
}

usage() {
	cat <<'USAGE'
usage:
  git-safety [--repo <path>] [--remote <name>] create <task-id> [--base-ref <branch>] [--worktree <path>]
  git-safety [--repo <path>] check [ <task-id> ]
  git-safety [--repo <path>] [--remote <name>] pre-publish [ <task-id> ] [--base-ref <branch>]
  git-safety [--repo <path>] [--remote <name>] close [ <task-id> ]
  git-safety version
  git-safety help

exit codes: 0 ok/admitted/publishable/closed/not-applicable, 2 usage error, 3 blocked.
USAGE
	exit $EXIT_USAGE
}

physpath() {
	# Print the physical path of an existing directory, else the input unchanged.
	if [ -d "${1:-}" ]; then
		(cd "${1}" 2>/dev/null && pwd -P) 2>/dev/null || printf '%s' "${1}"
	else
		printf '%s' "${1:-}"
	fi
}

valid_task_id() {
	case "${1:-}" in
		"" | .* | -* | *..* | *"/"* | *[!A-Za-z0-9._-]*)
			return 1
			;;
		*)
			return 0
			;;
	esac
}

# --- repository / remote resolution -----------------------------------------

REPO="."
REMOTE="origin"
BASE_REF=""
WORKTREE_OVERRIDE=""

# NOTE: the *_resolve helpers below assign their result to a documented global
# and call blocked() on failure. They must NEVER be invoked inside $(...)
# command substitution: exit inside a subshell would not abort the caller
# and the BLOCKED text would be captured as a value instead of reported.

resolve_repo() {
	# $1 = repo path. Sets _REPO (absolute top-level) or BLOCKEDs.
	if ! _top=$(git -C "${1}" rev-parse --show-toplevel 2>/dev/null); then
		blocked "NOT_A_REPOSITORY" "REPO: ${1}"
	fi
	_REPO=$(physpath "${_top}")
}

common_dir() {
	# $1 = repo path. Sets _CDIR (absolute git common dir) or BLOCKEDs.
	if _cd=$(git -C "${1}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
		_CDIR=${_cd}
		return 0
	fi
	if _cd=$(git -C "${1}" rev-parse --git-common-dir 2>/dev/null); then
		case "${_cd}" in
			/*) _CDIR=${_cd} ;;
			*) _CDIR=$( (cd "${1}" 2>/dev/null && cd "${_cd}" 2>/dev/null && pwd -P) 2>/dev/null || printf '%s' "${_cd}") ;;
		esac
		return 0
	fi
	blocked "NOT_A_REPOSITORY" "REPO: ${1}"
}

remote_configured() {
	# $1 = repo. Succeeds iff REMOTE has a configured URL.
	_url=$(git -C "${1}" config --get "remote.${REMOTE}.url" 2>/dev/null || true)
	[ -n "${_url}" ]
}

remote_url() {
	# $1 = repo. Prints remote URL or empty.
	git -C "${1}" config --get "remote.${REMOTE}.url" 2>/dev/null || true
}

discover_branch() {
	# $1 = repo. Sets _BRANCH (remote default branch, fresh authority) or BLOCKEDs.
	_symref=$(git -C "${1}" ls-remote --symref "${REMOTE}" HEAD 2>/dev/null || true)
	_branch=$(printf '%s\n' "${_symref}" | awk '/^ref:/ { sub(/^refs\/heads\//, "", $2); print $2; exit }')
	if [ -n "${_branch}" ]; then
		_BRANCH=${_branch}
		return 0
	fi
	for _candidate in main master; do
		if [ -n "$(git -C "${1}" ls-remote --branches "${REMOTE}" "${_candidate}" 2>/dev/null || true)" ]; then
			_BRANCH=${_candidate}
			return 0
		fi
	done
	blocked "REMOTE_UNRESOLVED" "REMOTE: ${REMOTE}" "DETAIL: default branch undiscoverable via ls-remote"
}

fresh_fetch() {
	# $1 = repo. Fresh shared-remote authority or BLOCKED.
	if ! _err=$(git -C "${1}" fetch --prune "${REMOTE}" 2>&1); then
		_detail=$(printf '%s\n' "${_err}" | head -n 1)
		blocked "REMOTE_UNRESOLVED" "REMOTE: ${REMOTE}" "DETAIL: ${_detail}"
	fi
}

resolve_base() {
	# $1 = repo, $2 = branch. Sets _BASE (fresh BASE SHA) or BLOCKEDs.
	if ! _sha=$(git -C "${1}" rev-parse --verify --quiet "${REMOTE}/${2}^{commit}" 2>/dev/null); then
		blocked "REMOTE_UNRESOLVED" "REMOTE_REF: ${REMOTE}/${2}" "DETAIL: remote-tracking ref missing after fetch"
	fi
	[ -n "${_sha}" ] || blocked "REMOTE_UNRESOLVED" "REMOTE_REF: ${REMOTE}/${2}" "DETAIL: remote-tracking ref missing after fetch"
	_BASE=${_sha}
}

worktree_registered_at() {
	# $1 = repo, $2 = physical worktree path. Succeeds iff registered (porcelain).
	# Fixed-string full-line match: exact and safe for spaces/special chars.
	git -C "${1}" worktree list --porcelain 2>/dev/null | grep -q -F -x "worktree ${2}"
}

record_dir() {
	# $1 = common dir, $2 = task-id. Prints record dir path.
	printf '%s/tasks/%s' "${1}/git-safety" "${2}"
}

read_record() {
	# $1 = record dir, $2 = field name. Prints field value or empty.
	[ -f "${1}/${2}" ] && cat "${1}/${2}"
}

write_record() {
	# $1=record dir $2=BASE $3=BASE_REF $4=REMOTE_URL $5=WORKTREE(physical)
	_rdir=$1
	mkdir -p "${_rdir}"
	_tmp="${_rdir}.tmp.$$"
	mkdir -p "${_tmp}"
	printf '%s\n' "$2" >"${_tmp}/BASE"
	printf '%s\n' "$3" >"${_tmp}/BASE_REF"
	printf '%s\n' "$4" >"${_tmp}/REMOTE_URL"
	printf '%s\n' "$5" >"${_tmp}/WORKTREE"
	date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null >"${_tmp}/ADMITTED_AT" || printf 'unknown\n' >"${_tmp}/ADMITTED_AT"
	for _f in BASE BASE_REF REMOTE_URL WORKTREE ADMITTED_AT; do
		mv "${_tmp}/${_f}" "${_rdir}/${_f}"
	done
	rmdir "${_tmp}"
}

default_worktree_path() {
	# $1 = common dir, $2 = task-id. Worktrees live under the git dir so the
	# canonical checkout never inherits untracked noise and no .gitignore edit
	# is required.
	printf '%s/worktrees/%s' "${1}/git-safety" "${2}"
}

select_task() {
	# $1 = safety dir, $2 = maybe-task, $3 = invocation repo physical top-level.
	# Sets _TASK and _TASK_SELECTION or BLOCKEDs.
	# _TASK_SELECTION is "explicit" when the caller passed <task-id>,
	# "implicit-singleton" when the sole stored admission is selected via
	# invocation-worktree inference, and "implicit-worktree" when the
	# invocation repository is exactly one of several admissions' WORKTREE.
	# An omitted <task-id> never selects a stored admission merely because one
	# exists: inference requires direct evidence that the invocation repository
	# IS the admitted task worktree. A lone unrelated admission fails closed
	# with TASK_ID_REQUIRED; several unrelated admissions fail closed with
	# AMBIGUOUS_TASK. No record is created, deleted, or rewritten here.
	_sdir=$1
	_maybe=$2
	_inv=${3:-}
	if [ -n "${_maybe}" ]; then
		valid_task_id "${_maybe}" || blocked "INVALID_TASK_ID" "TASK: ${_maybe}"
		[ -f "${_sdir}/tasks/${_maybe}/BASE" ] || blocked "NO_ADMISSION" "TASK: ${_maybe}" "DETAIL: no admission record; run 'create ${_maybe}' first"
		_TASK=${_maybe}
		_TASK_SELECTION="explicit"
		return 0
	fi
	_count=0
	_only=""
	_match_count=0
	_match_task=""
	if [ -d "${_sdir}/tasks" ]; then
		for _d in "${_sdir}"/tasks/*/; do
			[ -d "${_d}" ] || continue
			[ -f "${_d}/BASE" ] || continue
			_count=$((_count + 1))
			_only=$(basename "${_d}")
			if [ -n "${_inv}" ] && [ -f "${_d}/WORKTREE" ]; then
				_wt_try=$(cat "${_d}/WORKTREE" 2>/dev/null || true)
				if [ -n "${_wt_try}" ] && [ "${_wt_try}" = "${_inv}" ]; then
					_match_count=$((_match_count + 1))
					_match_task=$(basename "${_d}")
				fi
			fi
		done
	fi
	if [ "${_count}" = "0" ]; then
		blocked "NO_ADMISSION" "DETAIL: no admission record; run 'create <task-id>' first"
	fi
	if [ "${_match_count}" = "1" ]; then
		_TASK=${_match_task}
		if [ "${_count}" = "1" ]; then
			_TASK_SELECTION="implicit-singleton"
		else
			_TASK_SELECTION="implicit-worktree"
		fi
		return 0
	fi
	if [ "${_match_count}" -gt "1" ]; then
		out "GIT_SAFETY: BLOCKED"
		out "REASON: AMBIGUOUS_TASK"
		out "REQUIRED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
		out "OBSERVED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
		out "DETAIL: ${_match_count} admitted worktrees match the invocation repository; re-run with an explicit <task-id>"
		out "REMEDIATION: retry with an explicit task-id; do not bypass with raw git"
		exit $EXIT_BLOCKED
	fi
	if [ "${_count}" = "1" ]; then
		out "GIT_SAFETY: BLOCKED"
		out "REASON: TASK_ID_REQUIRED"
		out "REQUIRED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
		out "OBSERVED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
		out "INVOCATION_REPO: ${_inv}"
		out "DETAIL: 1 admitted task exists but the invocation repository is not its admitted worktree; omitted <task-id> never implicitly selects an unrelated admission — re-run with an explicit <task-id> or invoke from the admitted worktree (--repo <worktree>)"
		out "REMEDIATION: retry with an explicit task-id (or invoke from the admitted task worktree); do not bypass with raw git"
		exit $EXIT_BLOCKED
	else
		out "GIT_SAFETY: BLOCKED"
		out "REASON: AMBIGUOUS_TASK"
		out "REQUIRED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
		out "OBSERVED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
		out "DETAIL: ${_count} admitted tasks; re-run with an explicit <task-id>"
		out "REMEDIATION: retry with an explicit task-id; do not bypass with raw git"
		exit $EXIT_BLOCKED
	fi
}

# --- subcommands ---------------------------------------------------------------

cmd_create() {
	# $1 = task-id.
	_task=$1
	valid_task_id "${_task}" || {
		out "GIT_SAFETY: BLOCKED"
		out "REASON: INVALID_TASK_ID"
		out "REQUIRED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
		out "OBSERVED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
		out "TASK: ${_task}"
		out "DETAIL: task-id must match [A-Za-z0-9._-]+, not start with '.'/'-', contain no '/' or '..'"
		out "REMEDIATION: retry with a valid task-id; do not bypass with raw git"
		exit $EXIT_BLOCKED
	}
	resolve_repo "${REPO}"
	_repo=${_REPO}
	remote_configured "${_repo}" || not_applicable "REMOTE: ${REMOTE} (not configured)"
	if [ -n "${BASE_REF}" ]; then
		_branch=${BASE_REF}
	else
		discover_branch "${_repo}"
		_branch=${_BRANCH}
	fi
	fresh_fetch "${_repo}"
	resolve_base "${_repo}" "${_branch}"
	_base=${_BASE}
	_rurl=$(remote_url "${_repo}")
	common_dir "${_repo}"
	_cdir=${_CDIR}
	_sdir="${_cdir}/git-safety"
	_rdir=$(record_dir "${_cdir}" "${_task}")
	if [ -n "${WORKTREE_OVERRIDE}" ]; then
		_wt=${WORKTREE_OVERRIDE}
	else
		_wt=$(default_worktree_path "${_cdir}" "${_task}")
	fi
	_wt_parent=$(dirname -- "${_wt}")
	_wt_base=$(basename -- "${_wt}")
	_wt_parent_phys=$(physpath "${_wt_parent}")
	_wt_phys_want="${_wt_parent_phys}/${_wt_base}"

	# Idempotent re-admission: same fresh BASE, same registered worktree.
	if [ -f "${_rdir}/BASE" ]; then
		_prev_base=$(read_record "${_rdir}" "BASE")
		_prev_wt=$(read_record "${_rdir}" "WORKTREE")
		if [ "${_prev_base}" = "${_base}" ] && [ -n "${_prev_wt}" ] \
			&& [ "${_prev_wt}" = "${_wt_phys_want}" ] \
			&& worktree_registered_at "${_repo}" "${_wt_phys_want}"; then
			_head=$(git -C "${_wt_phys_want}" rev-parse HEAD 2>/dev/null || true)
			if git -C "${_wt_phys_want}" merge-base --is-ancestor "${_base}" "${_head}" 2>/dev/null; then
				out "GIT_SAFETY: ADMITTED"
				out "TASK: ${_task}"
				out "BASE: ${_base}"
				out "BASE_REF: ${REMOTE}/${_branch}"
				out "WORKTREE: ${_wt_phys_want}"
				out "REMOTE_URL: ${_rurl}"
				out "NOTE: already admitted (idempotent)"
				exit $EXIT_OK
			fi
		fi
		blocked "TASK_CONFLICT" "TASK: ${_task}" "DETAIL: prior admission differs from fresh state; remove nothing automatically — pick a new task-id or resolve manually"
	fi
	if [ -e "${_wt}" ]; then
		blocked "TASK_CONFLICT" "TASK: ${_task}" "WORKTREE: ${_wt_phys_want}" "DETAIL: worktree path already exists and is not this task's admission; nothing was removed or overwritten"
	fi

	if ! _err=$(git -C "${_repo}" worktree add --detach -- "${_wt}" "${_base}" 2>&1); then
		_detail=$(printf '%s\n' "${_err}" | head -n 1)
		blocked "WORKTREE_CREATE_FAILED" "TASK: ${_task}" "DETAIL: ${_detail}"
	fi
	_wt_phys=$(physpath "${_wt}")
	_head=$(git -C "${_wt_phys}" rev-parse HEAD 2>/dev/null || true)
	[ "${_head}" = "${_base}" ] || blocked "WORKTREE_CREATE_FAILED" "TASK: ${_task}" "DETAIL: worktree HEAD (${_head}) != admitted BASE (${_base})"
	[ -z "$(git -C "${_wt_phys}" status --porcelain 2>/dev/null)" ] || blocked "WORKTREE_DIRTY" "TASK: ${_task}" "DETAIL: fresh worktree is not clean; canonical dirty state must never be inherited — investigate, do not stash/reset automatically"
	write_record "${_rdir}" "${_base}" "${REMOTE}/${_branch}" "${_rurl}" "${_wt_phys}"

	out "GIT_SAFETY: ADMITTED"
	out "TASK: ${_task}"
	out "BASE: ${_base}"
	out "BASE_REF: ${REMOTE}/${_branch}"
	out "WORKTREE: ${_wt_phys}"
	out "REMOTE_URL: ${_rurl}"
	exit $EXIT_OK
}

cmd_check() {
	# $1 = maybe-task.
	resolve_repo "${REPO}"
	_repo=${_REPO}
	common_dir "${_repo}"
	_cdir=${_CDIR}
	_sdir="${_cdir}/git-safety"
	select_task "${_sdir}" "${1:-}" "${_repo}"
	_task=${_TASK}
	_sel=${_TASK_SELECTION}
	_rdir=$(record_dir "${_cdir}" "${_task}")
	_base=$(read_record "${_rdir}" "BASE")
	_base_ref=$(read_record "${_rdir}" "BASE_REF")
	_rurl_rec=$(read_record "${_rdir}" "REMOTE_URL")
	_wt_rec=$(read_record "${_rdir}" "WORKTREE")
	[ -n "${_base}" ] && [ -n "${_wt_rec}" ] || blocked "NO_ADMISSION" "TASK: ${_task}" "TASK_SELECTION: ${_sel}"
	worktree_registered_at "${_repo}" "${_wt_rec}" || blocked "WORKTREE_MISSING" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "WORKTREE: ${_wt_rec}" "DETAIL: admitted worktree is not registered; state was preserved, nothing was recreated"
	_head=$(git -C "${_wt_rec}" rev-parse HEAD 2>/dev/null || true)
	[ -n "${_head}" ] || blocked "WORKTREE_MISSING" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "WORKTREE: ${_wt_rec}"
	git -C "${_wt_rec}" merge-base --is-ancestor "${_base}" "${_head}" 2>/dev/null \
		|| blocked "BASE_MISMATCH" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "ADMITTED_BASE: ${_base}" "CANDIDATE_HEAD: ${_head}" "CANDIDATE_SCOPE: admitted task worktree HEAD only (not the invoking checkout/main HEAD)" "DETAIL: admitted BASE is not an ancestor of the worktree HEAD"
	_live_url=$(remote_url "${_repo}")
	if [ -n "${_rurl_rec}" ] && [ -n "${_live_url}" ] && [ "${_rurl_rec}" != "${_live_url}" ]; then
		blocked "REMOTE_MISMATCH" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "ADMITTED_REMOTE_URL: ${_rurl_rec}" "CURRENT_REMOTE_URL: ${_live_url}"
	fi
	if [ -z "$(git -C "${_wt_rec}" status --porcelain 2>/dev/null)" ]; then
		_state="CLEAN"
	else
		_state="DIRTY"
	fi
	out "GIT_SAFETY: OK"
	out "TASK: ${_task}"
	out "TASK_SELECTION: ${_sel}"
	out "ADMITTED_BASE: ${_base}"
	out "BASE_REF: ${_base_ref}"
	out "CANDIDATE_HEAD: ${_head}"
	out "CANDIDATE_SCOPE: admitted task worktree HEAD only (not the invoking checkout/main HEAD)"
	out "WORKTREE: ${_wt_rec}"
	out "WORKTREE_STATE: ${_state}"
	exit $EXIT_OK
}

cmd_pre_publish() {
	# $1 = maybe-task. Fresh topology recheck. FF-only. Never reconciles.
	resolve_repo "${REPO}"
	_repo=${_REPO}
	remote_configured "${_repo}" || not_applicable "REMOTE: ${REMOTE} (not configured)"
	common_dir "${_repo}"
	_cdir=${_CDIR}
	_sdir="${_cdir}/git-safety"
	select_task "${_sdir}" "${1:-}" "${_repo}"
	_task=${_TASK}
	_sel=${_TASK_SELECTION}
	_rdir=$(record_dir "${_cdir}" "${_task}")
	_base=$(read_record "${_rdir}" "BASE")
	_base_ref=$(read_record "${_rdir}" "BASE_REF")
	_branch=${BASE_REF:-${_base_ref#"${REMOTE}/"}}
	[ -n "${_base}" ] || blocked "NO_ADMISSION" "TASK: ${_task}" "TASK_SELECTION: ${_sel}"
	_wt_rec=$(read_record "${_rdir}" "WORKTREE")
	worktree_registered_at "${_repo}" "${_wt_rec}" || blocked "WORKTREE_MISSING" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "WORKTREE: ${_wt_rec}"
	fresh_fetch "${_repo}"
	resolve_base "${_repo}" "${_branch}"
	_current=${_BASE}
	_head=$(git -C "${_wt_rec}" rev-parse HEAD 2>/dev/null || true)
	_ff_despite_move=""
	if [ "${_current}" != "${_base}" ]; then
		# Direct containment evidence overrides string inequality: a candidate
		# whose HEAD already contains the current remote base (JIT-bound child
		# of the fresh trunk, or an already-published HEAD) is FF-publishable
		# despite admitted-base movement. String comparison alone never marks
		# such a candidate stale.
		if [ -n "${_head}" ] \
			&& git -C "${_wt_rec}" merge-base --is-ancestor "${_current}" "${_head}" 2>/dev/null \
			&& git -C "${_wt_rec}" merge-base --is-ancestor "${_base}" "${_head}" 2>/dev/null; then
			_ff_despite_move="yes"
		else
			out "GIT_SAFETY: BLOCKED"
			out "REASON: REMOTE_ADVANCED"
			out "REQUIRED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
			out "OBSERVED_CONTRACT: ${GIT_SAFETY_CONTRACT}"
			out "TASK: ${_task}"
			out "TASK_SELECTION: ${_sel}"
			out "ADMITTED_BASE: ${_base}"
			out "CURRENT_BASE: ${_current}"
			out "REMOTE_REF: ${REMOTE}/${_branch}"
			out "CANDIDATE_HEAD: ${_head}"
			out "CANDIDATE_SCOPE: admitted task worktree HEAD only (not the invoking checkout/main HEAD)"
			out "WORKTREE: ${_wt_rec}"
			out "AUTO_RECONCILIATION: none (merge/rebase/cherry-pick/force-push refused by baseline scope)"
			out "DETAIL: topology-only verdict about TASK ${_task} worktree candidate only (CANDIDATE_HEAD is the admitted task worktree HEAD, not the invoking checkout/main HEAD); current remote base differs from admitted base; candidate/worktree state is preserved and publication is not currently fast-forward eligible for this TASK candidate; this verdict is not proof about any other checkout/candidate; remote movement by itself is not semantic invalidation; nothing was removed, overwritten, or reconciled"
			out "REMEDIATION: return this topology result to the governing repository/runtime contract; classify intervening movement before choosing the next bounded transition (only overlapping semantic movement requires re-checking meaning and proof); a BLOCKED result never authorizes raw-git publication of any candidate (including a different local HEAD that appears fast-forward-safe) — publish only the admitted TASK worktree HEAD after PUBLISHABLE_FF for that same TASK, or admit a fresh TASK for the intended candidate and re-prove; do not bypass git-safety and do not merge/rebase/cherry-pick/force-push"
			exit $EXIT_BLOCKED
		fi
	fi
	git -C "${_wt_rec}" merge-base --is-ancestor "${_base}" "${_head}" 2>/dev/null \
		|| blocked "CANDIDATE_DIVERGED" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "ADMITTED_BASE: ${_base}" "CANDIDATE_HEAD: ${_head}" "CANDIDATE_SCOPE: admitted task worktree HEAD only (not the invoking checkout/main HEAD)" "DETAIL: candidate (admitted task worktree HEAD) does not descend from the admitted BASE"
	out "GIT_SAFETY: PUBLISHABLE_FF"
	out "TASK: ${_task}"
	out "TASK_SELECTION: ${_sel}"
	out "ADMITTED_BASE: ${_base}"
	out "CURRENT_BASE: ${_current}"
	out "REMOTE_REF: ${REMOTE}/${_branch}"
	out "CANDIDATE_HEAD: ${_head}"
	out "CANDIDATE_SCOPE: admitted task worktree HEAD only (not the invoking checkout/main HEAD)"
	out "WORKTREE: ${_wt_rec}"
	if [ -n "${_ff_despite_move}" ]; then
		out "NOTE: admitted base differs from current base but the current base is a direct ancestor of the candidate (containment evidence); FF-eligible without re-derivation"
	fi
	exit $EXIT_OK
}

cmd_version() {
	out "GIT_SAFETY: OK"
	out "CONTRACT: ${GIT_SAFETY_CONTRACT}"
	out "IMPLEMENTATION: canonical"
	exit $EXIT_OK
}

cmd_close() {
	# $1 = maybe-task. Safe resource-lifecycle closure for a completed task.
	# Removes ONLY the admitted task-owned linked worktree (never forced)
	# and, after verified removal, ONLY that task's admission record. Never
	# infers semantic completion: the caller requests closure after semantic
	# and publication closure; this owns objective Git safety only. Any
	# failure is fail-closed with state preserved.
	resolve_repo "${REPO}"
	_repo=${_REPO}
	remote_configured "${_repo}" || not_applicable "REMOTE: ${REMOTE} (not configured)"
	common_dir "${_repo}"
	_cdir=${_CDIR}
	_sdir="${_cdir}/git-safety"
	select_task "${_sdir}" "${1:-}" "${_repo}"
	_task=${_TASK}
	_sel=${_TASK_SELECTION}
	_rdir=$(record_dir "${_cdir}" "${_task}")
	_base=$(read_record "${_rdir}" "BASE")
	_base_ref=$(read_record "${_rdir}" "BASE_REF")
	_rurl_rec=$(read_record "${_rdir}" "REMOTE_URL")
	_wt_rec=$(read_record "${_rdir}" "WORKTREE")
	[ -n "${_base}" ] && [ -n "${_wt_rec}" ] || blocked "NO_ADMISSION" "TASK: ${_task}" "TASK_SELECTION: ${_sel}"
	worktree_registered_at "${_repo}" "${_wt_rec}" || blocked "WORKTREE_MISSING" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "WORKTREE: ${_wt_rec}" "DETAIL: admitted worktree is not registered; state was preserved, nothing was removed and the admission record was kept"
	_live_url=$(remote_url "${_repo}")
	if [ -n "${_rurl_rec}" ] && [ -n "${_live_url}" ] && [ "${_rurl_rec}" != "${_live_url}" ]; then
		blocked "REMOTE_MISMATCH" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "ADMITTED_REMOTE_URL: ${_rurl_rec}" "CURRENT_REMOTE_URL: ${_live_url}"
	fi
	if [ -n "$(git -C "${_wt_rec}" status --porcelain 2>/dev/null)" ]; then
		blocked "WORKTREE_DIRTY" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "WORKTREE: ${_wt_rec}" "DETAIL: task worktree has uncommitted or untracked changes; state was preserved, nothing was removed"
	fi
	_head=$(git -C "${_wt_rec}" rev-parse HEAD 2>/dev/null || true)
	[ -n "${_head}" ] || blocked "WORKTREE_MISSING" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "WORKTREE: ${_wt_rec}"
	_branch=${_base_ref#"${REMOTE}/"}
	[ -n "${_branch}" ] || blocked "NO_ADMISSION" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "DETAIL: admission record has no BASE_REF"
	fresh_fetch "${_repo}"
	resolve_base "${_repo}" "${_branch}"
	_current=${_BASE}
	if ! git -C "${_repo}" merge-base --is-ancestor "${_head}" "${_current}" 2>/dev/null; then
		blocked "UNPUBLISHED_CANDIDATE" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "ADMITTED_BASE: ${_base}" "CANDIDATE_HEAD: ${_head}" "CANDIDATE_SCOPE: admitted task worktree HEAD only (not the invoking checkout/main HEAD)" "CURRENT_BASE: ${_current}" "REMOTE_REF: ${REMOTE}/${_branch}" "DETAIL: candidate is not contained in current canonical remote history; removing the worktree could discard an unpublished unique candidate — worktree and admission record were preserved"
	fi
	if ! _err=$(git -C "${_repo}" worktree remove -- "${_wt_rec}" 2>&1); then
		_detail=$(printf '%s\n' "${_err}" | head -n 1)
		blocked "WORKTREE_REMOVE_FAILED" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "WORKTREE: ${_wt_rec}" "DETAIL: ${_detail}"
	fi
	worktree_registered_at "${_repo}" "${_wt_rec}" && blocked "WORKTREE_REMOVE_FAILED" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "WORKTREE: ${_wt_rec}" "DETAIL: worktree still registered after removal; admission record was kept"
	rm -rf "${_rdir}"
	[ -e "${_rdir}" ] && blocked "WORKTREE_REMOVE_FAILED" "TASK: ${_task}" "TASK_SELECTION: ${_sel}" "DETAIL: admission record could not be removed; worktree was already removed"
	out "GIT_SAFETY: CLOSED"
	out "TASK: ${_task}"
	out "TASK_SELECTION: ${_sel}"
	out "ADMITTED_BASE: ${_base}"
	out "CANDIDATE_HEAD: ${_head}"
	out "CURRENT_BASE: ${_current}"
	out "REMOTE_REF: ${REMOTE}/${_branch}"
	out "WORKTREE: ${_wt_rec}"
	exit $EXIT_OK
}

# --- argument parsing ----------------------------------------------------------

main() {
	# Strip already-declared global flags, leaving subcommand + rest.
	# Values carrying spaces (repo/worktree paths) survive: only the flag
	# name and its single following argument are shifted.
	while [ $# -gt 0 ]; do
		case "${1}" in
			--repo)
				[ $# -ge 2 ] || usage
				REPO=$2
				shift 2
				;;
			--remote)
				[ $# -ge 2 ] || usage
				REMOTE=$2
				shift 2
				;;
			-h | --help) usage ;;
			--) shift; break ;;
			-*) usage ;;
			*) break ;;
		esac
	done
	_cmd=${1:-}
	case "${_cmd}" in
		"") usage ;;
		version | help) cmd_version ;;
		create)
			shift
			_task=""
			while [ $# -gt 0 ]; do
				case "${1}" in
					--base-ref)
						[ $# -ge 2 ] || usage
						BASE_REF=$2
						shift 2
						;;
					--worktree)
						[ $# -ge 2 ] || usage
						WORKTREE_OVERRIDE=$2
						shift 2
						;;
					--repo | --remote) usage ;;
					-h | --help) usage ;;
					-*) usage ;;
					*)
						if [ -z "${_task}" ]; then
							_task=$1
							shift
						else
							usage
						fi
						;;
				esac
			done
			[ -n "${_task}" ] || usage
			cmd_create "${_task}"
			;;
		check)
			shift
			[ $# -le 1 ] || usage
			case "${1:-}" in
				-*) usage ;;
			esac
			cmd_check "${1:-}"
			;;
		close)
			shift
			[ $# -le 1 ] || usage
			case "${1:-}" in
				-*) usage ;;
			esac
			cmd_close "${1:-}"
			;;
		pre-publish)
			shift
			_maybe=""
			while [ $# -gt 0 ]; do
				case "${1}" in
					--base-ref)
						[ $# -ge 2 ] || usage
						BASE_REF=$2
						shift 2
						;;
					--repo | --remote | --worktree) usage ;;
					-h | --help) usage ;;
					-*) usage ;;
					*)
						if [ -z "${_maybe}" ]; then
							_maybe=$1
							shift
						else
							usage
						fi
						;;
				esac
			done
			cmd_pre_publish "${_maybe}"
			;;
		*) usage ;;
	esac
}

main "$@"
