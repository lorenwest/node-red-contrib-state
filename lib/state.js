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
// Synchronous file operations for initialization
const readFileSync = fs.readFileSync
const existsSync = fs.existsSync
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
    node.globalContext = node.context().global;
    node.id = config.id;
    node.name = config.name;
    node.config = config;

    node.initialized = false;
    node.value = "";
    node.prev = "";
    node.timestamp = 0;
    node.history = [];

    let stateDir = node.globalContext.get('sharedStateDir') || './shared-state';
    try { mkdirp(stateDir); }
    catch (e) {
      node.error('Unable to create storage directory: ' + stateDir);
      node.error(e);
    }
    node.stateFile = stateDir + '/' + node.name;

    // Initialize global context container
    if (node.globalContext.keys().indexOf('state') < 0) {
      node.globalContext.set('state', {});
    }
    node.globalState = node.globalContext.get('state');

    // Priority 1: Initialize from the filesystem (reliable persistent storage)
    // This should be the primary source of truth after Node-RED restart
    // Use synchronous read for initialization to ensure it completes before constructor returns
    node.initFromFSSync();
    
    // If loaded from filesystem, update global context with the loaded state
    // This ensures global context is in sync with filesystem (the source of truth)
    if (node.initialized) {
      node.updateGlobalContext();
    } else {
      // Priority 2: If filesystem load failed, try global context (runtime cache)
      // This is only a fallback for runtime state sharing during the same session
      let thisState = node.globalState[node.name];
      if (thisState) {
        node.initFromObj(thisState);
      } else {
        // No state found anywhere, initialize with defaults
        // Set pre-initialized global state (for runtime sharing)
        node.updateGlobalContext();
      }
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

  // Produce a deep copy of state for global context storage
  // This ensures proper serialization and avoids reference issues
  exposedStateDeepCopy() {
    let node = this;
    return JSON.parse(JSON.stringify({
      value: node.value,
      prev: node.prev,
      timestamp: node.timestamp,
      history: node.history,
      config: node.config,
    }));
  }

  // Update global context for runtime sharing only (not persisted to global.json)
  // This keeps state in memory for fast access during the same Node-RED session
  // File system is the only persistent storage to avoid duplicate data
  updateGlobalContext() {
    let node = this;
    // Update the state object in memory only
    // We don't call set() here to avoid persisting to global.json
    // This keeps global.json clean and avoids duplicate storage
    // File system is the single source of truth for persistence
    node.globalState[node.name] = node.exposedStateDeepCopy();
    // Note: Direct modification of objects from get() doesn't trigger persistence
    // This is intentional - we only want file system persistence
  }

  // Update the state
  async update(newState, fromMsg) {
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
      
      // Update history if historyCount > 0
      if (node.config.historyCount > 0) {
        node.history.splice(0,0,{val:node.value, ts:node.timestamp});
        node.trimHistory();
      }
      
      // Save to filesystem based on saveInterval
      // If saveInterval is 0, always save immediately
      // If saveInterval > 0, only save if enough time has passed since last save
      // This ensures state persistence while allowing performance optimization
      let saveInterval = parseInt(node.config.saveInterval, 10) || 0;
      let shouldSave = false;
      
      if (saveInterval === 0) {
        // Always save if saveInterval is 0
        shouldSave = true;
      } else if (prev_ts === 0) {
        // Always save on first update (no previous timestamp)
        shouldSave = true;
      } else {
        // Save if saveInterval has passed
        shouldSave = (node.timestamp - prev_ts >= saveInterval);
      }
      
      if (shouldSave) {
        await writeFile(node.stateFile, JSON.stringify(node.exposedState()));
      }
      
      // Update global context for runtime sharing only (not persisted to global.json)
      // File system is the single source of truth for persistence
      node.updateGlobalContext();
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
    // Use deep copy to avoid reference issues when loading from global context
    let externalCopy = JSON.parse(JSON.stringify(external));
    node.value = externalCopy.value;
    node.prev = externalCopy.prev;
    node.timestamp = externalCopy.timestamp;
    node.history = externalCopy.history || [];
    node.updateGlobalContext();
    node.emit('init', node.exposedState());
    node.initialized = true;
  }

  // Initialize state from the filesystem (synchronous version for constructor)
  initFromFSSync() {
    let node = this;
    try {
      if (existsSync(node.stateFile)) {
        let file = readFileSync(node.stateFile, 'utf8');
        node.initFromObj(JSON.parse(file));
      }
    } catch (e) {
      // State file doesn't exist or can't be read
      // This is normal for first-time initialization
      return;
    }
  }

  // Initialize state from the filesystem (async version for runtime use)
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
