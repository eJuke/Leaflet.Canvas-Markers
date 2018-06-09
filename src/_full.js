var rbush = require("rbush");
var factory = require("./plugin/leaflet.canvas-markers");

window.L.CanvasIconLayer = factory(L);
window.rbush = rbush;
