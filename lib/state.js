/**
* The MIT License
* 
* Copyright (c) 2020, Loren West and other contributors
* 
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to
* deal in the Software without restriction, including without limitation the
* rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
* sell copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in
* all copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
* FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
* IN THE SOFTWARE.
**/

/**
 * State
 * Node-Red Config Node: state
 * Node-Red Package: shared-state
 *
 * Attributes:
 *   initialized  - Don't rely on state until after the `change` event
 *   value        - Current state value
 *   prev         - Previous state value
 *   timestamp    - Date object of the last state change
 *   history      - Array of `{val:value, ts=timestamp Date}` objects.
 *
 * Methods:
 *   update(newState) - Change the state value. If this is different from the 
 *                      current state it will be persisted and a change event emitted.
 *
 * Events:
 *   init   - The state is being initialized on program load.
 *   change - State has changed. This object is passed with the event.
 */
const fs = require('fs')
const { promisify } = require('util')
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const mkdirp = require('mkdirp');
const isValidVarName = require('is-valid-var-name');
const convertUnits = require('convert-units');
const _ = require('lodash');

let RED;
const state = module.exports = function(red) {
  RED = red;
  RED.nodes.registerType("shared-state", stateNode);
  stateNode.registerEndpoints(RED);
}

// The Node-RED node for state
class stateNode {

  constructor(config) {
    let node = this;
    RED.nodes.createNode(node, config);
    let globalContext = node.context().global;
    node.id = config.id;
    node.name = config.name;
    node.config = config;

    node.initialized = false;
    node.value = "";
    node.prev = "";
    node.timestamp = 0;
    node.history = [];

    let stateDir = globalContext.get('sharedStateDir') || './shared-state';
    try { mkdirp(stateDir); }
    catch (e) {
      node.error('Unable to create storage directory: ' + stateDir);
      node.error(e);
    }
    node.stateFile = stateDir + '/' + node.name;

    // Initialize from global context if available
    if (globalContext.keys().indexOf('state') < 0) {
      globalContext.set('state', {});
    }
    node.globalState = globalContext.get('state');
    let thisState = node.globalState[node.name];
    if (thisState) {
      node.initFromObj(thisState);
    }

    // Initialize from the filesystem on Node-RED reboot
    if (!node.initialized) {
      node.initFromFS();
    }

    // Set pre-initialized global state
    if (!node.initialized) {
      node.globalState[node.name] = node.exposedState();
    }
  }

  // Produce an object to be shared as state
  exposedState() {
    let node = this;
    return {
      value: node.value,
      prev: node.prev,
      timestamp: node.timestamp,
      history: node.history,
      config: node.config,
    };
  }

  // Update the state
  async update(newState, fromMsg, topic) {
    let node = this;
    let typedNewState = node.getTypedValue(newState, fromMsg);
			// @colincoder Changes to deal with issues when the node type is Object
    let newvalstr = JSON.stringify(typedNewState);
    let currentvalstr = JSON.stringify(node.value);
    if (newvalstr == currentvalstr) { 
		return;
	}

	// With objects this makes prev and value share the same memory which 
	// makes the .prev value and .value value point to the same Object. 
	// So create new objects so that the comparison above detects an actual change.
	// This fix will work for non-objects too.
	//    node.prev = node.value;
	//    node.value = typedNewState;
    node.prev = JSON.parse(currentvalstr);
    node.value = JSON.parse(newvalstr);
			// @colincoder End of changes to deal with issues when the node type is Object
    node.timestamp = Date.now();
    node.initialized = true;
    try {
      var prev_ts = 0;
      if (node.history !== undefined &&
		  node.history[0] !== undefined &&
		  node.history[0].ts !== undefined)  // @colincoder Initially this is undefined so deal with it
		prev_ts = node.history[0].ts;
      if (node.config.historyCount > 0 && node.timestamp-prev_ts >= parseInt(node.config.saveInterval, 10)) {
        node.history.splice(0,0,{val:node.value, ts:node.timestamp});
        node.trimHistory();
        await writeFile(node.stateFile, JSON.stringify(node.exposedState()));
      }
      node.globalState[node.name] = node.exposedState();
      node.emit('change', node.exposedState());
    } 
    catch (e) {
      node.error('Error writing state file: ' + node.stateFile);
      node.error(e);
    }

  }

  // Perform simple data type conversions
  getTypedValue(newState, fromMsg) {
    let node = this;
    let fnName = "getTypedValue_" + node.config.dataType;
    let fromConfig = (fromMsg && fromMsg.state && fromMsg.state.config) ? fromMsg.state.config : {};
    if (!node[fnName]) {return newState}
    return node[fnName](newState, fromConfig);
  }

  getTypedValue_str(newState, fromConfig) {
    let node = this;
    let val = '' + newState;
    if (val[0] == '[' && val.match(/^\[object Object\].*/)) {
      try {
        return JSON.stringify(newState);
      } catch(e){};
    }
    return val;
  }

  getTypedValue_bool(newState, fromConfig) {
    let node = this;
    let boolType = node.config.boolType; // bool, num, str
    let boolStrTrue = node.config.boolStrTrue || 'on'; // On, Active, ...
    let boolStrFalse = node.config.boolStrFalse || 'off';  // Off, Inactive, ...

    // Convert newState to boolean if coming from another boolean state node
    if (fromConfig.dataType == 'bool' && fromConfig.boolType == 'str' && fromConfig.boolStrTrue) {
      newState = (newState == fromConfig.boolStrTrue);
    }

    // Assign to boolean if coming in as a number or number-like string
    if (Number(newState) + '' == (newState + '').trim()) {
      newState = Number(newState);
    }
    if ((typeof newState) === 'number') {
      newState = !!newState;
    }

    // Assign to boolean if coming in as a string
    if ((typeof newState) === 'string') {
      newState = newState.trim().toLowerCase();
      // Try the known string first
      if (boolType == 'str' && (newState == boolStrTrue.toLowerCase() || newState == boolStrFalse.toLowerCase())) {
        newState = (newState == boolStrTrue.toLowerCase());
      }
      // Process the only sane string conversions ("1" and "0" processed as numbers earlier)
      else if (newState == 'true' || newState == 'false') {
        newState = (newState == 'true');
      }
      // Fallback to regular javascript string->boolean mapping
      else {
        newState = !!newState;
      }
    }

    // Assign to correct boolean mapping
    if (boolType == 'str') {
      return (newState ? boolStrTrue : boolStrFalse);
    }
    else if (boolType == 'num') {
      return (newState ? 1 : 0);
    }
    return !!newState;
  }

  getTypedValue_num(newState, fromConfig) {
    let node = this;
    newState = parseFloat(newState); // Force a number
    if (isNaN(newState)) {
      return newState; // Fail miserably if source can't be made a number
    }

    // Convert units if coming from another numeric node
    if (node.config.unit && fromConfig.dataType == 'num' && fromConfig.unit) {
      try {
        newState = convertUnits(newState).from(fromConfig.unit).to(node.config.unit);
        newState = Number(newState.toFixed(10)); // Don't convert to extremely large precisions
      } catch(e){
        // Don't create a number if it can't be used.
        newState = NaN;
      }
    }

    // Round to precision
    if (node.config.precision) {
      newState = Number(newState.toFixed(node.config.precision));
    }

    // Apply min/max
    if (node.config.numMin && newState < node.config.numMin) {
      newState = node.config.numMin;
    }
    if (node.config.numMax && newState > node.config.numMax) {
      newState = node.config.numMax;
    }

    return newState;
  }

  getTypedValue_obj(newState, fromConfig) {
    let node = this;
    // Try JSON parsing a string
    if (typeof newState === 'string') {
      try {
        newState = JSON.parse(newState);
      } catch(e) {}
    }
    return newState;
  }

  // history[0] = current, history[1] = current - 1, history[2] = current - 2, ...
  trimHistory() {
    let node = this;
    let trimNum = node.history.length - node.config.historyCount;
    if (trimNum > 0) {
      node.history.splice(node.history.length - trimNum, trimNum);
    }
  }

  // Initialize from an external state object
  initFromObj(external) {
    let node = this;
    node.value = external.value,
    node.prev = external.prev,
    node.timestamp = external.timestamp,
    node.history = external.history,
    node.globalState[node.name] = node.exposedState();
    node.emit('init', node.exposedState());
    node.initialized = true;
  }

  // Initialize state from the filesystem
  async initFromFS() {
    let node = this;
    try {
      let file = await readFile(node.stateFile);
      node.initFromObj(JSON.parse(file));
    } catch (e) {
      // State file doesn't yet exist
      return;
    }
  }

}

// Register config support endpoints
stateNode.registerEndpoints = function(RED) {
  RED.httpAdmin.get('/shared-state/units', RED.auth.needsPermission('sharedstate.read'), function(req, response) {
    response.json(convertUnits().list());
  });
}
