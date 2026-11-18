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
 * Get State
 * Node-Red Node: getState
 * Node-Red Package: get-shared-state
 */

let RED;
const convertUnits = require('convert-units');
const getState = module.exports = function(red) {
  RED = red;
  RED.nodes.registerType("get-shared-state", getStateNode);
}

// The Node-RED node for getState
class getStateNode {

  constructor(config) {
    var node = this;
    RED.nodes.createNode(node, config);
    node.config = config;
    node.sharedState = RED.nodes.getNode(node.config.state);
    if (!node.sharedState) {
      node.error('No shared state for: ' + node.state);
      return;
    }

    // Set initial value if shared state is already initialized
    if (node.sharedState.initialized) {
      process.nextTick(function() {
        node.update(true);
      });
    }

    // Set state value onto the node status
    node.onInit = function() { node.update(true); };
    node.onChange = function() { node.update(false); };
    node.sharedState.on('init', node.onInit);
    node.sharedState.on('change', node.onChange);

    // Remove listeners when this node is stopped (deploy/restart).
    // The shared-state config node survives partial deploys, so without
    // this every redeploy leaves a stale listener behind that keeps sending.
    node.on('close', function(removed, done) {
      node.sharedState.removeListener('init', node.onInit);
      node.sharedState.removeListener('change', node.onChange);
      if (typeof removed === 'function') { removed(); }
      else if (typeof done === 'function') { done(); }
    });
  }
  update(onInit) {
    let node = this;
    let val = node.sharedState.value;
    let statusFnName = "status_" + node.sharedState.config.dataType;
    if (node[statusFnName]) {
      val = node[statusFnName](val);
    }
    val = '' + val;
    if (val.length > 20) {
      val = val.substr(0,20) + '...';
    }
    node.status({fill:"green", shape:"dot", text:val});
  // @colincoder  Changes to handle more flexibile triggering options
    if (onInit) {
		if (!node.config.triggerOnInit) 
			return;
	} else {
		if (!node.config.triggerOnChange) 
			return;
	}
  // @colincoder  End of changes to handle more flexible triggering options
    node.send({
      topic:node.sharedState.name,
      state: node.sharedState.exposedState(),
	// @colincoder  Make sure that when Objects that a clone is created
      payload:JSON.parse(JSON.stringify(node.sharedState.value)),
    });
  }

  status_obj(val) {
    try {
      return JSON.stringify(val);
    } catch(e) {}
    return val;
  }
  status_num(val) {
    let node = this;
    let unit = node.sharedState.config.unit;
    if (unit) {
      return val + ' ' + convertUnits().describe(unit)[val == 1 ? 'singular' : 'plural'];
    }
    return val;
  }
}

module.exports.getStateNode = getStateNode;
