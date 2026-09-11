#!/usr/bin/env python3
"""Offline workflow file/checkpoint check and status. No app execution or writes.

Checks integrity, structure and references, not actual user consent, external
truth, legal compliance, or launch readiness. Python 3.9+ standard library.
"""
from __future__ import annotations
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
from typing import Any

sys.dont_write_bytecode = True
STAGES = {
    1: ('Discovery and founder decisions', '01-discovery.md'),
    2: ('Risk and integration audit', '02-audit.md'),
    3: ('Native design and motion choices', '03-design-motion.md'),
    4: ('Approved implementation', '04-implementation.md'),
    5: ('Independent QA and retest', '05-independent-qa.md'),
    6: ('Release', '06-release.md'),
}
STATUSES = {'ready', 'in_progress', 'awaiting_founder', 'blocked', 'awaiting_external', 'complete'}
LAUNCH = {'not_started', 'preparing', 'uploaded', 'in_review', 'approved', 'live'}
LOCAL_DOCS = ['NEXT.md', 'STATE.md', 'DECISIONS.md', 'WORK.md', 'QA.md', 'RELEASE.md']


def read_regular(root: Path, rel: str) -> bytes:
    p = PurePosixPath(rel)
    if p.is_absolute() or '\\' in rel or ':' in rel or any(x in ('', '.', '..') for x in rel.split('/')):
        raise ValueError('Unsafe workflow path.')
    q = root
    for part in p.parts:
        q = q / part
        if q.is_symlink():
            raise ValueError('Symlinked workflow path: ' + rel)
    st = q.stat()
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
        raise ValueError('Nonregular or linked workflow file: ' + rel)
    if st.st_size > 8 * 1024 * 1024:
        raise ValueError('Workflow file is too large for this check: ' + rel)
    return q.read_bytes()


def validate(root: Path) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    s = json.loads(read_regular(root, '.future-self/local/workflow.json'))
    if not isinstance(s, dict):
        return ['Checkpoint must be a JSON object.'], {}
    required = {'schema_version','package_version','revision','setup_complete','stage','status',
                'next_stage','return_to','cycle','completed_stages','stage_records','pending_gate',
                'approvals','source_baseline','current_candidate','active_owner','launch_status',
                'last_checkpoint','next_action'}
    if required - set(s):
        errors.append('Missing checkpoint fields: ' + ', '.join(sorted(required-set(s))))
    if s.get('schema_version') != 1 or s.get('package_version') != '2.0.0':
        errors.append('Unsupported workflow schema/package version; do not reset it.')
    if s.get('setup_complete') is not True:
        errors.append('Setup is not recorded complete.')
    stage = s.get('stage')
    if type(stage) is not int or stage not in STAGES:
        errors.append('Invalid stage.')
    status = s.get('status')
    if status not in STATUSES:
        errors.append('Invalid status.')
    rev = s.get('revision')
    if type(rev) is not int or rev < 0:
        errors.append('Invalid checkpoint revision.')
    if type(s.get('cycle')) is not int or s.get('cycle', 0) < 1:
        errors.append('Invalid cycle.')
    for key in ('next_stage', 'return_to'):
        v = s.get(key)
        if v is not None and (type(v) is not int or v not in STAGES):
            errors.append('Invalid ' + key + '.')
    if not s.get('last_checkpoint'):
        errors.append('Missing checkpoint date.')
    else:
        try:
            datetime.fromisoformat(str(s['last_checkpoint']).replace('Z', '+00:00'))
        except ValueError:
            errors.append('Invalid checkpoint date.')
    if s.get('launch_status') not in LAUNCH:
        errors.append('Invalid launch status.')
    if not isinstance(s.get('next_action'), str) or not s.get('next_action', '').strip():
        errors.append('Missing next action.')
    if not isinstance(s.get('source_baseline'), dict):
        errors.append('Invalid setup baseline.')
    docs: dict[str, str] = {}
    for doc in LOCAL_DOCS:
        text = read_regular(root, '.future-self/local/' + doc).decode('utf-8')
        if not text.strip():
            errors.append('Empty live document: ' + doc)
        docs[doc] = text
    m = re.search(r'^Checkpoint revision:\s*(\d+)\s*$', docs['NEXT.md'], re.M)
    if not m or int(m.group(1)) != rev:
        errors.append('NEXT.md and workflow.json checkpoint revisions differ; reconcile from evidence.')
    gate = s.get('pending_gate')
    if gate is not None:
        if not isinstance(gate, dict) or any(not gate.get(k) for k in ('id','kind','summary','scope_ref')):
            errors.append('Pending gate lacks its ID/kind/summary/scope reference.')
        if status != 'awaiting_founder':
            errors.append('A pending approval gate requires awaiting_founder status.')
    if status == 'awaiting_founder' and not gate:
        errors.append('awaiting_founder has no concrete gate/decision.')
    approvals = s.get('approvals')
    ids: set[str] = set()
    if not isinstance(approvals, list):
        errors.append('approvals must be a list.')
        approvals = []
    for a in approvals:
        if not isinstance(a, dict) or any(k not in a for k in ('id','kind','status','scope','decision_ref','expires_at')):
            errors.append('Incomplete approval mirror.')
            continue
        if not isinstance(a['id'], str) or a['id'] in ids:
            errors.append('Duplicate/invalid approval ID.')
            continue
        ids.add(a['id'])
        if a['status'] not in {'approved','revoked','expired','superseded','exhausted'}:
            errors.append('Invalid approval status: ' + a['id'])
        expected = 'DECISIONS.md#' + a['id']
        if a['decision_ref'] != expected or not re.search(r'^#{1,6}\s+' + re.escape(a['id']) + r'(?:\s|$)', docs['DECISIONS.md'], re.M):
            errors.append('Approval has no matching DECISIONS heading: ' + a['id'])
        if not a['scope']:
            errors.append('Approval lacks scope: ' + a['id'])
        if a['expires_at'] is not None:
            try:
                datetime.fromisoformat(str(a['expires_at']).replace('Z','+00:00'))
            except ValueError:
                errors.append('Invalid approval expiry: ' + a['id'])
    completed = s.get('completed_stages')
    if not isinstance(completed, list) or any(type(n) is not int or n not in STAGES for n in completed):
        errors.append('Invalid completed stages.')
        completed = []
    elif len(set(completed)) != len(completed):
        errors.append('Duplicate completed stages.')
    records = s.get('stage_records')
    accepted: set[int] = set()
    closed: set[tuple[int, int]] = set()
    if not isinstance(records, list):
        errors.append('stage_records must be a list.')
        records = []
    for r in records:
        if (not isinstance(r, dict) or r.get('stage') not in STAGES
                or r.get('outcome') not in ('accepted', 'repair_required')
                or type(r.get('cycle')) is not int or r.get('cycle', 0) < 1
                or not isinstance(r.get('evidence_refs'), list) or not r.get('evidence_refs')
                or not isinstance(r.get('approval_ids'), list)):
            errors.append('Incomplete stage-closure record (including outcome/cycle).')
            continue
        closed.add((r['stage'], r['cycle']))
        if r['outcome'] == 'accepted':
            accepted.add(r['stage'])
        if any(x not in ids for x in r['approval_ids']):
            errors.append('Stage record names a missing approval.')
        for ref in r['evidence_refs']:
            if not isinstance(ref, str):
                errors.append('Invalid evidence reference.')
                continue
            file_part = ref.split('#',1)[0]
            try:
                read_regular(root, '.future-self/local/' + file_part)
            except (OSError, ValueError):
                errors.append('Missing/unsafe stage evidence reference: ' + ref)
    if any(n not in accepted for n in completed):
        errors.append('An accepted completed stage lacks its evidence-linked accepted record.')
    if type(stage) is int and stage in STAGES:
        nxt = s.get('next_stage')
        is_repair = stage in (5, 6) and nxt == 4 and s.get('return_to') in (5, 6)
        # A closed failed QA/release attempt may invalidate implementation/QA
        # acceptance while routing its approved repair, but not product/design.
        prerequisite_stop = 4 if status == 'complete' and is_repair else stage
        if any(n not in completed for n in range(1, prerequisite_stop)):
            errors.append('A prior stage is not recorded accepted. Do not skip prerequisites.')
        if status == 'complete' and (stage, s.get('cycle')) not in closed:
            errors.append('Current closed stage lacks its current-cycle closure record.')
        if nxt is not None and status != 'complete':
            errors.append('next_stage can be set only at a stopped, complete stage boundary.')
        if status == 'complete' and not is_repair and stage not in completed:
            errors.append('Normal forward transition requires accepted stage evidence.')
        if status == 'complete' and nxt is None and not (stage == 6 and s.get('launch_status') == 'live'):
            errors.append('Closed nonterminal stage has no next-stage handoff.')
        if nxt is not None and not (nxt == stage + 1 or is_repair):
            errors.append('Invalid stage transition; follow normal sequence or explicit repair loop.')
    if s.get('launch_status') == 'live' and (stage != 6 or status != 'complete' or not s.get('current_candidate')):
        errors.append('Live status requires accepted Stage 6 and identified candidate; evidence must still be reviewed.')
    receipt = json.loads(read_regular(root, '.future-self/local/install-receipt.json'))
    if receipt.get('package_id') != 'future-self-codex-workflow' or receipt.get('package_version') != '2.0.0':
        errors.append('Unexpected installation receipt.')
    files = receipt.get('static_file_hashes')
    if not isinstance(files, dict) or not files:
        errors.append('Missing installed static-file inventory.')
    else:
        for rel, digest in files.items():
            actual = hashlib.sha256(read_regular(root, rel)).hexdigest()
            if actual != digest:
                errors.append('Static workflow file changed: ' + rel + '; review the workflow change before updating its receipt.')
    for _, filename in STAGES.values():
        read_regular(root, '.future-self/prompts/' + filename)
    for rel in receipt.get('managed_instruction_files', []):
        text = read_regular(root, rel).decode('utf-8')
        if '<!-- BEGIN FUTURE SELF WORKFLOW v2 -->' not in text or '.future-self/START_HERE.md' not in text:
            errors.append('Managed router absent from ' + rel)
    ignore = read_regular(root, '.gitignore').decode('utf-8')
    if '/.future-self/local/' not in ignore:
        errors.append('Local checkpoint ignore rule is missing.')
    return errors, s


def status_lines(s: dict[str, Any]) -> list[str]:
    stage = s['stage']
    result = [f'Session {stage} — {STAGES[stage][0]}', 'Status: ' + s['status']]
    if s['status'] == 'awaiting_founder':
        g = s['pending_gate']
        result += [f'Founder decision {g["id"]}: {g["summary"]}',
                   'Next: respond to that specific decision. Continue is not approval.']
    elif s['status'] == 'complete' and s['next_stage']:
        n = s['next_stage']
        result += [f'Next stage: Session {n} — {STAGES[n][0]}',
                   'Next: ' + s['next_action']]
    elif s['launch_status'] == 'live' and s['status'] == 'complete':
        result += ['Recorded launch state: live. Consult RELEASE.md for actual evidence and operational handoff.']
    else:
        result += ['Next: ' + s['next_action']]
    result += ['No stage was executed by this status check.']
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=Path(__file__).absolute().parents[2])
    parser.add_argument('command', choices=['check', 'status'])
    args = parser.parse_args()
    try:
        errors, state = validate(args.workspace.resolve())
        if errors:
            print('WORKFLOW CHECK BLOCKED — no app work authorized by this check.')
            for error in errors:
                print('- ' + error)
            return 2
        if args.command == 'check':
            print('WORKFLOW FILE CHECK PASSED. No app tests, stage execution or service checks were performed.')
            print('This validates file/state structure and references, not actual consent or launch readiness.')
        else:
            print('\n'.join(status_lines(state)))
        return 0
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
        print('WORKFLOW CHECK BLOCKED: ' + str(exc), file=sys.stderr)
        print('Recover existing state from evidence. Do not reset it or start an app stage.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
