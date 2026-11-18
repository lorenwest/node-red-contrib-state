const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const helper = require('node-red-node-test-helper');
const stateNode = require('../lib/state');
const setStateNode = require('../lib/setState');
const getStateNode = require('../lib/getState');

describe('shared state persistence', function () {
  this.timeout(10000);
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-')); process.chdir(dir); });
  afterEach(async () => { await helper.unload(); fs.rmSync(dir, { recursive: true, force: true }); });

  function flow(historyCount) {
    return [{ id:'s', type:'shared-state', name:'answer', dataType:'num', historyCount, saveInterval:'0', wires:[] }];
  }
  it('persists changes when historyCount is zero and reloads after restart', async function () {
    await helper.load(stateNode, flow(0));
    const node = helper.getNode('s');
    await node.update(42);
    const file = path.join(dir, 'shared-state', 'answer');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).value, 42);
    await helper.unload();
    await helper.load(stateNode, flow(0));
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(helper.getNode('s').value, 42);
  });

  it('leaves no temporary file after an atomic write', async function () {
    await helper.load(stateNode, flow(1));
    await helper.getNode('s').update(7);
    assert.equal(fs.existsSync(path.join(dir, 'shared-state', 'answer.tmp')), false);
  });

  it('removes its listeners from the shared state when a get/set node is closed', async function () {
    const f = [
      { id:'s', type:'shared-state', name:'licht', dataType:'bool', historyCount:0, saveInterval:'0', wires:[] },
      { id:'g', type:'get-shared-state', state:'s', triggerOnChange:true, wires:[[]] },
      { id:'w', type:'set-shared-state', state:'s', wires:[[]] },
    ];
    await helper.load([stateNode, getStateNode, setStateNode], f);
    const s = helper.getNode('s');
    assert.equal(s.listenerCount('change'), 2);
    assert.equal(s.listenerCount('init'), 2);
    await helper.getNode('g').close();
    await helper.getNode('w').close();
    assert.equal(s.listenerCount('change'), 0);
    assert.equal(s.listenerCount('init'), 0);
  });
});
