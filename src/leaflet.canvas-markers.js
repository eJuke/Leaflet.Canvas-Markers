'use strict';

(function (factory, window) {
	// define an AMD module that relies on 'leaflet'
	if (typeof define === 'function' && define.amd) {
	define(['leaflet'], factory);

	// define a Common JS module that relies on 'leaflet'
	} else if (typeof exports === 'object') {
	module.exports = factory(require('leaflet'));
	}

	// attach your plugin to the global 'L' variable
	if (typeof window !== 'undefined' && window.L) {
		window.L.CanvasIconLayer = factory(L);
	}
}(function (L) {
	var CanvasIconLayer = (L.Layer ? L.Layer : L.Class).extend({
		//Add event listeners to initialized section.
		initialize: function (options) {
			L.setOptions(this, options);
			this._onClickListeners = [];
			this._onHoverListeners = [];
		},

		setOptions: function (options) {
			L.setOptions(this, options);
			if (this._canvas) {
				this._updateOptions();
			}
			return this.redraw();
		},

		redraw: function () {
			this._redraw(true);
		},

		//Multiple layers at a time for rBush performance
		addMarkers: function (markers) {
			var self = this;
			var tmpMark = [];
			var tmpLatLng = [];
			
			markers.forEach(function (marker)
			{
				if (!((marker.options.pane == 'markerPane') && marker.options.icon))
				{
					console.error('Layer isn\'t a marker');
					return;
				}
				var latlng = marker.getLatLng();
				var isDisplaying = self._map.getBounds().contains(latlng);
				var s = self._addMarker(marker,latlng,isDisplaying);
				
				//Only add to Point Lookup if we are on map
				if (isDisplaying ===true)
					tmpMark.push(s[0]);
				
				tmpLatLng.push(s[1]);
			});
			self._markers.load(tmpMark);
			self._latlngMarkers.load(tmpLatLng);
		},
		//Adds single layer at a time. Less efficient for rBush
		addMarker: function (marker) {
			var self = this;
			var latlng = marker.getLatLng();
			var isDisplaying = self._map.getBounds().contains(latlng);
			
			var dat = self._addMarker(marker,latlng,isDisplaying);
			
			//Only add to Point Lookup if we are on map
			if(isDisplaying ===true)
				self._markers.insert(dat[0]);
			self._latlngMarkers.insert(dat[1]);
			
		},
		addLayer: function (layer) {
			if ((layer.options.pane == 'markerPane') && layer.options.icon) this.addMarker(layer);
			else console.error('Layer isn\'t a marker');
		},
		
		addLayers: function (layers) {
			this.addMarkers(layers)
		},
		removeLayer: function (layer) {
			this.removeMarker(layer,true);
		},
		removeMarker: function (marker,redraw) {
			var self = this;
			//If we are removed point
			if(marker["minX"])
				marker = marker.data;
			var latlng = marker.getLatLng();
			var isDisplaying = self._map.getBounds().contains(latlng);
			
			self._latlngMarkers.remove({minX:latlng.lng,
										minY:latlng.lat,
										maxX:latlng.lng,
										maxY:latlng.lat,
										data:marker
									   },function (a,b)
			{
				return a.data._leaflet_id ===b.data._leaflet_id;
			});
			self._latlngMarkers.total--;
			self._latlngMarkers.dirty++;
			if(isDisplaying ===true && redraw ===true)
			{
				self._redraw(true);
			}
		},

		onAdd: function (map) {
			this._map = map;

			if (!this._canvas) {
				this._initCanvas();
			}

			if (this.options.pane) {
				this.getPane().appendChild(this._canvas);
			} else {
				map._panes.overlayPane.appendChild(this._canvas);
			}

			map.on('moveend', this._reset, this);
			map.on('resize',this._reset,this);
			
			//Only add Listeners if we are listening
			if(this._onClickListeners.length>0)
				map.on('click', this._executeListeners, this);
			
			if (this._onHoverListeners.length>0)
				map.on('mousemove', this._executeListeners, this);
        },

		onRemove: function (map) {
			if (this.options.pane) {
				this.getPane().removeChild(this._canvas);
			} else {
				map.getPanes().overlayPane.removeChild(this._canvas);
			}
		},

		addTo: function (map) {
			map.addLayer(this);
			return this;
		},
		_addMarker: function(marker,latlng,isDisplaying)
		{
			var self = this;
			//_markers contains Points of markers currently displaying on map
			if (!self._markers) self._markers = new rbush();
			
			//_latlngMarkers contains Lat\Long coordinates of all markers in layer.
			if (!self._latlngMarkers) 
			{
				self._latlngMarkers = new rbush();
				self._latlngMarkers.dirty=0;
				self._latlngMarkers.total=0;
			}
			
			L.Util.stamp(marker);
			
			var pointPos = self._map.latLngToContainerPoint(latlng);
			var iconSize = marker.options.icon.options.iconSize;
			
			var adj_x = iconSize[0]/2;
			var adj_y = iconSize[1]/2;
			var ret = [({
				minX: (pointPos.x - adj_x),
				minY: (pointPos.y - adj_y),
				maxX: (pointPos.x + adj_x),
				maxY: (pointPos.y + adj_y),
				data: marker
			}),({minX:latlng.lng,
				 minY:latlng.lat,
				 maxX:latlng.lng,
				 maxY:latlng.lat,
				 data:marker
			})];
			
			self._latlngMarkers.dirty++;
			self._latlngMarkers.total++;
			
			//Only draw if we are on map
			if(isDisplaying===true)
				self._drawMarker(marker, pointPos);
			return ret;
		},
		_drawMarker: function (marker, pointPos) {
			var self = this;
			if (!this._imageLookup)
				this._imageLookup = {};
			if (!pointPos)
				pointPos = self._map.latLngToContainerPoint(marker.getLatLng());
			
			
			if (!marker.canvas_img) {
				if(self._imageLookup[marker.options.icon.options.iconUrl])
				{
					marker.canvas_img = self._imageLookup[marker.options.icon.options.iconUrl][0];
					if (self._imageLookup[marker.options.icon.options.iconUrl][1] ===false)
					{
						self._imageLookup[marker.options.icon.options.iconUrl][2].push([marker,pointPos]);
					}
					else
					{
						self._drawImage(marker,pointPos);
					}
				}
				else
				{
					var i = new Image();
					i = new Image();
					i.src = marker.options.icon.options.iconUrl;
					marker.canvas_img = i;
					//Image,isLoaded,marker\pointPos ref
					self._imageLookup[marker.options.icon.options.iconUrl] = [i,false,[
																					[marker,pointPos]
																				]
																			 ];
					i.onload = function()
					{
						self._imageLookup[marker.options.icon.options.iconUrl][1] = true
						self._imageLookup[marker.options.icon.options.iconUrl][2].forEach(function (e)
						{
							self._drawImage(e[0],e[1]);
						});
					}
				}
			} else {
				self._drawImage(marker, pointPos);
			}
		},

		_drawImage: function (marker, pointPos) {
			this._context.drawImage(
				marker.canvas_img,
				pointPos.x - marker.options.icon.options.iconAnchor[0],
				pointPos.y - marker.options.icon.options.iconAnchor[1],
				marker.options.icon.options.iconSize[0],
				marker.options.icon.options.iconSize[1]
			);
		},

		_reset: function () {
			var topLeft = this._map.containerPointToLayerPoint([0, 0]);
			L.DomUtil.setPosition(this._canvas, topLeft);

			var size = this._map.getSize();

			this._canvas.width = size.x;
			this._canvas.height = size.y;

			this._redraw();
		},

		_redraw: function (clear) {
			if (!this._map) {
				return;
			}
			var self = this;

			if (clear) {
				this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
			}
			var tmp = [];
			//If we are 10% individual inserts\removals, reconstruct lookup for efficiency
			if (self._latlngMarkers.dirty/self._latlngMarkers.total >= .1)
			{
				self._latlngMarkers.all().forEach(function(e)
				{
					tmp.push(e);
				});
				self._latlngMarkers.clear()
				self._latlngMarkers.load(tmp);
				self._latlngMarkers.dirty=0;
				tmp = [];
			}
			var mapBounds = self._map.getBounds();
			
			//Only re-draw what we are showing on the map.
			self._latlngMarkers.search({minX:mapBounds.getWest(),
										minY:mapBounds.getSouth(),
										maxX:mapBounds.getEast(),
										maxY:mapBounds.getNorth()}).forEach(function (e)
			{
				//Readjust Point Map
				var pointPos = self._map.latLngToContainerPoint(e.data.getLatLng());
				
				
				var iconSize = e.data.options.icon.options.iconSize;
				var adj_x = iconSize[0]/2;
				var adj_y = iconSize[1]/2;
				
				tmp.push({
						minX: (pointPos.x - adj_x),
						minY: (pointPos.y - adj_y),
						maxX: (pointPos.x + adj_x),
						maxY: (pointPos.y + adj_y),
						data: e.data
				});
				
				//Redraw points
				self._drawMarker(e.data,pointPos);
			});
			//Clear rBush & Bulk Load for performance
			this._markers.clear();
			this._markers.load(tmp);
		},
		_initCanvas: function () {
			this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-icon-layer leaflet-layer');
			var originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
			this._canvas.style[originProp] = '50% 50%';

			var size = this._map.getSize();
			this._canvas.width = size.x;
			this._canvas.height = size.y;

			this._context = this._canvas.getContext('2d');

			var animated = this._map.options.zoomAnimation && L.Browser.any3d;
			L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));
		},

		_updateOptions: function () {

		},

		addOnClickListener: function (listener) {
			if(this._onClickListeners.length===0)
				map.on('click', this._executeListeners, this);
			this._onClickListeners.push(listener);
		},

		addOnHoverListener: function (listener) {
			if (this._onHoverListeners.length==0)
				map.on('mousemove', this._executeListeners, this);
			this._onHoverListeners.push(listener);
		},

		_executeListeners: function (event) {
			if (this._onClickListeners.length <= 0 && this._onHoverListeners.length <= 0)
				return;
			else if (event.type==="click" && this._onClickListeners.length<=0)
				return;
			else if (event.type==="mousemove" && this._onHoverListeners.length<=0)
				return;
			var me = this;
			var x = event.containerPoint.x;
			var y = event.containerPoint.y;
			var ret = this._markers.search({ minX: x, minY: y, maxX: x, maxY: y });

			if (ret && ret.length > 0) {
				me._map._container.style.cursor="pointer";
				if (event.type==="click")
					me._onClickListeners.forEach(function (listener) { listener(event, ret); });
				if (event.type==="mousemove")
					me._onHoverListeners.forEach(function (listener) { listener(event, ret); });
			}
			else
			{
				me._map._container.style.cursor="";
			}
		}
    });

	L.canvasIconLayer = function (options) {
		return new CanvasIconLayer(options);
	};
}, window));
