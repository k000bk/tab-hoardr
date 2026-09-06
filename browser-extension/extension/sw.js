// Chrome's MV3 background is a service worker and takes one file. Firefox ignores
// this and loads background.scripts instead. Same code, both browsers.
importScripts('compat.js', 'lib.js', 'background.js');
