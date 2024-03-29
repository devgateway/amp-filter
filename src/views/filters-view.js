/**
 * this is the view which renders the big Filter contents (the tabs)
 */
var fs = require('fs');
var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
var Translator = require('amp-translate');
var TopLevelFilterView = require('../views/top-level-filter-view');
var AllFilterCollection = require('../collections/all-filters-collection');
var Template = fs.readFileSync(__dirname + '/../templates/filters-content-template.html', 'utf8');
var TitleTemplate = fs.readFileSync(__dirname + '/../templates/filter-title-template.html', 'utf8');
var AppliedFiltersTemplate = fs.readFileSync(__dirname + '/../templates/applied-filters-view.html', 'utf8');
var GeneralSettings = require('../models/general-settings');
var DateUtils = require('../utils/date-utils');
var Constants = require('../utils/constants');

var filterInstancesNames = {
    donors: 'Funding Organizations',
    sectors: 'Sector',
    programs: 'Programs',
    activity: 'Activity',
    allAgencies: 'All Agencies',
    financials: 'Financial',
    locations: 'Location',
    others: 'Other'
};


module.exports = Backbone.View.extend({
    id: 'tool-filters',
    name: 'Filters',
    apiURL: Constants.ALL_FILTERS_URL,

    events: {
        'click .apply': 'applyFilters',
        'click .cancel': 'cancel',
        'click .reset': 'resetFilters'
    },
    PARAMS_DATE_FORMAT: 'yy-mm-dd', //backend expects filters to be submitted in this format
    initialize: function (options) {
        var self = this;
        this.draggable = options.draggable;
        this.caller = options.caller;
        this.embedded = options.embedded;
        this.settings = new GeneralSettings();
        this.settings.fetch();
        this.filterViewsInstances = {};
        this.template = _.template(Template);
        this.appliedFiltersTemplate = _.template(AppliedFiltersTemplate);
        this.titleTemplate = _.template(TitleTemplate);
        this.dateFormatMappings = [];
        this.dateFormatMappings.push({ampformat: 'dd/MMM/yyyy', datepickerformat: 'dd/M/yy'});
        this.dateFormatMappings.push({ampformat: 'MMM/dd/yyyy', datepickerformat: 'M/dd/yy'});
        this.dateFormatMappings.push({ampformat: 'dd/MM/yyyy', datepickerformat: 'dd/mm/yy'});
        this.dateFormatMappings.push({ampformat: 'MM/dd/yyyy', datepickerformat: 'mm/dd/yy'});

        if (options.translator === undefined) {
            this.createTranslator();
            options.translator = this.translator;
        } else {
            this.translator = options.translator;
        }

        this.firstRender = true;
        this._createTopLevelFilterViews();
        this.allFilters = new AllFilterCollection([], options);
        this._loaded = this.allFilters._loaded;
        this._getFilterList().then(function () {
            self.allFilters.each(function (model) {
                if (model.get('empty')) {
                    for (var key in filterInstancesNames) {
                        if (filterInstancesNames.hasOwnProperty(key)) {
                            if (filterInstancesNames[key] == model.get('group')) {
                                // remove tab if there is no data for the tab
                                delete filterInstancesNames[key];
                                delete self.filterViewsInstances[key];
                            }
                        }
                    }
                } else {
                    self._createFilterViews(model);
                }

            });

            return this;
        });

    },

    _createTopLevelFilterViews: function () {
        for (var key in filterInstancesNames) {
            if (filterInstancesNames.hasOwnProperty(key)) {
                this.filterViewsInstances[key] = new TopLevelFilterView({
                    name: filterInstancesNames[key],
                    translator: this.translator,
                    translate: this.translate,
                    filterView: this
                });
            }
        }
    },


    render: function () {
        var self = this;
        this.$el.addClass('panel panel-primary');
        if (this.draggable) {
            this.$el.draggable({cursor: 'move', containment: 'window'});
        }

        if (this.firstRender) {
            this.$el.html(this.template({}));
            this.$el.show();

            this._getFilterList().done(function () {
                self.renderFilters();
                self.translate(this.$el);
            });

            // handle click on a Tab's title: http://getbootstrap.com/javascript/#tabs-events
            $(document).on('shown.bs.tab click', "ul.nav.filter-titles>li>a[data-toggle='tab']", function (e) {  // <- this line makes little sense but works in Saiku/Tabs also
                //this.$el.find("ul.nav.filter-titles>li>a[data-toggle='tab']").on('shown.bs.tab', function (e) {   // <- this line works in anything except Saiku/Tabs
                /**
                 * the 'click' event added because (weirdly) the shown.bs.tab event not being fired AT ALL under Saiku/Tabs. Until this is investigated
                 * on GIS/Dashboard tabs this second event is superfluous
                 */

                var activeTab = $(e.target.parentElement).index(); // shameful hack, but haven't been able to find a cleaner solution
                var oldTabNr = e.relatedTarget ? $(e.relatedTarget.parentElement).index() : -1;
                console.log('switching from filters tab', oldTabNr, 'to tab', activeTab);
                $(e.target).closest('ul.filter-titles').attr('active-tab-number', activeTab); // not used in the current implementation of the code

                // render the first item of the tab
                var tabId = $(e.target).attr('href');
                var tabFirstChild = $(tabId).find('ul.sub-filters-titles>li:first a');
                if (tabFirstChild)
                    tabFirstChild.click();
            });

            this.firstRender = false;
        } else {
            self.translate();
        }

        return this;
    },

    createTranslator: function (force) {
        var self = this;
        var filterTranslateKeys = JSON.parse(fs.readFileSync(__dirname + '/../lib/initial-translation-request.json', 'utf8'));
        // setup any popovers as needed...
        self.popovers = self.$('[data-toggle="popover"]');
        self.popovers.popover();
        if (force === true || self.translator === undefined) {
            console.log('Creating translator for filters because', force === true ? 'I was forced' : 'there is no translator');
            self.translator = new Translator({defaultKeys: filterTranslateKeys});
        }
    },

    translate: function (target) {
        var element = this;
        if (target !== undefined) {
            element = target;
        }
        if (element.el !== undefined) {
            this.translator.translateDOM(element.el);
        } else {
            this.translator.translateDOM(element);
        }
    },

    /**
     * renders the tabs within the filters, only rendering the first item of the active tab (the others don't have their first item's contents rendered for performance reasons)
     */
    renderFilters: function () {
        this.$('.filter-options').html('');

        var renderingTitleNumber = -1;
        var activeTitleNumber = this.$('.filter-titles').attr('active-tab-number') || 0;

        for (var filterView in this.filterViewsInstances) {
            if (this.filterViewsInstances.hasOwnProperty(filterView)) {
                contained = false;
                var index;
                for (index = 0; index < this.allFilters.length; index++) {
                    if ((this.allFilters.models[index].attributes.tab === this.filterViewsInstances[filterView].name) ||
                        (this.allFilters.models[index].attributes.group === this.filterViewsInstances[filterView].name)) {
                        contained = true;
                        break;
                    }
                }
                if (!contained) {
                    delete this.filterViewsInstances[filterView];
                    continue;
                }

                var tmpFilterView = this.filterViewsInstances[filterView];
                renderingTitleNumber = renderingTitleNumber + 1;
                this.$('.filter-titles').append(tmpFilterView.renderTitle().titleEl);
                var active = renderingTitleNumber == activeTitleNumber;
                this.$('.filter-options').append(tmpFilterView.renderFilters(active).el);
            }
        }

        // Opens the first tab in the filter
        this.$('.filter-titles a:first').tab('show');
    },

    _getFilterList: function () {
        return this.allFilters.load();
    },

    _createFilterViews: function (tmpModel) {
        switch (tmpModel.get('tab')) {
            case Constants.FINANCIALS:
                this.filterViewsInstances.financials.filterCollection.add(tmpModel);
                break;
            case Constants.ACTIVITY:
                this.filterViewsInstances.activity.filterCollection.add(tmpModel);
                break;
            case Constants.PROGRAMS:
                this.filterViewsInstances.programs.filterCollection.add(tmpModel);
                break;
            case Constants.SECTOR:
                this.filterViewsInstances.sectors.filterCollection.add(tmpModel);
                break;
            case Constants.FUNDING_ORGANIZATIONS:
            case Constants.PLEDGES_DONORS:
                if (tmpModel.get('group') === Constants.ROLE) {
                    this.filterViewsInstances.allAgencies.filterCollection.add(tmpModel);
                } else {
                    this.filterViewsInstances.donors.filterCollection.add(tmpModel);
                }
                break;
            case Constants.ALL_AGENCIES:
                this.filterViewsInstances.allAgencies.filterCollection.add(tmpModel);
                break;
            case Constants.LOCATION:
                this.filterViewsInstances.locations.filterCollection.add(tmpModel);
                break;
            default:
                this.filterViewsInstances.others.filterCollection.add(tmpModel);
        }

    },

    serializeToModels: function (filter) {
        var _self = this;
        _self.values = {0: [], 1: [], 2: [], 3: [], 4: [], 5: []}; //TODO: Implement calculateFilterDept() function.
        if (filter.get('tree')) {
            var entryPoint = filter.get('tree').get('children');
            var currentLevel = 0;
            if (filter.get('numSelected') !== filter.get('numPossible')) {
                _.each(entryPoint.models, function (item) {
                    _self.serializeLevel(item, 0, _self.values);
                });
            }
        } else {
            _self.values = filter;
        }
        return _self.values;
    },

    serializeLevel: function (node, level, values) {
        // When we enter here it means the parent is not 'fully selected'.
        var _self = this;
        if (node.get('children').models.length > 0) {
            // "Double check" because some selected middle nodes have get('selected') false or undefined.
            if (node.get('numSelected') !== node.get('numPossible') && node.get('selected') !== true) {
                _.each(node.get('children').models, function (node2) {
                    _self.serializeLevel(node2, level + 1, values);
                });
            } else {
                if (values[level] === undefined) {
                    values << [];
                }
                values[level].push({'level': level, 'levelName': node.get('filterId'), name: node.get('name')});
            }
        } else { // We reached the last level..
            if (node.get('selected') === true) {
                if (values[level] === undefined) {
                    values << [];
                }
                values[level].push({'level': level, 'levelName': node.get('filterId'), name: node.get('name')});
            }
        }
    },

    createItemObject: function (id, code, name, filterId, children) {
        return {
            id: id,
            code: code,
            name: name,
            filterId: filterId,
            children: children
        };
    },

    isNodeSelected: function (node) {
        var ret = (node.get('numSelected') === node.get('numPossible') && node.get('numSelected') > 0)
          || (node.get('numSelected') === 0 && node.get('selected'));
        return ret;
    },

    getAppliedFilters: function (options) {
        var self = this;
        this.container = $(options.containerId);
        var serializedFilters = { filters: [] };
        this.allFilters.each(function (filter) {
            switch (filter.get('modelType')) {
                case 'TREE':
                    if (filter.get('numSelected') > 0) {
                        self.getAppliedFiltersTree(serializedFilters, filter);
                    }
                    break;
                case 'DATE-RANGE-VALUES':
                    self.getAppliedFiltersDateRange(serializedFilters, filter);
                    break;
                case 'YEAR-SINGLE-VALUE':
                    self.getAppliedFiltersDateYear(serializedFilters, filter);
                    break;
            }
        });
        console.info(serializedFilters);

        var AppliedFilterModel = Backbone.Model.extend();
        model = new AppliedFilterModel();
        model.set({serializedFilters: serializedFilters});
        this.appliedFiltersModel = model;
        const html = this.renderAppliedFilters(options.returnHTML);
        return html;
    },

    getAppliedFiltersDateRange: function (serializedFilters, filter) {
        var self = this;
        var add = false;
        var rootFilter = {
            id: filter.get('id'),
            displayName: filter.get('displayName') || filter.get('name'),
            originalName: filter.get('originalName'),
            modelType: filter.get('modelType')
        };
        if (filter.get('selectedStart')) {
            add = true;
            rootFilter.selectedStart = self.translator.translateSync('amp.gis:from') + " " + filter.get('selectedStart');
        }
        if (filter.get('selectedEnd')) {
            add = true;
            rootFilter.selectedEnd = self.translator.translateSync('amp.gis:until') + " " + filter.get('selectedEnd');
        }
        if (add) {
            serializedFilters.filters.push(rootFilter);
        }
    },

    getAppliedFiltersDateYear: function (serializedFilters, filter) {
        var self = this;
        if (filter.get('selectedYear')) {
            serializedFilters.filters.push({
                id: filter.get('id'),
                displayName: filter.get('displayName') || filter.get('name'),
                originalName: filter.get('originalName'),
                modelType: filter.get('modelType'),
                selectedYear: filter.get('selectedYear')
            });
        }
    },

    getAppliedFiltersTree: function (serializedFilters, filter) {
        var self = this;
        if (self.isNodeSelected(filter)) {
            // AMP-28806: Dont add filter if all selected.
        } else {
            var tree = filter.get('tree');
            var children = tree ? tree.get('children') : null;
            var originalName = filter.get('originalName');
            var displayName = filter.get('displayName') || filter.get('name');
            if (tree.get('include-location-children') === true) {
                displayName += ' ' + self.translator.translateSync('amp.gis:with-children-selected');
            }
            var rootFilter = {
                id: filter.get('id'),
                displayName: displayName,
                originalName: originalName,
                modelType: filter.get('modelType'),
                filterId: filter.get('filterId'),
                children: []
            };
            if (children) {
                var root = self.createItemObject(filter.get('id'), filter.get('code'), filter.get('name'), filter.get('filterId'), [])
                children.each(function (child) {
                    self.exploreTree(child, root);
                });
                if (root.children.length > 0) {
                    rootFilter.children.push(root);
                }
            }
        }
        if (rootFilter && rootFilter.children && rootFilter.children.length > 0) {
            rootFilter.children = rootFilter.children[0].children;
            serializedFilters.filters.push(rootFilter);
        }
    },

    exploreTree: function(child, _filter) {
        var self = this;
        if (self.isNodeSelected(child)) {
            var node = self.createItemObject(child.get('id'), child.get('code'), child.get('name'), child.get('filterId'), []);
            _filter.children.push(node);
        } else if (child.get('numSelected') > 0) {
            var node = self.createItemObject(child.get('id'), child.get('code'), child.get('name'), child.get('filterId'), []);
            if (_filter.id !== node.id) {
                _filter.children.push(node);
            }
            child.get('children')
              .each(function (child_) {
                  self.exploreTree(child_, node);
              });
        }
    },

    renderAppliedFilters: function(returnHTML) {
        var self = this;
        this.$el2 = this.container;
        const html = this.appliedFiltersTemplate(_.extend({}, this.appliedFiltersModel.toJSON()));
        if (returnHTML === true) {
            return html;
        } else {
            this.$el2.html(html);
            this.$el2.show();
        }
        return this;
    },


    //TODO: move from view to all-collection
    serialize: function (options) {
        var self = this;
        var serializedFilters = {filters: {}};
        this.allFilters.each(function (filter) {
            options.group = filter.get('group');
            options.tab = filter.get('tab');
            if (filter.get('id') || filter.url) {
                if (filter.get('modelType') === Constants.DATE_RANGE_VALUES ||
                    filter.get('modelType') === Constants.YEAR_SINGLE_VALUE) {
                    _.extend(serializedFilters.filters, filter.serialize(options));
                } else {
                    var serialized = filter.serialize(options);
                    //AMP-28806: Dont filter if all selected.
                    if (filter.get('numPossible') === filter.get('numSelected') && filter.get('numSelected') > 0) {
                        serialized = {};
                    }
                    if (options.wholeModel === true) {
                        var keys = [];
                        for (var k in serialized) keys.push(k);
                        if (keys[0] !== undefined && serialized[keys[0]] !== undefined) {
                            serialized[keys[0]].filterName = (filter.get('displayName') || filter.get('name'));
                            serialized[keys[0]].serializedToModels = self.serializeToModels(filter);
                        }
                    }
                    _.extend(serializedFilters.filters, serialized);
                }
            }
        });

        //remove empty / false values.
        _.each(serializedFilters, function (v, k) {
            if (!v || _.isEmpty(v)) {
                delete serializedFilters.filters[k];
            }
        });

        serializedFilters[Constants.INCLUDE_LOCATION_CHILDREN] = this.getIncludeLocationChildren();
        // console.log(serializedFilters);
        return serializedFilters;
    },

    deserialize: function (filtersObject, options) {
        var blob = filtersObject.filters || {};
        if (blob) {
            if (_.isUndefined(this.initialFilters)) {
                this.initialFilters = blob;
            }
            var that = this;
            that.allFilters.each(function (filter) {
                filter.reset();
                if (filter.get('id') || filter.url) {
                    if (filter.get('modelType') === Constants.DATE_RANGE_VALUES) {
                        if (options && options.dontSetDefaultDates === true) {
                            // do nothing.
                        } else {
                            that.setDefaultDates(blob);
                        }
                        filter.deserialize(blob);
                    } else {
                        // The Locations checkbox for children should be enabled by default.
                        if (filter.get('tree') && filter.get('tree')._isLocation()) {
                            if (filtersObject!== undefined &&
                                filtersObject[Constants.INCLUDE_LOCATION_CHILDREN] !== undefined &&
                                filtersObject[Constants.INCLUDE_LOCATION_CHILDREN] !== null) {
                                filter.get('tree').set(Constants.INCLUDE_LOCATION_CHILDREN,
                                    filtersObject[Constants.INCLUDE_LOCATION_CHILDREN]);
                            } else {
                                filter.get('tree').set(Constants.INCLUDE_LOCATION_CHILDREN, true);
                            }
                        }
                        filter.deserialize(blob);
                    }
                }
            });
        } else {
            console.warn('could not deserialize blob:', blob);
        }
        this.trigger('filtersDeserialized');
        if (!options || !options.silent) {
            this.applyFilters();  // triggers the "apply" event
        }
    },

    showFilters: function () {
        this.render();
        this.filterStash = null;  // in case they haven't loaded yet, don't try to .serialize()
        this._loaded.done(_.bind(function () {
            this.filterStash = this.serialize({});
        }, this));
    },

    setStash: function () {
        this.filterStash = null;  // in case they haven't loaded yet, don't try to .serialize()
        this._loaded.done(_.bind(function () {
            this.filterStash = this.serialize({});
        }, this));
    },

    resetFilters: function () {
        this.allFilters.each(function (filter) {
            filter.reset();
        });
        this.trigger('reset');
    },

    applyFilters: function () {
        this._loaded.done(_.bind(function () {
            var state = this.serialize({});
            this.trigger('apply', state);
        }, this));
    },

    getDateFormat: function () {
        if (this.dFormat) {
            return this.dFormat;
        }

        var dateFormatSetting = this.settings.get('default-date-format');
        if (dateFormatSetting) {
            var foundMapping = _.findWhere(this.dateFormatMappings, {ampformat: dateFormatSetting});
            if (foundMapping) {
                this.dFormat = foundMapping.datepickerformat;
            }
        }
        if (!this.dFormat) {
            this.dFormat = this.PARAMS_DATE_FORMAT;
        }
        return this.dFormat;
    },

    formatDate: function (date) {
        return $.datepicker.formatDate(this.getDateFormat(), ($.datepicker.parseDate(this.PARAMS_DATE_FORMAT, date)));
    },

    setDefaultDates: function (blob) {
        var self = this;
        if (self.caller === Constants.CONTEXT_DASHBOARD) {
            return DateUtils.extractDates(self.settings, blob, 'dashboard-default-min-date', 'dashboard-default-max-date');
        } else if (self.caller === Constants.CONTEXT_GIS) {
            return DateUtils.extractDates(self.settings, blob, 'gis-default-min-date', 'gis-default-max-date');
        } else if (self.caller === Constants.CONTEXT_REPORT) {
            return DateUtils.extractDates(self.settings, blob, 'report-default-min-date', 'report-default-max-date');
        }
        return blob;
    },

    cancel: function () {
        if (this.filterStash) {
            this.deserialize(this.filterStash, {silent: true});
        }
        this.trigger('cancel', this.filterStash);
    },

    getIncludeLocationChildren: function () {
        var includeChildren = true;
        this.allFilters.filter(function (filter) {
            if (filter.get('tree') && filter.get('tree')._isLocation()) {
                // Careful,  _isLocationAndDontIncludeChildren() could be undefined|true|false.
                includeChildren = filter.get('tree')._isLocationAndDontIncludeChildren() === true ? false : true;
            }
        });
        return includeChildren;
    }
});
