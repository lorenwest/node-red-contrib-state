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
 * Node-Red Node: setState
 * Node-Red Package: node-red-contrib-state
 */
const EventEmitter = require('events');
const sharedGets = {};

const BASE_TOPIC = 'state/';
const VALUE_BASE = BASE_TOPIC + 'value/';
const CURRENT_BASE = BASE_TOPIC + 'current/';
const HISTORY_BASE = BASE_TOPIC + 'history/';

let RED;
const getState = module.exports = function(red) {
  RED = red;
  RED.nodes.registerType("mc-utils:getState", getStateNode);
}

// The Node-RED node for getState
class getStateNode {

  constructor(config) {
    var node = this;
    RED.nodes.createNode(node, config);
    node.config = config;
    node.sharedGet = getState.getSharedGet(config.stateName, config.brokerId);
    node.sharedGet.on('broker-connected', function() {
      node.status({text: node.sharedGet.value});
    });
    node.sharedGet.on('broker-disconnected', function() {
      node.status({fill:"red", shape:"dot", text:'disconnected'});
    });
    node.sharedGet.on('broker-connecting', function() {
      node.status({fill:"yellow", shape:"ring", text:'reconnecting'});
    });
    node.sharedGet.on('update', function(current) {
      node.status({text: current.value});
    });
    node.status({text: node.sharedGet.value});
    node.on('close', function(done) {node.sharedGet.deregister(done)});
  }

}

// This is an object that maintains a link with the broker for this state
// and maintains the state in the Node-RED global context store.
//
// mqtt topics:
//   state/value/STATE_NAME
//   state/current/STATE_NAME
//   state/history/STATE_NAME
//
// Node-RED global context store (synchronous):
//   var value = global.get('persistent-state').STATE_NAME;
//     (raw value)
//   var current = global.get('state-current').STATE_NAME;
//     {value:value, prev:prev_value, stamp=unix_timestamp, confidence:0-1}
//   var history = global.get('state-history').STATE_NAME;
//     [{v:value, t=timeString, c:0-1}, ...]
//
// Methods:
//   update(value, confidence, historyUnits (items,days,hours), historyNum) - Update state to the new value
//   getBroker() - Get the internal mqtt broker 
//
// Events:
//   broker-connected - The broker has just connected
//   broker-connecting - The broker is reconnecting
//   broker-disconnected - The broker has just disconnected
//   update - The value or confidence has updated.  event Obj: {value, prev, stamp, confidence}
//   history - Value history has updated. event Obj: History array
//   
class SharedGet extends EventEmitter {

  constructor(stateName, brokerId) {
    super();
    let node = this;
    node.uniqueId = stateName + ':' + brokerId;
    node.stateName = stateName;
    node.brokerId = brokerId;
    node.numClients = 0;

    node.value = "";
    node.current = {};
    node.history = [];

    // Build a fake node that emits events when broker updates status
    node.fakeNode = {
      id: node.uniqueId,
      status: function(msg) {
        let statusText = 'node-red:common.status.'
        if (msg.text.indexOf(statusText) == 0) {
          node.emit('broker-' + msg.text.substr(statusText.length));
        }
      }
    }

    node.broker = RED.nodes.getNode(node.brokerId);
    if (!node.broker) {
      throw new Error('No state store');
    }
    node.broker.register(node.fakeNode);

    // Subscribe to changes in this topic
    node.broker.subscribe(CURRENT_BASE + '/' + stateName, 0, function(topic, payload, packet) {
      // Retain previous current during event handling
      let current = JSON.parse(payload);
      emit('update', current);
      node.value = current.value;
      node.current = current;
    });
    node.broker.subscribe(HISTORY_BASE + '/' + stateName, 0, function(topic, payload, packet) {
      // No need to have 2 copies of history during event handling
      node.history = JSON.parse(payload);
      emit('history', history);
    });

  }

  // Give the broker a chance to shut down if nobody is using this object
  deregister(done) {
    let node = this;
    if (--node.numClients == 0) {
      delete global.sharedGets[node.uniqueId];
      node.broker.deregister(node.fakeNode, done);
    }
    else {
      done();
    }
  }

}


// Retrieve the singleton shared get object for this state/broker name
getState.getSharedGet = function(stateName, brokerId) {
  let sharedGets = global.sharedGets;
  let uniqueId = stateName + ':' + brokerId;
  if (!sharedGets) {
    sharedGets = global.sharedGets = {};
  }
  let sharedGet = sharedGets[uniqueId];
  if (!sharedGet) {
    sharedGet = sharedGets[uniqueId] = new SharedGet(stateName, brokerId);
  }
  sharedGet.numClients++;
  return sharedGet;
}
