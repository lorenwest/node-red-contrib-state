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
    node.sharedState.on('init', function() {
      node.update(true);
    });
    node.sharedState.on('change', function() {
      node.update(false);
    });
  }

  update(onInit) {
    let node = this;
    node.status({fill:"green", shape:"dot", text:'' + node.sharedState.value});
    if (onInit && !node.config.triggerOnInit) return;
    node.send({
      topic:node.sharedState.name,
      state: node.sharedState.exposedState(),
      payload:node.sharedState.value,
    });
  }

}
