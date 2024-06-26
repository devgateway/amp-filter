var _ = require('underscore');
var Backbone = require('backbone');

// loading hacks
var jQuery = require('jquery');
//loading jqueryÑ only load it if
//it is not loaded or if there is a jquery loaded but version is older than 2.x.x
if (window.$ == undefined || $.fn.jquery.split(' ')[0].split('.')[0] < 2) {
    window.jQuery = window.$ = Backbone.$ = jQuery;
}

if (typeof Backbone.$ === 'undefined') {
    console.log('relink backbone');
    Backbone.$ = jQuery;
}

require('jquery-ui/draggable');
require('bootstrap/dist/js/bootstrap');
require('./lib/jquery-ui-i18n');

var FilterView = require('./views/filters-view');

// see README.md for documentation on using widget.


function Widget() {
    this.initialize.apply(this, arguments);
}

_.extend(Widget.prototype, Backbone.Events, {

    initialize: function (options) {
        var self = this;
        options = _.defaults(options, {draggable: true});
        if (_.has(options, 'sync')) {
            Backbone.sync = options.sync;
        }
        this.view = new FilterView(options);

        // used to make all filters request faster.
        this._cachedAllFilters = null;

        // loaded deferred to allow for other code to wait for filters to finish loading.
        this.loaded = this.view._loaded.promise();

        // notify when initial loading has finished.
        this.loaded.done(_.bind(function () {
            this.trigger('widgetLoaded');
        }, this));

        // proxy all filter events through here
        this.listenTo(this.view, 'all', function () {
            this.trigger.apply(this, arguments);
        });
    },

    // put the filters into the DOM tree post-initialization
    setElement: function () {
        this.view.setElement(arguments);
    },

    // this will stash current filter state, so it can be restored on cancel.
    showFilters: function () {
        this.view.showFilters();
    },

    setStash: function () {
        this.view.setStash();
    },

    // return models of all filters, even unselected ones..
    getAllFilters: function () {
        var self = this;
        return this.loaded.then(function () {
            // cache, because won't change. avoids calling serialize everytime.
            if (!this._cachedAllFilters) {
                this._cachedAllFilters = self.view.serialize({includeUnselected: true, wholeModel: true});
            }
            return this._cachedAllFilters;
        });
    },

    // return models of serialized filter state, has entire models instead of just ids.
    serializeToModels: function () {
        return this.view.serialize({wholeModel: true});
    },

    getAppliedFilters: function(options) {
        return this.view.getAppliedFilters(options || {});
    },

    formatDate: function (date) {
        return this.view.formatDate(date);
    },

    // return json blob of serialized filter state, ids only.
    serialize: function () {
        var ser = this.view.serialize({});
        return ser;
    },

    // restores filter state given a json blob, ids only.
    deserialize: function (stateBlob, options) {
        return this.view.deserialize(stateBlob, options);
    },

    // reset filters to empty state
    reset: function (options) {
        this.view.resetFilters();
        if (!options || !options.silent) {
            this.view.applyFilters();
        }
    },

    /**
     * searches the settings array of models for the ones which hold the min/max values instructed to and, if found,
     * writes them in filtersOut.date.{start}{end}
     *
     * use it as an utility function (it does not reference 'this', so
     * it is safe to use it at any point in the lifecycle of the widget
     */
    extractDates: function (settings, filtersOut, minName, maxName) {
        filtersOut = filtersOut || {};
        if (_.isUndefined(filtersOut.date) || _.isEmpty(filtersOut.date)) {
            filtersOut.date = filtersOut.date || {
                start: '',
                end: ''
            };

            var defaultMinDate = settings.get(minName);
            if (defaultMinDate !== undefined && defaultMinDate !== '') {
                filtersOut.date.start = defaultMinDate;
            }
            var defaultMaxDate = settings.get(maxName);
            if (defaultMaxDate !== undefined && defaultMaxDate !== '') {
                filtersOut.date.end = defaultMaxDate;
            }
        }
    }

});

module.exports = Widget;
