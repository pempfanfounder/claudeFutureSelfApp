"""Cursor completion hook. No app commands, network, UI, or canonical writes.

The coordinator's admission is still a trust boundary: this is a continuation
filter, not a sandbox or proof of consent. Defaults to no follow-up on ambiguity.

Executable work is admitted only against the approved scope and the remaining
budget recorded in canonical workflow state, never against run-state claims.
An exhausted or absent ledger blocks the task; the hook never replenishes.
The coordinator may open a finite allocation from remaining already-approved
budget; this filter still requires that open entry and never raises the cap.
An overnight grant may raise remaining caps without resetting historical used
counts. Sentry sends stay blocked unless remaining > 0. While SQL work is
active, a recovery_floor of database requests is reserved for cleanup.
"""
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

DEFAULT_FOLLOWUP_CAP = 20
RESOURCES = ('sql', 'local_checks', 'aggregate_checks', 'sentry')
ZERO_BUDGET_KINDS = ('read_only_review', 'artifact_preparation', 'code_repair')
EXECUTABLE_KINDS = ('service_sql', 'executable_check')
ALLOWED_TARGET_ENVS = ('development', 'staging')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def parse_time(value):
    moment = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment

def followup_cap(workflow):
    """Default 20. Overnight additional_followups replaces the cap for that window."""
    overnight = workflow.get('overnight_authorization')
    if isinstance(overnight, dict):
        extra = overnight.get('additional_followups')
        if type(extra) is int and extra > 0:
            return extra
    return DEFAULT_FOLLOWUP_CAP

def overnight_window_open(workflow, now):
    overnight = workflow.get('overnight_authorization')
    if not isinstance(overnight, dict):
        return True
    deadline = overnight.get('deadline')
    if not isinstance(deadline, str):
        return False
    try:
        return now < parse_time(deadline)
    except ValueError:
        return False

def sql_respects_recovery_floor(workflow, task, wanted):
    """Non-recovery SQL may not spend the protected cleanup floor."""
    if wanted == 0:
        return True
    entry = (workflow.get('budget_ledger') or {}).get('sql')
    if not isinstance(entry, dict):
        return False
    floor = entry.get('recovery_floor')
    if type(floor) is not int or floor <= 0:
        return True
    if task.get('allocation_id') == entry.get('recovery_allocation_id'):
        return True
    used, cap = entry.get('used'), entry.get('cap')
    if type(used) is not int or type(cap) is not int:
        return False
    return used + wanted <= cap - floor

def local_file(local, ref):
    if not isinstance(ref, str) or Path(ref).is_absolute():
        raise ValueError('Expected local relative reference')
    path = (local / ref).resolve()
    if not path.is_relative_to(local.resolve()) or not path.is_file():
        raise ValueError('Missing or external reference')
    return path

def budget_request(raw):
    """Normalise a declared budget. Unknown keys or non-ints are rejected."""
    if not isinstance(raw, dict):
        raise ValueError('budget_required must be an object')
    out = dict.fromkeys(RESOURCES, 0)
    for key, value in raw.items():
        if key not in RESOURCES or type(value) is not int or value < 0:
            raise ValueError('Unknown or invalid budget resource')
        out[key] = value
    return out

def approval_usable(workflow, approval_id, now):
    """An approval must exist, be approved, and not be past an actual expiry."""
    approval = next((a for a in workflow.get('approvals', [])
                     if a.get('id') == approval_id), None)
    if not isinstance(approval, dict) or approval.get('status') != 'approved':
        return False
    if approval.get('superseded_by') is not None:
        return False
    expires = approval.get('expires_at')
    if expires is None:
        return True
    if not isinstance(expires, str):
        return False
    try:
        return parse_time(expires) > now
    except ValueError:
        return False

def allocation_covers(workflow, task, resource, wanted):
    """A cap with room is not permission: a finite assignment must exist.

    Remaining global capacity says only that the ceiling was not reached. The
    coordinator must still have recorded an open allocation for this resource,
    because a reservation allocates no budget on its own.
    """
    allocations = workflow.get('budget_allocations')
    if not isinstance(allocations, list):
        return False
    entry = next((a for a in allocations
                  if isinstance(a, dict) and a.get('id') == task.get('allocation_id')), None)
    if not isinstance(entry, dict) or entry.get('status') != 'open':
        return False
    if entry.get('resource') != resource:
        return False
    if entry.get('authority_id') != task.get('authority_id'):
        return False
    remaining = entry.get('remaining')
    return type(remaining) is int and 0 <= wanted <= remaining

def budget_available(local, workflow, request, task):
    """Compare the request against canonical remaining budget only."""
    ledger = workflow.get('budget_ledger')
    if not isinstance(ledger, dict):
        return False
    for resource, wanted in request.items():
        if wanted == 0:
            continue
        entry = ledger.get(resource)
        if not isinstance(entry, dict):
            return False
        used, cap = entry.get('used'), entry.get('cap')
        if type(used) is not int or type(cap) is not int or used < 0 or cap < 0:
            return False
        if used + wanted > cap:
            return False
        # The cited approval must be the one recorded as authorising THIS
        # resource. Status and expiry alone would admit an unrelated approval.
        if task.get('authority_id') != entry.get('authority'):
            return False
        # A declared target must match the approved target for that resource.
        target = entry.get('target')
        if target is not None and task.get('target_ref') != target:
            return False
        # Cross-check an external ledger so canonical usage cannot drift down.
        ref = entry.get('ledger_ref')
        if ref is not None:
            recorded = json.loads(local_file(local, ref).read_text())
            if recorded.get('consumed_total') != used:
                return False
        if not allocation_covers(workflow, task, resource, wanted):
            return False
        if resource == 'sql' and not sql_respects_recovery_floor(workflow, task, wanted):
            return False
    return True

def task_admitted(local, workflow, task, now):
    kind = task.get('kind')
    if kind not in ZERO_BUDGET_KINDS + EXECUTABLE_KINDS:
        return False
    if task.get('status') != 'ready' or task.get('dependencies_satisfied') is not True:
        return False
    if task.get('requires_computer_use') is not False:
        return False
    # Native device work stays blocked while the founder pause is recorded.
    # An omitted flag must not skip this: declare it exactly, like computer use.
    if workflow.get('native_recovery_paused') is not False:
        if task.get('requires_native') is not False:
            return False
    request = budget_request(task.get('budget_required'))
    executable = any(request[r] > 0 for r in RESOURCES)
    if executable != (kind in EXECUTABLE_KINDS):
        # A zero-budget kind may not spend, and an executable kind must declare
        # what it spends. Either mismatch is a malformed admission.
        return False
    if kind == 'code_repair':
        if workflow.get('stage') != 4 or task.get('authority_verified') is not True:
            return False
        if not approval_usable(workflow, task.get('authority_id'), now):
            return False
        local_file(local, task.get('scope_ref'))
        return True
    if not executable:
        return True
    # Executable service work: real scope, real target, real remaining budget.
    if task.get('authority_verified') is not True:
        return False
    if not approval_usable(workflow, task.get('authority_id'), now):
        return False
    if task.get('target_env') not in ALLOWED_TARGET_ENVS:
        return False
    local_file(local, task.get('scope_ref'))
    return budget_available(local, workflow, request, task)

def handle(event, root):
    try:
        root = root.resolve()
        if event.get('hook_event_name') == 'sessionStart':
            if str(root) in [str(Path(p).resolve()) for p in event.get('workspace_roots', [])]:
                identity = event.get('conversation_id')
                if isinstance(identity, str) and identity:
                    return {'additional_context': 'Cursor conversation ID: ' + identity + '. Future Self is opt-in: only if the founder requests this workflow, read .cursor/FUTURE_SELF_SETUP.md and the saved handoff. This hook does not adopt ownership or start work.'}
            return {}
        if event.get('hook_event_name') != 'stop' or event.get('status') != 'completed':
            return {}
        if str(root) not in [str(Path(p).resolve()) for p in event.get('workspace_roots', [])]:
            return {}
        conversation = event.get('conversation_id')
        if not isinstance(conversation, str) or not conversation:
            return {}
        local = root / '.future-self/local'
        workflow_path = local / 'workflow.json'
        run_path = local / 'platform-handoff/cursor-run.json'
        workflow_raw = workflow_path.read_bytes()
        run_raw = run_path.read_bytes()
        workflow, run = json.loads(workflow_raw), json.loads(run_raw)
        now = datetime.now(timezone.utc)
        cap = followup_cap(workflow)
        count = event.get('loop_count')
        if type(count) is not int or not 0 <= count < cap:
            return {}
        if not overnight_window_open(workflow, now):
            return {}
        handoff = workflow.get('platform_handoff', {})
        if handoff.get('owner_platform') != 'cursor' or handoff.get('status') != 'active':
            return {}
        if workflow.get('active_owner') != 'cursor:' + conversation:
            return {}
        if workflow.get('pending_gate') is not None or workflow.get('status') not in ['ready', 'in_progress']:
            return {}
        if run.get('enabled') is not True or run.get('conversation_id') != conversation:
            return {}
        if run.get('needs_user') is not False or run.get('active_workers') != []:
            return {}
        revision = workflow.get('revision')
        progress = run.get('last_progress', {})
        if type(revision) is not int or run.get('checkpoint_revision') != revision or progress.get('checkpoint_revision') != revision:
            return {}
        evidence = local_file(local, progress.get('evidence_ref'))
        evidence_hash = digest(evidence)
        if evidence_hash != progress.get('sha256'):
            return {}
        task = run.get('next_task', {})
        task_id = task.get('id')
        if not isinstance(task_id, str) or not task_id or len(task_id) > 160:
            return {}
        if not task_admitted(local, workflow, task, now):
            return {}
        instruction = local_file(local, task.get('instruction_ref'))
        receipts = local / 'platform-handoff/cursor-hook-receipts'
        receipts.mkdir(exist_ok=True)
        key = hashlib.sha256(conversation.encode()).hexdigest()
        receipt_path = receipts / (key + '.json')
        with (receipts / (key + '.lock')).open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {'count': 0, 'task_ids': [], 'revision': -1, 'evidence_hash': None}
            if receipt['count'] >= cap or task_id in receipt['task_ids'] or revision <= receipt['revision'] or evidence_hash == receipt['evidence_hash']:
                return {}
            if workflow_path.read_bytes() != workflow_raw or run_path.read_bytes() != run_raw:
                return {}
            receipt.update(count=receipt['count']+1, task_ids=receipt['task_ids']+[task_id], revision=revision, evidence_hash=evidence_hash)
            fd, temp = tempfile.mkstemp(dir=receipts, prefix=key+'.')
            try:
                with os.fdopen(fd, 'w') as out:
                    json.dump(receipt, out);out.flush();os.fsync(out.fileno())
                os.replace(temp, receipt_path)
            finally:
                if os.path.exists(temp):os.unlink(temp)
        spend = ', '.join(f'{r}={task["budget_required"].get(r, 0)}' for r in RESOURCES)
        return {'followup_message': 'Future Self automatic continuation: re-read current workflow.json and platform-handoff/cursor-run.json. Proceed only if ownership, checkpoint and admission still match. Execute the single admitted task described in ' + str(instruction) + '. Declared budget: ' + spend + '; consume no more than that and record every actual attempt in the canonical ledger before checkpointing. Do not spend protected SQL recovery, do not send Sentry events, native device work stays paused, production stays read-only and no computer use is permitted. Collect workers, save concrete evidence and checkpoint before another step. A cancellation, blocker, missing allowance, overnight deadline or Codex handback stops continuation.'}
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return {}

if __name__ == '__main__':
    try:
        payload = json.loads(sys.stdin.read(65537))
        result = handle(payload, Path(__file__).resolve().parents[2])
    except Exception:
        result = {}
    print(json.dumps(result))
