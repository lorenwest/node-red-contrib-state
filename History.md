1.6.2 - 11/13/2024
==================

  * Fixed state persistence issue: State values now correctly load from filesystem on Node-RED restart (@shangjianlou)
  * Fixed global.json persistence: Removed duplicate state storage in global.json to avoid data inconsistency (@shangjianlou)
  * Improved initialization order: Filesystem is now the primary source of truth, global context is runtime cache only (@shangjianlou)
  * Added deep copy mechanism for proper object serialization (@shangjianlou)
  * Fixed async initialization issue by using synchronous file read during constructor (@shangjianlou)
  
  Contributors: shangjianlou <shangjianlou@gmail.com>

1.6.1 - 01/09/2022
==================

  * Fixed an "undefined" when reading ps from history and there isn't any… @colincoder

1.6.0 - 01/08/2022
==================

  * Added object clone on set and compare @colincoder
  * Added ability to fire only once @colincoder

1.5.1 - 09/01/2020
==================

  * Fixed boolean change misfire under certain conditions
    (see https://github.com/lorenwest/node-red-contrib-state/issues/5)

1.5.0 - 05/20/2020
==================

  * Added state label
  * Added data types with inbound type conversion
  * Added tags for classification

1.4.2 - 03/31/2020
==================

  * Fixed a history/persist issue #3

1.4.1 - 03/22/2020
==================

  * Moved is-valid-var-name from to dependencies

1.4.0 - 03/08/2020
==================

  * Publish animated gif
  * Assure state names are valid JS variables

1.3.1 - 02/26/2020
==================

  * Better documentation for set state node

1.3.0 - 02/26/2020
==================

  * Provide output for SET nodes
  * Initialize global state so it's always available

1.2.1 - 02/21/2020
==================

  * Improved documentation

1.2.0 - 02/03/2020
==================

  * Changed get/set node categories to 'common' for node-red 1.0.

1.1.0 - 02/02/2020
==================

  * Don't save state if history set to 0


1.0.0 - 01/31/2020
==================

  * Initial publish
