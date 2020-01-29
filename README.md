Shared state with persistence, notification, and history
========================================================

This contributes [Node-RED](http://nodered.org/) nodes for defining logical state,
sharing that state across nodes, tracking history, and triggering flows 
based on state changes.

## Logical State

State associated with a physical device is considered physical state. Logical state 
are computations such as "Person Is In The Room", usually a combination of physical
state and other logical state.

Logical state helps with system understanding. "Person Is In The Room" may be the
combination of many physical and logical states, and can be used for example, 
in determining room HVAC profile.

These nodes provide a place to represent that logical state, share it with other
nodes, persist it, keep history, and provide state change triggers for flows.

## Setting State

State is set by sending the value to the setState node in the _msg.payload_. After saving
to disk, the new state is made available to all mechanisms described in the _Getting State_
section below.

## Getting State

Once state is set and persisted using the _Setting State_ section above, the new state is
made available with the getState node and in the global state context as described below.

### The getState Node

The getState node can be dropped onto any flow to trigger a message on initialization, and on
state change. The _msg.topic_ contains the state name, the _msg.payload_ contains the state value,
and the _msg.state_ object contains an object with the following structure 
`{value:value, prev:prev_value, timestamp:Date, history:history}`, where the _history_ object
is an array of `{val:value, ts=timestamp Date}` objects.

### Shared State with Global Context

The global context object contains a _state_ element - an object containg the current state 
and history for all state elements in all flows. This is available for all function and
custom nodes needing to use logical state to perform their task. 

An example using the function node:

```
let isRoomOccupied = global.get("state").isRoomOccupied.value;
```

Another useful way to obtain shared state is to add it to a message using the _Change_ node:

![](https://raw.githubusercontent.com/lorenwest/node-red-contrib-state/master/img/ChangeNode.png)

## Binary State Name/Value Convention

While these nodes can store any type of data, they're designed to work well when the
state _name_ is a binary statement where the value of _1_ represents IN that state,
the value of _0_ represents NOT IN that state, and a number between 0 and 1 represents 
a confidence range.

States following this convention define the value as:

  * 1.00 - IN this state
  * 0.66 - Thought to be IN this state, but un-verified
  * 0.50 - Unsure, more IN than not
  * 0.49 - Unsure, more NOT than in
  * 0.33 - Thought to be NOT in this state, but un-verified
  * 0.00 - NOT in this state

This convention helps with consistency, and assists derived states in computing their confidence.

A consistent pattern starts with setting a state in either 0.66 or 0.33 until it's 
externally validated, either increasing or decreasing the value based on 
the number of external validations, and the confidence in those validations.

If states decay over time, they can increase to 0.65 or decrease to 0.34 
but generally don't expand outside of that range without external validation.

Ranges

  * 0 / 1 - Confidence not considered.
  * 0.66 / 0.33 - Initial unverified state
  * Verified (0.67 - .99, 0.32 - 0.01) - Externally verified, value specifies confidence in external validation
  * Unsure (0.34 - 0.65) - Unsure about the value - in this range due to time decay or failed validation

Accuracy is undefined, and rounded to 2 digits for documentation purposes only.

## Installation

1. Open the Node-RED dashboard
1. Select the _Manage Pallete_ menu item
1. Select the _Install_ tab
1. Enter `node-red-contrib-state` into the search
1. Press the `install` button for this module

## License

MIT License. See [LICENSE.txt](https://raw.githubusercontent.com/lorenwest/node-red-contrib-state/master/LICENSE.txt) for more details.
