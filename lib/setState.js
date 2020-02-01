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
 * Set State
 * Node-Red Node: setState
 * Node-Red Package: shared-state
 */

let RED;
const setState = module.exports = function(red) {
  RED = red;
  RED.nodes.registerType("set-shared-state", setStateNode);
}

// The Node-RED node for setState
class setStateNode {

  constructor(config) {
    var node = this;
    RED.nodes.createNode(node, config);
    node.config = config;
    node.sharedState = RED.nodes.getNode(node.config.state);
    if (!node.sharedState) {
      node.error('No shared state for: ' + node.state);
      return;
    }

    // Set initial value after a short pause
    setTimeout(function() {
      if (node.sharedState.initialized) {
        node.setStatus();
      }
    }, 10);

    // Process input
    node.on('input', function(msg) {
      node.sharedState.update(msg.payload);
    });

    // Set state value onto the node status
    node.status({text:node.sharedState.value});
    node.sharedState.on('init', node.setStatus.bind(this));
    node.sharedState.on('change', node.setStatus.bind(this));

  }

  setStatus() {
    let node = this;
    node.status({fill:"green", shape:"dot", text:'' + node.sharedState.value});
  }

}
