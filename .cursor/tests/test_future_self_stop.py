import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'hooks/future_self_stop.py'

class HookTestBase(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), 'Continuation hook must exist')
        spec = importlib.util.spec_from_file_location('hook', SCRIPT)
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.local = self.root / '.future-self/local'
        (self.local / 'platform-handoff').mkdir(parents=True)
        (self.local / 'proof.md').write_text('Reviewed evidence, concrete progress')
        self.event = {'hook_event_name':'stop','status':'completed','conversation_id':'test-session','loop_count':0,'workspace_roots':[str(self.root)]}
        self.workflow = {'revision':10,'stage':5,'status':'in_progress','pending_gate':None,'active_owner':'cursor:test-session','platform_handoff':{'owner_platform':'cursor','status':'active'},'approvals':[]}
        self.run = {'enabled':True,'conversation_id':'test-session','checkpoint_revision':10,'active_workers':[],'needs_user':False,'last_progress':{'checkpoint_revision':10,'evidence_ref':'proof.md','sha256':self.mod.digest(self.local/'proof.md')},'next_task':{'id':'review-1','kind':'read_only_review','status':'ready','dependencies_satisfied':True,'requires_computer_use':False,'requires_native':False,'budget_required':{'sql':0,'local_checks':0,'sentry':0},'instruction_ref':'proof.md'}}
        self.save()
    def save(self):
        (self.local/'workflow.json').write_text(json.dumps(self.workflow))
        (self.local/'platform-handoff/cursor-run.json').write_text(json.dumps(self.run))
    def call(self):
        return self.mod.handle(self.event, self.root)

class ContinuationTests(HookTestBase):
    def test_start_context_does_not_enable_work(self):
        self.event['hook_event_name']='sessionStart'
        self.assertIn('test-session', self.call()['additional_context'])
        self.assertFalse((self.local/'platform-handoff/cursor-hook-receipts').exists())
    def test_persisted_limit_and_disabled_state(self):
        self.call()
        receipt=next((self.local/'platform-handoff/cursor-hook-receipts').glob('*.json'))
        d=json.loads(receipt.read_text());d['count']=20;receipt.write_text(json.dumps(d))
        self.workflow['revision']=11;self.run['checkpoint_revision']=11;self.run['last_progress']['checkpoint_revision']=11
        (self.local/'proof.md').write_text('Second progress');self.run['last_progress']['sha256']=self.mod.digest(self.local/'proof.md');self.run['next_task']['id']='second';self.save()
        self.assertEqual({},self.call())
        self.run['enabled']=False;self.save();self.assertEqual({},self.call())
    def test_code_repair_needs_stage_and_scope(self):
        self.run['next_task'].update(kind='code_repair',authority_verified=True,authority_id='approval',scope_ref='proof.md')
        self.workflow['approvals']=[{'id':'approval','status':'approved','expires_at':None}];self.save()
        self.assertEqual({},self.call())
        self.workflow['stage']=4;self.save();self.assertIn('followup_message',self.call())
    def test_ready_then_duplicate_stops(self):
        self.assertIn('followup_message',self.call())
        self.assertEqual({},self.call())
    def test_abort_error_and_loop_cap(self):
        for status in ['aborted','error']:
            self.event['status']=status;self.assertEqual({},self.call())
        self.event['status']='completed';self.event['loop_count']=20
        self.assertEqual({},self.call())
    def test_gate_owner_and_worker_stop(self):
        for key,value in [('pending_gate',{'id':'G5'}),('active_owner','cursor:someone-else'),('status','blocked')]:
            old=self.workflow[key];self.workflow[key]=value;self.save();self.assertEqual({},self.call());self.workflow[key]=old
        self.run['active_workers']=['worker'];self.save();self.assertEqual({},self.call())
    def test_budget_computer_use_and_dependency_stop(self):
        for key,value in [('requires_computer_use',True),('dependencies_satisfied',False),('budget_required',{'sql':1})]:
            old=self.run['next_task'][key];self.run['next_task'][key]=value;self.save();self.assertEqual({},self.call());self.run['next_task'][key]=old
    def test_tampered_evidence_and_stale_checkpoint_stop(self):
        (self.local/'proof.md').write_text('changed');self.assertEqual({},self.call())
        self.run['last_progress']['sha256']=self.mod.digest(self.local/'proof.md');self.run['checkpoint_revision']=9;self.save();self.assertEqual({},self.call())
    def test_same_progress_cannot_trigger_another_task(self):
        self.call();self.run['next_task']['id']='review-2';self.save();self.assertEqual({},self.call())
    def test_new_progress_can_continue(self):
        self.call();self.workflow['revision']=11;self.run['checkpoint_revision']=11;self.run['last_progress']['checkpoint_revision']=11
        (self.local/'proof.md').write_text('New evidence');self.run['last_progress']['sha256']=self.mod.digest(self.local/'proof.md');self.run['next_task']['id']='review-2';self.save()
        self.assertIn('followup_message',self.call())
    def test_bad_json_and_external_path_stop(self):
        self.run['next_task']['instruction_ref']='../../outside';self.save();self.assertEqual({},self.call())
        (self.local/'workflow.json').write_text('{');self.assertEqual({},self.call())
    def test_wrong_workspace_or_conversation_stop(self):
        self.event['workspace_roots']=[];self.assertEqual({},self.call())
        self.event['workspace_roots']=[str(self.root)];self.event['conversation_id']='other';self.assertEqual({},self.call())

class ScopedBudgetTests(HookTestBase):
    """Executable service work must be admitted by real scope and real budget."""
    def setUp(self):
        super().setUp()
        (self.local/'ledger.json').write_text(json.dumps({'consumed_total':36}))
        self.workflow['approvals']=[{'id':'APP-SERVICES','status':'approved','expires_at':None,'superseded_by':None}]
        self.workflow['budget_ledger']={
            'sql':{'used':36,'cap':60,'target':'staging-ref','ledger_ref':'ledger.json',
                   'authority':'APP-SERVICES'},
            'local_checks':{'used':6,'cap':6,'authority':'APP-SERVICES'},
            'aggregate_checks':{'used':2,'cap':2,'authority':'APP-SERVICES'},
            'sentry':{'used':2,'cap':2,'authority':'APP-SERVICES'}}
        self.workflow['budget_allocations']=[{'id':'ALLOC-1','resource':'sql',
            'authority_id':'APP-SERVICES','status':'open','remaining':24}]
        self.workflow['native_recovery_paused']=True
        self.run['next_task']={'id':'sql-1','kind':'service_sql','status':'ready',
            'dependencies_satisfied':True,'requires_computer_use':False,
            'requires_native':False,'allocation_id':'ALLOC-1',
            'budget_required':{'sql':12},'instruction_ref':'proof.md',
            'authority_verified':True,'authority_id':'APP-SERVICES',
            'scope_ref':'proof.md','target_env':'staging','target_ref':'staging-ref'}
        self.save()

    def test_sql_within_remaining_budget_is_admitted(self):
        message=self.call()['followup_message']
        self.assertIn('sql=12',message)
        self.assertIn('do not send Sentry events',message)

    def test_request_beyond_remaining_budget_stops(self):
        self.run['next_task']['budget_required']={'sql':25};self.save()
        self.assertEqual({},self.call())
        self.run['next_task']['budget_required']={'sql':24};self.save()
        self.assertIn('followup_message',self.call())

    def test_exhausted_allowances_stay_blocked(self):
        for resource in ['local_checks','aggregate_checks','sentry']:
            self.run['next_task']['budget_required']={resource:1};self.save()
            self.assertEqual({},self.call(),f'{resource} is exhausted and must stop')

    def test_ledger_drift_or_missing_ledger_stops(self):
        (self.local/'ledger.json').write_text(json.dumps({'consumed_total':30}))
        self.assertEqual({},self.call())
        (self.local/'ledger.json').write_text(json.dumps({'consumed_total':36}))
        del self.workflow['budget_ledger'];self.save()
        self.assertEqual({},self.call())

    def test_wrong_target_or_production_stops(self):
        for key,value in [('target_ref','other-ref'),('target_env','production'),('target_env','unknown')]:
            old=self.run['next_task'][key];self.run['next_task'][key]=value;self.save()
            self.assertEqual({},self.call());self.run['next_task'][key]=old

    def test_expired_superseded_or_unapproved_scope_stops(self):
        for patch in [{'expires_at':'2020-01-01T00:00:00Z'},{'superseded_by':'APP-NEWER'},
                      {'status':'exhausted'},{'status':'expired'}]:
            self.workflow['approvals']=[dict({'id':'APP-SERVICES','status':'approved',
                'expires_at':None,'superseded_by':None},**patch)];self.save()
            self.assertEqual({},self.call(),f'{patch} must stop')

    def test_unexpired_future_scope_is_admitted(self):
        self.workflow['approvals']=[{'id':'APP-SERVICES','status':'approved',
            'expires_at':'2099-12-31T23:59:59Z','superseded_by':None}];self.save()
        self.assertIn('followup_message',self.call())

    def test_authority_must_be_verified_and_exist(self):
        for key,value in [('authority_verified',False),('authority_id','APP-MISSING')]:
            old=self.run['next_task'][key];self.run['next_task'][key]=value;self.save()
            self.assertEqual({},self.call());self.run['next_task'][key]=old

    def test_kind_and_spend_must_agree(self):
        self.run['next_task']['budget_required']={'sql':0};self.save()
        self.assertEqual({},self.call(),'executable kind declaring no spend is malformed')
        self.run['next_task'].update(kind='read_only_review',budget_required={'sql':1});self.save()
        self.assertEqual({},self.call(),'zero-budget kind may not spend')

    def test_unknown_resource_or_bad_value_stops(self):
        for budget in [{'network':1},{'sql':'12'},{'sql':-1},{'sql':1.0},'sql',None]:
            self.run['next_task']['budget_required']=budget;self.save()
            self.assertEqual({},self.call(),f'{budget} must stop')

    def test_native_work_blocked_while_paused(self):
        self.run['next_task']['requires_native']=True;self.save()
        self.assertEqual({},self.call())
        self.workflow['native_recovery_paused']=False;self.save()
        self.assertIn('followup_message',self.call())

    def test_computer_use_still_never_admitted(self):
        self.run['next_task']['requires_computer_use']=True;self.save()
        self.assertEqual({},self.call())

    def test_missing_scope_reference_stops(self):
        self.run['next_task']['scope_ref']='absent.md';self.save()
        self.assertEqual({},self.call())

    def test_cited_approval_must_authorise_that_resource(self):
        """RV-02: status and expiry alone must not admit an unrelated approval."""
        self.workflow['approvals'].append({'id':'APP-UNRELATED','status':'approved',
            'expires_at':None,'superseded_by':None})
        self.run['next_task'].update(authority_id='APP-UNRELATED')
        self.workflow['budget_allocations']=[{'id':'ALLOC-1','resource':'sql',
            'authority_id':'APP-UNRELATED','status':'open','remaining':24}]
        self.save()
        self.assertEqual({},self.call(),'approval not named for this resource must stop')

    def test_finite_allocation_required(self):
        """RV-04: remaining cap is a ceiling, not an assignment."""
        del self.workflow['budget_allocations'];self.save()
        self.assertEqual({},self.call(),'no allocation list must stop')
        for patch in [{'status':'closed'},{'resource':'sentry'},
                      {'authority_id':'APP-OTHER'},{'remaining':11},{'remaining':'24'}]:
            self.workflow['budget_allocations']=[dict({'id':'ALLOC-1','resource':'sql',
                'authority_id':'APP-SERVICES','status':'open','remaining':24},**patch)]
            self.save()
            self.assertEqual({},self.call(),f'{patch} must stop')
        self.run['next_task']['allocation_id']='ALLOC-ABSENT'
        self.workflow['budget_allocations']=[{'id':'ALLOC-1','resource':'sql',
            'authority_id':'APP-SERVICES','status':'open','remaining':24}];self.save()
        self.assertEqual({},self.call(),'unknown allocation id must stop')

    def test_coordinator_allocation_from_remaining_cap(self):
        """Remaining 21 is a ceiling; a finite open slice is what admits spend."""
        self.workflow['budget_ledger']['sql'].update(used=39, cap=60)
        (self.local/'ledger.json').write_text(json.dumps({'consumed_total':39}))
        self.workflow['budget_allocations']=[{'id':'ALLOC-1','resource':'sql',
            'authority_id':'APP-SERVICES','status':'open','remaining':3}]
        self.run['next_task']['budget_required']={'sql':4};self.save()
        self.assertEqual({},self.call(),'spend beyond the open slice must stop')
        self.run['next_task']['budget_required']={'sql':1};self.save()
        self.assertIn('followup_message',self.call())

    def test_omitted_native_flag_cannot_bypass_pause(self):
        """RV-03: an absent flag must not skip the founder pause."""
        del self.run['next_task']['requires_native'];self.save()
        self.assertEqual({},self.call())
        self.run['next_task']['requires_native']=None;self.save()
        self.assertEqual({},self.call())
        self.run['next_task']['requires_native']=False;self.save()
        self.assertIn('followup_message',self.call())

class RealApprovalsTests(HookTestBase):
    """Exercise the ACTUAL approvals array, not a synthetic placeholder."""
    REAL = Path('/Volumes/HIKSEMI/Developer/claudeFutureSelfApp/.future-self/local/workflow.json')

    def setUp(self):
        super().setUp()
        if not self.REAL.exists():
            self.skipTest('canonical workflow.json unavailable')
        real=json.loads(self.REAL.read_text())
        self.workflow['approvals']=real['approvals']
        self.workflow['budget_ledger']={'sql':{'used':36,'cap':60,
            'target':'bqigczxgdpebnylgrffz','authority':'APP-S4-SERVICES-001'}}
        self.workflow['budget_allocations']=[{'id':'ALLOC-DK','resource':'sql',
            'authority_id':'APP-S4-SERVICES-001','status':'open','remaining':14}]
        self.workflow['native_recovery_paused']=True
        self.run['next_task']={'id':'real-sql','kind':'service_sql','status':'ready',
            'dependencies_satisfied':True,'requires_computer_use':False,
            'requires_native':False,'allocation_id':'ALLOC-DK',
            'budget_required':{'sql':12},'instruction_ref':'proof.md',
            'authority_verified':True,'authority_id':'APP-S4-SERVICES-001',
            'scope_ref':'proof.md','target_env':'staging',
            'target_ref':'bqigczxgdpebnylgrffz'}
        self.save()

    def test_unrelated_real_approvals_are_refused_for_sql(self):
        for approval_id in ['APP-S1-001','APP-S3-WEB-001','APP-S3-MOTION-C-001',
                            'APP-G2-001','APP-AUTONOMY-003','APP-G5-SENTRY-001',
                            'APP-S3-BUILD-001','APP-MANUAL-001']:
            self.run['next_task']['authority_id']=approval_id
            self.workflow['budget_allocations']=[{'id':'ALLOC-DK','resource':'sql',
                'authority_id':approval_id,'status':'open','remaining':14}]
            self.save()
            self.assertEqual({},self.call(),f'{approval_id} must not authorise SQL')

    def test_correct_real_approval_with_allocation_is_admitted(self):
        self.assertIn('followup_message',self.call())

    def test_real_approval_without_allocation_is_refused(self):
        self.workflow['budget_allocations']=[];self.save()
        self.assertEqual({},self.call())

class OvernightGrantTests(HookTestBase):
    """APP-S5-OVERNIGHT-001: additive remaining, recovery floor, deadline, follow-up cap."""
    def setUp(self):
        super().setUp()
        (self.local/'ledger.json').write_text(json.dumps({'consumed_total':42}))
        self.workflow['approvals']=[{'id':'APP-SERVICES','status':'approved','expires_at':None,'superseded_by':None}]
        self.workflow['overnight_authorization']={
            'id':'APP-S5-OVERNIGHT-001','additional_followups':40,
            'deadline':'2099-12-31T23:59:59+00:00'}
        self.workflow['budget_ledger']={
            'sql':{'used':42,'cap':120,'target':'staging-ref','ledger_ref':'ledger.json',
                   'authority':'APP-SERVICES','recovery_floor':10,'recovery_allocation_id':'ALLOC-REC'},
            'local_checks':{'used':6,'cap':46,'authority':'APP-SERVICES'},
            'aggregate_checks':{'used':2,'cap':22,'authority':'APP-SERVICES'},
            'sentry':{'used':2,'cap':2,'authority':'APP-SERVICES'}}
        self.workflow['budget_allocations']=[
            {'id':'ALLOC-1','resource':'sql','authority_id':'APP-SERVICES','status':'open','remaining':20},
            {'id':'ALLOC-REC','resource':'sql','authority_id':'APP-SERVICES','status':'open','remaining':10},
            {'id':'ALLOC-LOCAL','resource':'local_checks','authority_id':'APP-SERVICES','status':'open','remaining':40},
        ]
        self.workflow['native_recovery_paused']=True
        self.run['next_task']={'id':'sql-1','kind':'service_sql','status':'ready',
            'dependencies_satisfied':True,'requires_computer_use':False,
            'requires_native':False,'allocation_id':'ALLOC-1',
            'budget_required':{'sql':20},'instruction_ref':'proof.md',
            'authority_verified':True,'authority_id':'APP-SERVICES',
            'scope_ref':'proof.md','target_env':'staging','target_ref':'staging-ref'}
        self.save()

    def test_expired_overnight_deadline_stops(self):
        self.workflow['overnight_authorization']['deadline']='2020-01-01T00:00:00Z'
        self.save()
        self.assertEqual({},self.call())

    def test_overnight_followup_cap_is_additional_40(self):
        self.event['loop_count']=20
        self.assertIn('followup_message',self.call())
        self.event['loop_count']=40
        self.run['next_task']['id']='sql-2'
        (self.local/'proof.md').write_text('later')
        self.run['last_progress']['sha256']=self.mod.digest(self.local/'proof.md')
        self.workflow['revision']=11
        self.run['checkpoint_revision']=11
        self.run['last_progress']['checkpoint_revision']=11
        self.save()
        self.assertEqual({},self.call())

    def test_recovery_floor_blocks_non_recovery_sql(self):
        # used 42, cap 120, floor 10 => non-recovery may spend at most 68
        self.workflow['budget_allocations'][0]['remaining']=70
        self.run['next_task']['budget_required']={'sql':69}
        self.save()
        self.assertEqual({},self.call())
        self.run['next_task']['budget_required']={'sql':20}
        self.save()
        self.assertIn('followup_message',self.call())

    def test_recovery_allocation_may_spend_the_floor(self):
        self.run['next_task'].update(allocation_id='ALLOC-REC', budget_required={'sql':10})
        self.save()
        self.assertIn('followup_message',self.call())

    def test_local_checks_admitted_after_overnight_grant(self):
        self.run['next_task'].update(kind='executable_check', allocation_id='ALLOC-LOCAL',
            budget_required={'local_checks':1}, authority_id='APP-SERVICES')
        self.save()
        self.assertIn('followup_message',self.call())

    def test_sentry_stays_blocked_with_zero_remaining(self):
        self.run['next_task']['budget_required']={'sentry':1}
        self.workflow['budget_allocations']=[{'id':'ALLOC-1','resource':'sentry',
            'authority_id':'APP-SERVICES','status':'open','remaining':1}]
        self.save()
        self.assertEqual({},self.call())

if __name__=='__main__':unittest.main()
