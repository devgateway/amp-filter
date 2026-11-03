const assert = require('assert');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
global.$ = require('jquery');
global.jQuery = global.$;

const GenericFilterModel = require('../src/models/generic-filter-model');
const FiltersView = require('../src/views/filters-view');
const AllFiltersCollection = require('../src/collections/all-filters-collection');
const optionId = 'indicator-disaggregation';
const model = new GenericFilterModel({
    id: 'Disaggregation',
    name: 'Disaggregation',
    serializeSelectedLeaves: true,
    data: [{
        id: 1,
        name: 'Sex',
        filterId: 'indicator-disaggregation-criterion',
        children: [
            { id: 11, name: 'Female', filterId: optionId },
            { id: 12, name: 'Male', filterId: optionId }
        ]
    }]
});
const root = model.get('tree');
const criterion = root.get('children').at(0);
assert.strictEqual(criterion.get('name'), 'Sex');

criterion.get('children').at(0).set('selected', true, { propagation: true });
assert.deepStrictEqual(model.serialize({}), { [optionId]: [11] });
criterion.set('selected', true, { propagation: true });
assert.deepStrictEqual(model.serialize({}), { [optionId]: [11, 12] });
assert.strictEqual(model.getNumSelected(), 2);

const serialized = FiltersView.prototype.serialize.call({
    allFilters: { each: callback => callback(model) },
    getIncludeLocationChildren: () => true
}, {});
assert.deepStrictEqual(serialized.filters, { [optionId]: [11, 12] });

model.reset();
model.deserialize({ [optionId]: [11] });
assert.deepStrictEqual(model.serialize({}), { [optionId]: [11] });

const definition = {
    filterIds: ['indicator-disaggregation-criterion', optionId]
};
const groups = [
    { id: 2, name: 'Age', children: [{ id: 21, name: 'Adult' }, { id: 22, name: 'Youth' }] },
    { id: 1, name: 'Sex', children: [{ id: 11, name: 'Female' }, { id: 12, name: 'Male' }] }
];
const collection = Object.create(AllFiltersCollection.prototype);
const groupedModel = new GenericFilterModel({
    id: 'Disaggregation',
    name: 'Disaggregation',
    serializeSelectedLeaves: true,
    data: collection._createTree(groups, definition)
});
const groupedRoot = groupedModel.get('tree');
groupedRoot.get('children').at(0).set('selected', true, { propagation: true });
groupedRoot.get('children').at(1).get('children').at(0).set('selected', true, { propagation: true });
assert.deepStrictEqual(groupedModel.serialize({}), { [optionId]: [21, 22, 11] });
groupedModel.reset();
groupedModel.deserialize({ [optionId]: [21, 11] });
assert.deepStrictEqual(groupedModel.serialize({}), { [optionId]: [21, 11] });
groupedRoot.set('selected', true, { propagation: true });
assert.deepStrictEqual(groupedModel.serialize({}), { [optionId]: [21, 22, 11, 12] });

const view = Object.create(FiltersView.prototype);
const applied = { filters: [] };
view.getAppliedFiltersTree(applied, groupedModel);
assert.strictEqual(applied.filters.length, 1);
assert.strictEqual(applied.filters[0].children.length, 2);
assert.strictEqual(view.serializeToModels(groupedModel)[0].length, 2);

for (const type of ['I', 'P', 'D']) {
    const request = {
        url: '/rest/filters',
        _allDeferreds: [],
        fetch: function () { return $.Deferred().resolve().promise(); }
    };
    AllFiltersCollection.prototype.load.call(request, type);
    assert.strictEqual(request.url, type === 'D' ? '/rest/filters' : '/rest/filters?report-type=' + type);
}

const originalFetch = AllFiltersCollection.prototype.fetch;
const originalGet = $.get;
const pendingFetches = [];
const treeRequests = [];
AllFiltersCollection.prototype.fetch = function () {
    const deferred = $.Deferred();
    pendingFetches.push({ collection: this, deferred });
    return deferred.promise();
};
$.get = function (url, callback) {
    treeRequests.push(url);
    const isDisaggregation = url === '/rest/filters/indicator-disaggregation';
    const name = isDisaggregation ? 'Disaggregation' : 'Other';
    callback({
        listDefinitions: [{
            name,
            displayName: name,
            items: 'values',
            filterIds: definition.filterIds,
            serializeSelectedLeaves: isDisaggregation
        }],
        items: { values: groups }
    });
    return $.Deferred().resolve().promise();
};

const scenarios = [
    { caller: 'REPORTS', reportType: 'I', allowed: true },
    { caller: 'REPORTS', reportType: 'I', reportContext: true, allowed: true },
    { caller: 'REPORTS', reportType: 'I', reportContext: false, allowed: false },
    { caller: 'REPORTS', reportType: 'D', allowed: false },
    { caller: 'REPORTS', reportType: 'P', allowed: false },
    { caller: 'DASHBOARD', reportType: 'I', allowed: false },
    { caller: 'GIS', reportType: 'I', allowed: false },
    { caller: 'TAB', reportType: 'I', allowed: false },
    { reportType: 'I', allowed: false }
];
const instances = scenarios.map(options => new AllFiltersCollection([], options));
const metadata = [
    {
        id: optionId, ui: true, fieldType: 'TREE', dataType: 'TEXT',
        endpoint: '/rest/filters/indicator-disaggregation', componentType: ['REPORTS']
    },
    {
        id: 'other', ui: true, fieldType: 'TREE', dataType: 'TEXT',
        endpoint: '/rest/filters/other', componentType: ['ALL']
    }
];
pendingFetches.reverse().forEach(({ collection: instance, deferred }) => {
    instance.set(instance.parse(metadata), { remove: false });
    deferred.resolve();
});
instances.forEach((instance, index) => {
    assert.strictEqual(Boolean(instance.get('Disaggregation')), scenarios[index].allowed);
    assert.ok(instance.get('Other'));
});
assert.strictEqual(treeRequests.filter(url => url === '/rest/filters/indicator-disaggregation').length, 2);
assert.strictEqual(treeRequests.filter(url => url === '/rest/filters/other').length, scenarios.length);
AllFiltersCollection.prototype.fetch = originalFetch;
$.get = originalGet;
console.log('Disaggregation filter selection and round trip passed');
