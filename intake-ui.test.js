import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('committing intake restores the captured session after show clears active intake',async()=>{
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const handler=html.split('\n').find(line=>line.startsWith("el('commit-intake').onclick="));
  assert.ok(handler,'production commit handler must exist');
  const button={},calls=[];
  let pending;
  const session={id:'fictional-session',revision:3,summary:{ready:true}};
  const context={activeIntake:session,el:id=>id==='intake-confirm'?{checked:true}:button,canLeave:()=>true,
    reportStatus:()=>{},run:fn=>{pending=fn();},
    api:async(path,method='GET')=>{calls.push([path,method]);return method==='POST'?{id:'fictional-session',intakeId:'fictional-session'}:{...session,caseId:'fictional-session'};},
    show:()=>{context.activeIntake=null;},showIntake:s=>{context.activeIntake=s;},list:async()=>{},intakeList:async()=>{},say:()=>{}};
  vm.runInNewContext(handler,context);
  button.onclick();await pending;
  assert.deepEqual(calls,[['/api/intakes/fictional-session/commit','POST'],['/api/intakes/fictional-session','GET']]);
  assert.equal(context.activeIntake.caseId,'fictional-session');
});
