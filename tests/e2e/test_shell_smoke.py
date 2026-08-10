"""
Browser smoke test for the MUIOGO shell: model selector, per-model navigation
chrome, and the per-route model assertions, against the real app served by
waitress.

Runs only when pytest-playwright is installed (the dedicated CI job); the plain
pytest job skips this module.
"""

import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

pytest.importorskip("pytest_playwright")
from playwright.sync_api import expect

REPO_ROOT = Path(__file__).resolve().parents[2]
STARTUP_TIMEOUT = 90  # seconds

expect.set_options(timeout=15_000)


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def base_url():
    """Real server on a free port, torn down after the session."""
    port = _free_port()
    env = dict(os.environ, PORT=str(port))
    proc = subprocess.Popen(
        [sys.executable, str(REPO_ROOT / "API" / "app.py")],
        cwd=REPO_ROOT, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    url = f"http://127.0.0.1:{port}"
    deadline = time.time() + STARTUP_TIMEOUT
    while True:
        if proc.poll() is not None:
            out = proc.stdout.read() if proc.stdout else ""
            pytest.fail(f"app exited during startup (code {proc.returncode}):\n{out[-2000:]}")
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    break
        except (urllib.error.URLError, ConnectionResetError, TimeoutError):
            pass
        if time.time() > deadline:
            proc.terminate()
            pytest.fail(f"app did not serve / within {STARTUP_TIMEOUT}s")
        time.sleep(0.25)
    yield url
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


# Each test gets a fresh browser context (empty localStorage), so every test
# starts from the no-model-selected state.

def test_fresh_visit_shows_model_pick(page, base_url):
    page.goto(base_url)
    expect(page.locator("body.osy-mode-none")).to_have_count(1)
    expect(page.locator(".osy-pickwrap")).to_be_visible()
    expect(page.locator("#osy-mb-og")).to_be_visible()
    expect(page.locator("#osy-mb-clews")).to_be_visible()


def test_switch_to_og(page, base_url):
    page.goto(base_url)
    page.locator("#osy-mb-og").click()
    expect(page.locator("body.osy-mode-og")).to_have_count(1)
    # page skeleton only: asserting catalog contents would depend on a live fetch
    expect(page.locator(".ogc-page")).to_be_visible()
    expect(page.locator("#Navi > li.nav-home")).to_be_visible()
    # country tools appear only after opening a country card, not as global nav
    expect(page.locator("#Navi > li:not(.nav-home):visible")).to_have_count(0)
    expect(page.locator(".project-context")).to_be_hidden()


def test_switch_to_clews(page, base_url):
    page.goto(base_url)
    page.locator("#osy-mb-clews").click()
    expect(page.locator("body.osy-mode-clews")).to_have_count(1)
    expect(page.locator(".project-context")).to_be_visible()


def test_routes_assert_their_model(page, base_url):
    # with no model selected, the route itself must set the shell mode
    page.goto(f"{base_url}/#/Config")
    expect(page.locator("body.osy-mode-clews")).to_have_count(1)
    expect(page.locator(".project-context")).to_be_visible()
    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator("body.osy-mode-og")).to_have_count(1)
    expect(page.locator(".ogc-page")).to_be_visible()


def test_local_folder_update_action_is_manual(page, base_url):
    page.goto(f"{base_url}/#/OGCore")
    html = page.evaluate("""async () => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        return OGCore.actionsHtml(
            { install_state: 'update_available' },
            { source_type: 'local_path' },
        );
    }""")
    assert 'data-act="update"' not in html
    assert 'data-act="check"' in html
    assert 'Update the local folder' in html


def test_changed_add_form_disables_previous_check(page, base_url):
    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator(".ogc-page")).to_be_visible()
    page.evaluate("""async () => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        OGCore.openAdd();
        OGCore.checkedValues = { source: '/tmp/OG-KEN', label: 'Kenya', code: 'KEN', valid: true };
    }""")
    page.locator("#ogcAddSource").fill("/tmp/OG-ETH")
    expect(page.locator('[data-act="add-confirm"]')).to_be_disabled()


def test_failed_job_reopens_with_retry_action(page, base_url):
    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator(".ogc-page")).to_be_visible()
    result = page.evaluate("""async () => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        OGCore.model = { calibrations: [], records: {} };
        $('#ogcGrid').html(OGCore.cardHtml({
            country_id: 'KEN', country_name: 'Kenya', install_state: 'installing'
        }));
        OGCore.applyJob('KEN', {
            country_id: 'KEN', country_name: 'Kenya', install_state: 'failed',
            log_tail: ['failed'], error: 'install failed'
        }, OGCore.pageID);
        OGCore.openLog('KEN');
        return {
            heading: $('#ogcModalHead').text(),
            retry: $('#ogcModalFoot [data-act="retry-modal"]').length,
        };
    }""")
    assert 'install failed' in result['heading']
    assert result['retry'] == 1


def test_registry_install_id_is_authoritative(page, base_url):
    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator(".ogc-page")).to_be_visible()
    result = page.evaluate("""async () => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        localStorage.setItem('osy-ogc-jobs', JSON.stringify({ KEN: 'stale-browser-id' }));
        OGCore.model = {
            calibrations: [{ country_id: 'KEN', install_id: 'catalog-id' }],
            records: { KEN: { install_id: 'registry-id' } },
        };
        return OGCore.jobIdFor('KEN');
    }""")
    assert result == 'registry-id'


def test_failed_update_keeps_working_install(page, base_url):
    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator(".ogc-page")).to_be_visible()
    result = page.evaluate("""async () => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        OGCore.model = {
            calibrations: [{
                country_id: 'KEN', country_name: 'Kenya', install_state: 'installing'
            }],
            records: { KEN: {
                country_id: 'KEN', country_name: 'Kenya', install_state: 'installing',
                install_id: 'install_ken', venv_path: '/models/OG-KEN/.venv'
            } },
        };
        $('#ogcGrid').html(OGCore.cardHtml(
            OGCore.model.calibrations[0], OGCore.model.records.KEN
        ));
        OGCore.openLog('KEN', true);
        let refreshed = false;
        OGCore.refresh = () => { refreshed = true; };
        OGCore.applyJob('KEN', {
            country_id: 'KEN', country_name: 'Kenya', install_state: 'failed',
            log_tail: ['update failed'], error: 'update failed'
        }, OGCore.pageID);
        return {
            badge: $('#ogcGrid .ogc-badge').text(),
            action: $('#ogcGrid [data-act="log"]').text(),
            heading: $('#ogcModalHead').text(),
            retryUpdate: $('#ogcModalFoot [data-act="retry-update-modal"]').length,
            retryInstall: $('#ogcModalFoot [data-act="retry-modal"]').length,
            lastError: OGCore.model.records.KEN.last_error,
            refreshed,
        };
    }""")
    assert result['badge'] == 'installed'
    assert 'View update error' in result['action']
    assert 'update failed' in result['heading']
    assert result['retryUpdate'] == 1
    assert result['retryInstall'] == 0
    assert result['lastError'] == 'update failed'
    assert result['refreshed'] is True


def test_navigation_invalidates_old_og_page_load(page, base_url):
    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator(".ogc-page")).to_be_visible()
    old_page_id = page.evaluate("""async () => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        return OGCore.pageID;
    }""")
    page.evaluate("""async () => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        OGCore.invalidatePage();
    }""")
    result = page.evaluate("""async (oldPageID) => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        return { old_is_current: OGCore.isCurrent(oldPageID), new_page_id: OGCore.pageID };
    }""", old_page_id)
    assert result['old_is_current'] is False
    assert result['new_page_id'] > old_page_id


def test_og_page_survives_round_trip_navigation(page, base_url):
    """OG -> CLEWS -> OG must re-render the grid; a stale PAGE_ID would leave it empty."""
    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator(".ogc-addcard")).to_be_visible()
    page.evaluate("window.__stamp = 'og1'")

    page.goto(f"{base_url}/#/Config")
    expect(page.locator("body.osy-mode-clews")).to_have_count(1)
    # #osy-title is shared across CLEWS views; waiting for it works around a real
    # router race where a late .load() callback can paint the previous view over
    # the current OGCore view.
    expect(page.locator("#osy-title")).to_be_visible()

    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator("body.osy-mode-og")).to_have_count(1)
    # if the stamp is gone the browser reloaded, and the test is not exercising
    # a round trip within one document — which is the whole point
    assert page.evaluate("window.__stamp") == 'og1'
    expect(page.locator(".ogc-page")).to_be_visible()
    # the last thing renderGrid appends: present only if the reload was not
    # discarded as stale work from the previous visit
    expect(page.locator(".ogc-addcard")).to_be_visible()


def test_polling_stops_when_leaving_og_page(page, base_url):
    """No OG-Core requests continue after leaving the OG page."""
    page.goto(f"{base_url}/#/OGCore")
    expect(page.locator(".ogc-addcard")).to_be_visible()

    calls = []
    page.on("request", lambda r: calls.append(r.url) if "/ogc/" in r.url else None)

    # a bogus id produces an observable OG-Core request before the page is left.
    # This test covers the no-traffic guarantee; the page-ID bump mechanism is
    # covered by test_navigation_invalidates_old_og_page_load.
    page.evaluate("""async () => {
        const { default: OGCore } = await import(new URL('App/Controller/OGCore.js', location.href).href);
        OGCore.pollJob('KEN', 'no-such-job', OGCore.pageID);
        location.hash = '#/Config';
    }""")
    expect(page.locator("body.osy-mode-clews")).to_have_count(1)
    assert len(calls) > 0, "pollJob issued no request; the test would pass vacuously"
    settled = len(calls)
    page.wait_for_timeout(8_000)          # > 2x POLL_MS (3500)
    assert len(calls) == settled, f"polling outlived the page: {calls[settled:]}"
def test_og_workspace_routes_assert_og_mode(page, base_url):
    page.goto(base_url)
    page.evaluate("""localStorage.setItem('osy-ogc-country', JSON.stringify({
        country_id: 'ETH', country_name: 'Ethiopia'
    }))""")
    page.goto(f"{base_url}/#/OGCases")
    expect(page.locator("body.osy-mode-og")).to_have_count(1)
    expect(page.locator("body.osy-og-workspace")).to_have_count(1)
    expect(page.locator("#ogcCasesPage")).to_be_visible()
    expect(page.locator("#Navi > li.nav-og-workspace:visible")).to_have_count(2)
    expect(page.locator("#ogcCasesPage [data-act='run']")).to_have_count(0)
    page.goto(f"{base_url}/#/OGRuns")
    expect(page.locator("body.osy-mode-og.osy-og-workspace")).to_have_count(1)
    expect(page.locator("#ogcRunsPage")).to_be_visible()
    page.goto(f"{base_url}/#/OGParameters")
    expect(page.locator("body.osy-mode-og")).to_have_count(1)
    expect(page.locator("#ogcParamsPage")).to_be_visible()


def test_country_workspace_filters_cases(page, base_url):
    page.goto(base_url)
    result = page.evaluate("""async () => {
        const { Model } = await import(new URL('App/Model/OGCases.Model.js', location.href).href);
        const model = new Model([
            { casename: 'ethiopia-case', country_id: 'ETH' },
            { casename: 'south-africa-case', country_id: 'ZAF' }
        ], {}, [{ country_id: 'ETH' }, { country_id: 'ZAF' }], 'ETH');
        return model.cases.map(c => c.casename);
    }""")
    assert result == ['ethiopia-case']


def test_ogc_adapter_matches_run_backend_contract(page, base_url):
    page.goto(base_url)
    result = page.evaluate("""async () => {
        const { Ogc } = await import(new URL('Classes/Ogc.Class.js', location.href).href);
        const calls = [];
        Ogc._request = async (type, path, data) => {
            calls.push({type, path, data});
            if (path === 'ogc/getRuns') {
                return {
                    baseline: {RunName: 'base', RunType: 'baseline', status: 'completed'},
                    reforms: [{RunName: 'reform', RunType: 'reform', baseline_run_name: 'base', status: 'pending'}]
                };
            }
            if (path === 'ogc/getParams') return {debt_ratio_ss: [[0.4]]};
            return {status_code: 'success'};
        };
        await Ogc.saveCase({casename: 'case-one', description: 'd', country_id: 'ETH'});
        await Ogc.createRun({casename: 'case-one', run_name: 'reform', run_type: 'reform', baseline_run: 'base'});
        await Ogc.cancelRun('case-one', 'reform');
        const runs = await Ogc.getRuns('case-one');
        const params = await Ogc.getParams('case-one', 'reform');
        return {calls, runs, params};
    }""")
    assert result['calls'][0]['data'] == {
        'data': {'ogc-casename': 'case-one', 'ogc-description': 'd', 'country_id': 'ETH'}
    }
    assert result['calls'][1]['data']['baseline_run_name'] == 'base'
    assert result['calls'][2]['data'] == {'casename': 'case-one', 'run_name': 'reform'}
    assert result['runs']['runs'][0]['run_name'] == 'base'
    assert result['runs']['runs'][1]['baseline_run'] == 'base'
    assert result['params']['params']['debt_ratio_ss'] == [[0.4]]


def test_add_case_dialog_switches_between_baseline_and_reform(page, base_url):
    page.goto(base_url)
    page.evaluate("""localStorage.setItem('osy-ogc-country', JSON.stringify({
        country_id: 'ETH', country_name: 'Ethiopia'
    }))""")
    page.goto(f"{base_url}/#/OGCases")
    expect(page.locator("#ogcCasesPage")).to_be_visible()
    page.evaluate("""async () => {
        const { default: Cases } = await import(new URL('App/Controller/OGCases.js', location.href).href);
        const { Model } = await import(new URL('App/Model/OGCases.Model.js', location.href).href);
        Cases.workspace = {country_id: 'ETH', country_name: 'Ethiopia'};
        Cases.model = new Model(
            [{casename: 'Baseline 1', country_id: 'ETH'}],
            {'Baseline 1': [{run_name: 'baseline', run_type: 'baseline'}]},
            [{country_id: 'ETH'}], 'ETH'
        );
        Cases.initEvents();
        Cases.openNewCase();
    }""")

    expect(page.locator("#ogcCasesModalHead")).to_have_text("Add a case")
    expect(page.locator("[data-act='case-type'][data-type='baseline']")).to_have_class("active")
    expect(page.locator("#ogcCaseName")).to_have_value("Baseline 2")
    expect(page.locator("#ogcCaseBaseWrap")).to_be_hidden()
    expect(page.locator("[data-act='new-case-confirm']")).to_have_text("Create and edit")

    page.locator("[data-act='case-type'][data-type='reform']").click()
    expect(page.locator("#ogcCaseName")).to_have_value("New reform")
    expect(page.locator("#ogcCaseBaseWrap")).to_be_visible()
    expect(page.locator("#ogcCaseBaseline option")).to_have_text("Baseline 1")
    expect(page.locator("#ogcCaseNote")).to_contain_text("inherits this baseline's values")


def test_create_reform_opens_parameters_for_the_selected_baseline(page, base_url):
    page.goto(base_url)
    page.evaluate("""localStorage.setItem('osy-ogc-country', JSON.stringify({
        country_id: 'ETH', country_name: 'Ethiopia'
    }))""")
    page.goto(f"{base_url}/#/OGCases")
    expect(page.locator("#ogcCasesPage")).to_be_visible()
    page.evaluate("""async () => {
        const { default: Cases } = await import(new URL('App/Controller/OGCases.js', location.href).href);
        const { Model } = await import(new URL('App/Model/OGCases.Model.js', location.href).href);
        const { Ogc } = await import(new URL('Classes/Ogc.Class.js', location.href).href);
        Cases.workspace = {country_id: 'ETH', country_name: 'Ethiopia'};
        Cases.model = new Model(
            [{casename: 'Policy baseline', country_id: 'ETH'}],
            {'Policy baseline': [{run_name: 'baseline', run_type: 'baseline'}]},
            [{country_id: 'ETH'}], 'ETH'
        );
        window.__newCaseCalls = [];
        Ogc.saveCase = async () => { throw new Error('A reform must not create a case container'); };
        Ogc.createRun = async data => {
            window.__newCaseCalls.push(data);
            return {status_code: 'success'};
        };
        Cases.initEvents();
        Cases.openNewCase('reform');
    }""")
    page.locator("#ogcCaseName").fill("Corporate tax cut")
    page.locator("#ogcCaseDesc").fill("Reduce the corporate income tax rate")
    page.locator("[data-act='new-case-confirm']").click()
    page.wait_for_url("**/#/OGParameters")

    result = page.evaluate("""({
        calls: window.__newCaseCalls,
        selection: JSON.parse(localStorage.getItem('osy-ogc-selection'))
    })""")
    assert result['calls'] == [{
        'casename': 'Policy baseline',
        'run_name': 'Corporate tax cut',
        'run_type': 'reform',
        'baseline_run': 'baseline',
        'description': 'Reduce the corporate income tax rate',
    }]
    assert result['selection'] == {
        'casename': 'Policy baseline',
        'run_name': 'Corporate tax cut',
        'run_type': 'reform',
        'baseline_run': 'baseline',
        'country_id': 'ETH',
        'display_name': 'Corporate tax cut',
        'baseline_display_name': 'Policy baseline',
    }


def test_run_queue_orders_dependencies_and_marks_cache(page, base_url):
    page.goto(base_url)
    result = page.evaluate("""async () => {
        const { default: Runs } = await import(new URL('App/Controller/OGRuns.js', location.href).href);
        const c = {casename: 'ethiopia-case'};
        const base = {case: c, key: 'ethiopia-case:base', name: 'Base', run: {
            run_name: 'base', run_type: 'baseline', status: 'pending'
        }};
        const reform = {case: c, key: 'ethiopia-case:reform', name: 'Reform', run: {
            run_name: 'reform', run_type: 'reform', baseline_run: 'base', status: 'pending'
        }};
        const dependency = Runs.buildQueue([reform, base], {'ethiopia-case:reform': true}, false);
        base.run.status = 'completed';
        reform.run.status = 'completed';
        const cached = Runs.buildQueue([reform, base], {
            'ethiopia-case:reform': true, 'ethiopia-case:base': true
        }, false);
        base.stale = true;
        const invalidated = Runs.buildQueue([reform, base], {'ethiopia-case:reform': true}, false);
        return {
            dependency: dependency.map(j => [j.entry.run.run_name, j.state, !!j.note]),
            cached: cached.map(j => [j.entry.run.run_name, j.state]),
            invalidated: invalidated.map(j => [j.entry.run.run_name, j.state])
        };
    }""")
    assert result['dependency'] == [['base', 'queued', True], ['reform', 'queued', False]]
    assert result['cached'] == [['base', 'cached'], ['reform', 'cached']]
    assert result['invalidated'] == [['base', 'queued'], ['reform', 'queued']]


def test_runs_are_read_from_the_grouped_shape(page, base_url):
    """getRuns answers {baseline: [...], reform: [...]}, not a flat list. Reading
    it as a list finds no runs and every case renders as empty."""
    page.goto(base_url)
    result = page.evaluate("""async () => {
        const { Model } = await import(new URL('App/Model/OGCases.Model.js', location.href).href);
        const grouped = {
            c1: {
                baseline: [{ run_name: 'base', run_type: 'baseline', status: 'completed' }],
                reform: [{ run_name: 'rf', run_type: 'reform', baseline_run: 'base', status: 'pending' }]
            }
        };
        const m = new Model([{ casename: 'c1', country_id: 'ETH' }], grouped, [{ country_id: 'ETH' }]);
        // a flat list must keep working too, so a backend change cannot blank the page
        const flat = new Model(
            [{ casename: 'c1', country_id: 'ETH' }],
            { c1: [{ run_name: 'base', run_type: 'baseline' }] },
            [{ country_id: 'ETH' }]
        );
        // an unknown group key is still a run the user made
        const extra = new Model(
            [{ casename: 'c1', country_id: 'ETH' }],
            { c1: { baseline: [{ run_name: 'b', run_type: 'baseline' }],
                    something_new: [{ run_name: 'x', run_type: 'other' }] } },
            [{ country_id: 'ETH' }]
        );
        const c = m.cases[0];
        return {
            total: c.runs.length,
            baselines: Model.baselines(c.runs).map(r => r.run_name),
            reforms: Model.reformsOf(c.runs, 'base').map(r => r.run_name),
            baseline_done: Model.baselineDone(c.runs, 'base'),
            flat_total: flat.cases[0].runs.length,
            extra_total: extra.cases[0].runs.length
        };
    }""")
    assert result['total'] == 2, "the grouped shape must be flattened, not dropped"
    assert result['baselines'] == ['base']
    assert result['reforms'] == ['rf']
    assert result['baseline_done'] is True
    assert result['flat_total'] == 1, "a flat array must still be accepted"
    assert result['extra_total'] == 2, "an unfamiliar group key must not lose its runs"


def test_suffix_families_are_grouped_and_locked(page, base_url):
    """OG-Core carries whole families of derived parameters (_preTP, _ge) that a
    calibration can extend. Naming each one would go stale, so the suffix rules
    file them as read-only reference data."""
    page.goto(f"{base_url}/#/OGParameters")
    result = page.evaluate("""async () => {
        const m = await import(new URL('App/Model/OGParams.Overlay.js', location.href).href);
        const mk = n => m.decorate(n, { title: n, shape: 'time', default: [[1]] });
        return {
            preTP: mk('omega_preTP'),
            ge: mk('cit_rate_ge'),
            // a name the rules do not match still falls through to the default
            plain: mk('some_future_param'),
            // an explicit mapping must win over a suffix rule
            explicit: m.decorate('omega_S_preTP', { title: 'x', shape: 'time', default: [[1]] })
        };
    }""")
    for key in ('preTP', 'ge'):
        assert result[key]['group'] == 'arrays', f"{key} should be reference data"
        assert result[key]['readOnly'] is True, f"{key} is derived, not a lever"
        assert result[key]['readOnlyReason'] == 'calibration'
    # an unmatched name keeps the old fallback behaviour
    assert result['plain']['group'] == 'advanced'
    assert result['plain']['readOnly'] is False
    # a name that is both explicitly mapped and suffix-matched stays read-only
    assert result['explicit']['readOnly'] is True


def test_parameters_page_without_a_selection_is_empty(page, base_url):
    """No run selected: the page must say so rather than call the backend."""
    page.goto(f"{base_url}/#/OGParameters")
    expect(page.locator("#ogcParamsPage")).to_be_visible()
    expect(page.locator("#ogcParamsEmpty")).to_be_visible()
    expect(page.locator("#ogcParamsEmptyTitle")).to_have_text("No run selected")
    expect(page.locator("#ogcParamsEditbar")).to_be_hidden()


def test_parameter_metadata_stays_compact(page, base_url):
    page.goto(base_url)
    result = page.evaluate("""async () => {
        const { default: Parameters } = await import(
            new URL('App/Controller/OGParameters.js', location.href).href
        );
        const description = 'Parameter summarizing the quadratic effect of debt.';
        const bounded = {
            name: 'bounded', title: 'Bounded parameter', description,
            help: '', hasRange: true, min: 0, max: 1, readOnly: false
        };
        const broad = {
            name: 'broad', title: 'Broad parameter', description,
            help: '', hasRange: true, min: -99000000000, max: 99000000000,
            readOnly: false
        };
        return {
            label: Parameters.labelHtml(bounded),
            boundedHint: Parameters.hintHtml(bounded),
            broadHint: Parameters.hintHtml(broad),
            boundedSlider: Parameters.hasUsefulRange(bounded),
            broadSlider: Parameters.hasUsefulRange(broad)
        };
    }""")
    assert result['label'].find(result_description := 'Parameter summarizing the quadratic effect of debt.') >= 0
    assert result_description not in result['boundedHint']
    assert 'default' not in result['boundedHint']
    assert 'range [0, 1]' in result['boundedHint']
    assert result['broadHint'] == ''
    assert result['boundedSlider'] is True
    assert result['broadSlider'] is False


def test_time_paths_are_editable(page, base_url):
    page.goto(base_url)
    result = page.evaluate("""async () => {
        const { Model } = await import(new URL('App/Model/OGParameters.Model.js', location.href).href);
        const { default: Parameters } = await import(
            new URL('App/Controller/OGParameters.js', location.href).href
        );
        const model = new Model(
            {
                start_year: {title: 'Start year', type: 'year', shape: 'scalar', default: 2025, min: 2013, max: 2101},
                tau_payroll: {title: 'Payroll tax', description: 'API description', type: 'rate', shape: 'time', default: [0.18], min: 0, max: 0.99}
            },
            {},
            {casename: 'c1', run_name: 'reform', run_type: 'reform', baseline_run: 'base'},
            {}
        );
        const html = Parameters.fieldHtml(model, 'tau_payroll');
        model.cur.tau_payroll = [0.18, 0.2];
        return {
            editable: model.editable('tau_payroll'),
            html,
            payload: model.savePayload(),
            field: model.fields.tau_payroll
        };
    }""")
    assert result['editable'] is True
    assert 'data-role="path-cell"' in result['html']
    assert '2025' in result['html']
    assert 'API description' in result['html']
    assert 'readOnlyNote' not in result['field']
    assert result['payload'] == {'tau_payroll': [0.18, 0.2]}


def test_overlay_keeps_schema_facts_and_adds_decisions(page, base_url):
    """The overlay must not overwrite title/range/default, only add what the
    schema cannot express (read-only status, dimension, group)."""
    page.goto(f"{base_url}/#/OGParameters")
    result = page.evaluate("""async () => {
        const m = await import(new URL('App/Model/OGParams.Overlay.js', location.href).href);
        // a plain scalar policy lever
        const cit = m.decorate('cit_rate', {
            title: 'Corporate income tax rate', description: 'd',
            section: 'Fiscal', subsection: null, type: 'rate', shape: 'scalar',
            default: [[0.21]], min: 0, max: 0.99
        });
        // a structural dimension the run layer refuses to differ on
        const S = m.decorate('S', {
            title: 'Max age', type: 'count', shape: 'scalar',
            default: [[80]], min: 3, max: 80
        });
        // a value the backend dropped for size
        const e = m.decorate('e', {
            title: 'Earnings ability', shape: 'time', default: null, large: true
        });
        // a per-group row the schema reports only as "time"
        const beta = m.decorate('beta_annual', {
            title: 'Time preference', shape: 'time',
            default: [[0.96, 0.96]], min: 0, max: 0.9999
        });
        // a name the overlay does not know at all
        const unknown = m.decorate('some_new_param', {
            title: 'New', shape: 'scalar', default: [[1]]
        });
        return { cit, S, e, beta, unknown };
    }""")
    # schema facts survive
    assert result['cit']['title'] == 'Corporate income tax rate'
    assert result['cit']['min'] == 0 and result['cit']['max'] == 0.99
    # decorate passes the schema default through untouched; unwrapping the
    # broadcast form is OGParameters.Model.normalise's job, not the overlay's
    assert result['cit']['def'] == [[0.21]]
    assert result['cit']['readOnly'] is False
    assert result['cit']['group'] == 'taxes'
    # structural dimensions are locked, with the run-guard reason
    assert result['S']['readOnly'] is True
    assert result['S']['readOnlyReason'] == 'structural'
    # a dropped value can never be an editable field
    assert result['e']['large'] is True
    assert result['e']['readOnly'] is True
    # the overlay supplies the dimension the schema collapsed to "time"
    assert result['beta']['dimension'] == 'by_j'
    assert result['cit']['dimension'] == 'scalar'
    # an unknown name still renders, it just lands in the fallback group
    assert result['unknown']['readOnly'] is False
    assert result['unknown']['group'] == 'advanced'


def test_reform_reads_against_its_baseline_not_the_default(page, base_url):
    """A reform's delta reference is its baseline's saved value; a baseline's is
    the calibration default. Getting this backwards changes the question asked."""
    page.goto(f"{base_url}/#/OGParameters")
    result = page.evaluate("""async () => {
        const { Model } = await import(new URL('App/Model/OGParameters.Model.js', location.href).href);
        const schema = { cit_rate: {
            title: 'Corporate income tax rate', type: 'rate', shape: 'scalar',
            default: [[0.21]], min: 0, max: 0.99
        } };
        // baseline moved the calibration default 0.21 -> 0.25
        // reform moved its baseline 0.25 -> 0.15
        const reform = new Model(
            schema,
            { cit_rate: [[0.15]] },
            { casename: 'c1', run_name: 'rf', run_type: 'reform', baseline_run: 'base' },
            { cit_rate: [[0.25]] }
        );
        const baseline = new Model(
            schema,
            { cit_rate: [[0.25]] },
            { casename: 'c1', run_name: 'base', run_type: 'baseline' },
            {}
        );
        return {
            reform_ref_auto: reform.refValue('cit_rate', 'auto'),
            reform_ref_def: reform.refValue('cit_rate', 'def'),
            reform_cur: reform.cur.cit_rate,
            reform_changed_vs_own: reform.isChanged('cit_rate', 'auto'),
            reform_payload: reform.savePayload(),
            baseline_ref_auto: baseline.refValue('cit_rate', 'auto'),
            baseline_payload: baseline.savePayload()
        };
    }""")
    # the reform is measured against the baseline's 0.25, not the default 0.21
    assert result['reform_ref_auto'] == 0.25
    assert result['reform_ref_def'] == 0.21
    assert result['reform_cur'] == 0.15
    assert result['reform_changed_vs_own'] is True
    # editable scalars are saved in the schema's native scalar shape
    assert result['reform_payload'] == {'cit_rate': 0.15}
    # a baseline is measured against the calibration default
    assert result['baseline_ref_auto'] == 0.21
    assert result['baseline_payload'] == {'cit_rate': 0.25}


def test_preview_reference_does_not_change_what_is_saved(page, base_url):
    """Pointing the deltas at another run is a look, not a re-attachment: the
    saved payload is still computed against the run's true reference."""
    page.goto(f"{base_url}/#/OGParameters")
    result = page.evaluate("""async () => {
        const { Model } = await import(new URL('App/Model/OGParameters.Model.js', location.href).href);
        const m = new Model(
            { cit_rate: { title: 'c', type: 'rate', shape: 'scalar',
                          default: [[0.21]], min: 0, max: 0.99 } },
            { cit_rate: [[0.15]] },
            { casename: 'c1', run_name: 'rf', run_type: 'reform', baseline_run: 'base' },
            { cit_rate: [[0.15]] }          // baseline already at 0.15
        );
        // against its own baseline nothing moved, so nothing is saved
        const unchanged = m.isChanged('cit_rate', 'auto');
        const payloadBefore = m.savePayload();
        // previewing against the calibration default shows a difference
        const previewChanged = m.isChanged('cit_rate', 'def');
        const payloadAfter = m.savePayload();
        return { unchanged, payloadBefore, previewChanged, payloadAfter };
    }""")
    assert result['unchanged'] is False
    assert result['payloadBefore'] == {}
    # the preview shows a delta ...
    assert result['previewChanged'] is True
    # ... but changes nothing about what would be written
    assert result['payloadAfter'] == {}


def test_locked_dimensions_are_never_editable(page, base_url):
    """RunJob refuses a reform whose S/T/J/M/I differ from its baseline, so the
    form must not offer them even though the schema gives them a range."""
    page.goto(f"{base_url}/#/OGParameters")
    result = page.evaluate("""async () => {
        const { Model } = await import(new URL('App/Model/OGParameters.Model.js', location.href).href);
        const { LOCKED_DIMS } = await import(new URL('App/Model/OGParams.Overlay.js', location.href).href);
        const schema = {};
        LOCKED_DIMS.forEach(d => {
            schema[d] = { title: d, type: 'count', shape: 'scalar',
                          default: [[10]], min: 1, max: 1000 };
        });
        schema.cit_rate = { title: 'c', type: 'rate', shape: 'scalar',
                            default: [[0.21]], min: 0, max: 0.99 };
        const m = new Model(schema, {}, { casename: 'c1', run_name: 'base', run_type: 'baseline' }, {});
        const locked = {};
        LOCKED_DIMS.forEach(d => { locked[d] = m.editable(d); });
        return { locked, dims: LOCKED_DIMS, cit_editable: m.editable('cit_rate') };
    }""")
    # the five the run layer compares
    assert sorted(result['dims']) == ['I', 'J', 'M', 'S', 'T']
    assert all(v is False for v in result['locked'].values()), result['locked']
    # a normal lever is still editable, so the lock is not blanket
    assert result['cit_editable'] is True
