const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const helper = require('node-red-node-test-helper');
const stateNode = require('../lib/state');
const getStateNode = require('../lib/getState');
const setStateNode = require('../lib/setState');

describe('shared state', function () {
  this.timeout(10000);
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-')); process.chdir(dir); });
  afterEach(async () => { await helper.unload(); fs.rmSync(dir, { recursive: true, force: true }); });

  const flow = [
    { id:'s', type:'shared-state', name:'licht', dataType:'bool', historyCount:0, saveInterval:'0', wires:[] },
    { id:'g', type:'get-shared-state', state:'s', triggerOnChange:true, wires:[['h']] },
    { id:'w', type:'set-shared-state', state:'s', wires:[[]] },
    { id:'h', type:'helper' },
  ];

  it('emits exactly one message per state change', async function () {
    await helper.load([stateNode, getStateNode, setStateNode], flow);
    let count = 0;
    helper.getNode('h').on('input', () => count++);
    await helper.getNode('s').update(true);
    await new Promise(r => setTimeout(r, 25));
    assert.equal(count, 1);
  });

  it('removes its listeners from the shared state when a get/set node is closed', async function () {
    await helper.load([stateNode, getStateNode, setStateNode], flow);
    const s = helper.getNode('s');
    assert.equal(s.listenerCount('change'), 2);
    assert.equal(s.listenerCount('init'), 2);
    await helper.getNode('g').close();
    await helper.getNode('w').close();
    assert.equal(s.listenerCount('change'), 0);
    assert.equal(s.listenerCount('init'), 0);
  });

  it('ignores a message with an undefined payload instead of crashing (#18)', async function () {
    const objFlow = [
      { id:'s', type:'shared-state', name:'obj', dataType:'obj', historyCount:2, saveInterval:'0', wires:[] },
      { id:'w', type:'set-shared-state', state:'s', wires:[[]] },
    ];
    await helper.load([stateNode, setStateNode], objFlow);
    const s = helper.getNode('s');
    await s.update({ a: 1 });
    const warnings = [];
    s.warn = (m) => warnings.push(m);

    // Same shape as the issue: a function node returned msg.payload as the msg
    helper.getNode('w').receive({ action: null, state_left: 'OFF' });
    await new Promise(r => setTimeout(r, 25));

    assert.deepEqual(s.value, { a: 1 });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /undefined/);
  });
});
