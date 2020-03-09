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

let RED;
const state = module.exports = function(red) {
  RED = red;
  RED.nodes.registerType("shared-state", stateNode);
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
    };
  }

  // Update the state
  async update(newState) {
    let node = this;
    if (newState === node.value) {return}
    node.prev = node.value;
    node.value = newState;
    node.timestamp = Date.now();
    node.initialized = true;
    try {
      if (node.history.length > 0) {
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
