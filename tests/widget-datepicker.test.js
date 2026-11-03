const assert = require('assert');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="filter-popup"></div></body></html>', {
    url: 'http://localhost'
});
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.Node = dom.window.Node;
global.$ = require('jquery');
global.jQuery = global.$;
window.$ = global.$;
window.jQuery = global.jQuery;

const hostJQuery = global.$;
const Widget = require('../dist/amp-filter');
assert.notStrictEqual(window.jQuery, hostJQuery);
assert.strictEqual(typeof hostJQuery.fn.datepicker, 'undefined');
assert.strictEqual(typeof window.jQuery.fn.datepicker, 'function');

const metadata = [
    {
        id: 'date',
        name: 'Date',
        ui: true,
        fieldType: 'DATE_RANGE',
        dataType: 'DATE',
        endpoint: '/rest/filters/dates',
        componentType: ['ALL'],
        tab: 'Other'
    },
    {
        id: 'indicator-disaggregation',
        name: 'Disaggregation',
        ui: true,
        fieldType: 'TREE',
        dataType: 'TEXT',
        endpoint: '/rest/filters/indicator-disaggregation',
        componentType: ['REPORTS'],
        tab: 'Activity'
    }
];

window.jQuery.get = (url, callback) => {
    assert.strictEqual(url, '/rest/filters/indicator-disaggregation');
    const deferred = window.jQuery.Deferred();
    setTimeout(() => {
        callback({
            listDefinitions: [{
                name: 'Disaggregation',
                displayName: 'Disaggregation',
                items: 'values',
                filterIds: ['indicator-disaggregation-criterion', 'indicator-disaggregation'],
                serializeSelectedLeaves: true
            }],
            items: { values: [{ id: 1, name: 'Sex', children: [{ id: 11, name: 'Female' }] }] }
        });
        deferred.resolve();
    }, 0);
    return deferred.promise();
};

function sync(method, model, options) {
    const deferred = window.jQuery.Deferred();
    setTimeout(() => {
        const data = typeof model.url === 'string' && model.url.indexOf('/rest/filters') === 0
            ? metadata : { 'default-date-format': 'dd/MM/yyyy', language: 'en' };
        options.success(data);
        deferred.resolve(data);
    }, 0);
    return deferred.promise();
}

const widget = new Widget({
    el: document.getElementById('filter-popup'),
    draggable: false,
    caller: 'REPORTS',
    reportType: 'I',
    sync,
    translator: {
        translateDOM() {},
        translateSync(key, fallback) { return fallback; }
    }
});

const timeout = setTimeout(() => {
    console.error('Widget datepicker test timed out');
    process.exitCode = 1;
}, 5000);

widget.loaded.done(() => setTimeout(() => {
    try {
        widget.showFilters();
        const disaggregation = widget.view.allFilters.get('Disaggregation');
        assert.ok(disaggregation);
        const option = disaggregation.get('tree').get('children').at(0).get('children').at(0);
        option.set('selected', true, { propagation: true });
        assert.deepStrictEqual(widget.serialize().filters['indicator-disaggregation'], [11]);
        window.jQuery('#filter-pane-Other .sub-filters-titles a:first').trigger('click');
        const date = widget.view.allFilters.get('date');
        date.set({ selectedStart: '2024-01-02', selectedEnd: '2024-12-31' });
        assert.deepStrictEqual(widget.serialize().filters.date, {
            start: '2024-01-02',
            end: '2024-12-31'
        });
        assert.ok(document.querySelector('#start-date').classList.contains('hasDatepicker'));
        assert.ok(document.querySelector('#end-date').classList.contains('hasDatepicker'));
        assert.strictEqual(document.querySelector('.selected-start-date').textContent, '02/01/2024');
        window.jQuery('.clear-start').trigger('click');
        assert.strictEqual(date.get('selectedStart'), null);
        assert.strictEqual(date.get('selectedEnd'), '2024-12-31');
        console.log('Widget datepicker works with a separate host jQuery');
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        clearTimeout(timeout);
    }
}, 0)).fail(error => {
    console.error(error);
    process.exitCode = 1;
    clearTimeout(timeout);
});
