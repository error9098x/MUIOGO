"""Results data alignment checks against the real frontend module."""

from .test_shell_smoke import base_url  # noqa: F401


def test_results_missing_values_keep_table_and_chart_positions(page, base_url):
    page.goto(base_url, wait_until="domcontentloaded")
    result = page.evaluate("""async () => {
        const markup = await fetch('App/View/OGResults.html').then(r => r.text());
        const {default: Results} = await import(new URL('App/Controller/OGResults.js', location.href).href);
        document.querySelector('.osy-content').innerHTML = markup;
        Results.groups = ['Bottom 50%', 'Top 50%'];
        Results.ages = [31, 32, 33];
        Results.base = {c: [[0, 2], [null, 4], [3, 6]], Y: [1, null, 3]};
        Results.reform = {c: [[2, 3], [4, 5], [6, null]], Y: [2, 4, 6]};
        Results.renderExploreTable('c', 'pct');
        const cells = [...document.querySelectorAll('#ogcExploreTable tbody tr:first-child td')].map(c => c.textContent);
        const profile = Results.profileOption('c', 0, 'levels');
        const delta = Results.profileOption('c', 0, 'diff');
        const bars = Results.comparisonOption('Y', 'levels');
        Results.renderExploreTable('Y', 'levels');
        const vectorRows = [...document.querySelectorAll('#ogcExploreTable tbody tr')].map(r => [...r.cells].map(c => c.textContent));
        Results.activeTableKey = 'macro';
        Results.renderTableRows([{Variable: 'GDP', Baseline: null, Reform: 50}]);
        const serverCells = [...document.querySelectorAll('#ogcResultTable td')].map(c => c.textContent);
        return {cells, profile: profile.series.map(s => s.data), ages: profile.xAxis.data,
            delta: delta.series[0].data, bars: bars.series.map(s => s.data), vectorRows, serverCells};
    }""")
    assert result['cells'] == ['31', '', '50']
    assert result['serverCells'] == ['GDP', '', '50']
    assert result['ages'] == [31, 32, 33]
    assert result['profile'] == [[0, None, 3], [2, 4, 6]]
    assert result['delta'] == [2, None, 3]
    assert result['bars'] == [[1, None, 3], [2, 4, 6]]
    assert result['vectorRows'] == [['1', '1', '2'], ['2', '', '4'], ['3', '3', '6']]


def test_results_profile_choices_require_compatible_data(page, base_url):
    page.goto(base_url, wait_until="domcontentloaded")
    result = page.evaluate("""async () => {
        const markup = await fetch('App/View/OGResults.html').then(r => r.text());
        const {default: Results} = await import(new URL('App/Controller/OGResults.js', location.href).href);
        document.querySelector('.osy-content').innerHTML = markup;
        Results.groups = ['Bottom', 'Top']; Results.ages = [31, 32, 33];
        Results.base = {c: [[1, 2], [3, 4], [5, 6]], n: [[1, 2], [3, 4], [5, 6]], b_s: [[1, 2], [3, 4], [5, 6]]};
        Results.reform = {n: [[1, 2]], b_s: [[2, 3], [4, 5], [6, 7]]};
        Results.renderProfileControls();
        const choices = [...document.querySelector('#ogcProfileVariable').options].map(o => o.value);
        const selected = document.querySelector('#ogcProfileVariable').value;
        Results.charts = {}; Results.reform = {};
        Results.renderProfileControls(); Results.renderProfile();
        return {choices, selected, empty: document.querySelector('#ogcProfileChart').textContent,
            disabled: document.querySelector('#ogcProfileVariable').disabled};
    }""")
    assert result['choices'] == ['b_s']
    assert result['selected'] == 'b_s'
    assert 'unavailable' in result['empty']
    assert result['disabled'] is True


def test_results_saved_pair_library_retry_and_export_title(page, base_url):
    page.goto(base_url, wait_until="domcontentloaded")
    result = page.evaluate("""async () => {
        const markup = await fetch('App/View/OGResults.html').then(r => r.text());
        const {default: Results} = await import(new URL('App/Controller/OGResults.js', location.href).href);
        document.querySelector('.osy-content').innerHTML = markup;
        Results.workspace = {country_id: 'test'};
        Results.selection = {casename: 'Case', base: 'Base', reform: 'Second'};
        Results.saveView();
        const saved = Results.readSaved();
        Results.items = [{case: {casename: 'Case'}, runs: [
            {run_name: 'Base', run_type: 'baseline', status: 'completed'},
            {run_name: 'First', run_type: 'reform', baseline_run: 'Base', status: 'completed'},
            {run_name: 'Second', run_type: 'reform', baseline_run: 'Base', status: 'completed'}]}];
        $('#ogcResultCase').html('<option>Case</option>');
        const load = Results.loadComparison; Results.loadComparison = () => {};
        Results.renderReformOptions(saved);
        const restored = $('#ogcResultReform').val();
        Results.renderReformOptions({...saved, reform: 'Deleted'});
        const fallback = $('#ogcResultReform').val();
        Results.loadComparison = load;
        const append = document.head.appendChild;
        let scripts = [];
        document.head.appendChild = function(node){ scripts.push(node); return node; };
        const first = Results.loadECharts(); const second = Results.loadECharts();
        const shared = first === second;
        const failed = first.catch(() => true);
        scripts[0].dispatchEvent(new Event('error')); await failed;
        const retry = Results.loadECharts(); const retryFailure = retry.catch(() => true);
        scripts[1].dispatchEvent(new Event('error')); await retryFailure;
        document.head.appendChild = append;
        await Results.loadECharts();
        Results.charts = {};
        const element = document.querySelector('#ogcExploreChart');
        element.style.width = '500px'; element.style.height = '300px';
        Results.setChart('ogcExploreChart', {animation: false, aria: {description: 'Consumption <baseline> & reform by age for each lifetime income group over the full model horizon'}, legend: {data: ['Baseline']}, xAxis: {data: ['31']}, yAxis: {}, series: [{name: 'Baseline', type: 'bar', data: [1]}]});
        let artifact, filename;
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function(){ artifact = this.href; filename = this.download; };
        Results.exportChart('ogcExploreChart'); HTMLAnchorElement.prototype.click = click;
        const svg = new DOMParser().parseFromString(decodeURIComponent(artifact.split(',').slice(1).join(',')), 'image/svg+xml');
        return {restored, fallback, baseline: $('#ogcResultBaselineName').text(), shared,
            scripts: scripts.length, title: [...svg.querySelectorAll('text')].map(t => t.textContent).join(' '),
            titleLines: [...svg.documentElement.children].filter(n => n.tagName == 'text').length,
            height: Number(svg.documentElement.getAttribute('height')), parseErrors: svg.querySelectorAll('parsererror').length, filename};
    }""")
    assert result['restored'] == 'Second'
    assert result['fallback'] == 'First'
    assert result['baseline'] == 'Baseline: Base'
    assert result['shared'] is True
    assert result['scripts'] == 2
    assert 'Consumption <baseline> & reform by age for each lifetime income group over the full model horizon' in result['title']
    assert 'Baseline' in result['title']
    assert result['titleLines'] > 1
    assert result['height'] > 300
    assert result['parseErrors'] == 0
    assert result['filename'] == 'ogcore-Case-Base-Second-explore.svg'


def test_results_policy_compares_scalars_without_flattening_arrays(page, base_url):
    page.goto(base_url, wait_until="domcontentloaded")
    result = page.evaluate("""async () => {
        const markup = await fetch('App/View/OGResults.html').then(r => r.text());
        const {default: Results} = await import(new URL('App/Controller/OGResults.js', location.href).href);
        document.querySelector('.osy-content').innerHTML = markup;
        Results.schema = {frisch: {default: 0.4}};
        Results.baseParams = {frisch: 0.5, array: [1, 2], text: '<baseline>', missing: 2};
        Results.reformParams = {array: [2, 3], text: '<reform>'};
        Results.renderPolicy();
        return [...document.querySelectorAll('.ogc-policy-item')].map(item => ({name: item.querySelector('code').textContent, value: item.querySelector('span')?.textContent || '', elements: item.querySelectorAll('baseline, reform').length}));
    }""")
    rows = {row['name']: row for row in result}
    assert rows['frisch']['value'] == 'Baseline: 0.5 → Reform: 0.4'
    assert rows['array']['value'] == ''
    assert rows['missing']['value'] == ''
    assert rows['text']['value'] == 'Baseline: <baseline> → Reform: <reform>'
    assert rows['text']['elements'] == 0
