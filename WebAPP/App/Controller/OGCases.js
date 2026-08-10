import { Message } from "../../Classes/Message.Class.js";
import { Ogc } from "../../Classes/Ogc.Class.js";
import { Model } from "../Model/OGCases.Model.js";

//values from the backend render into markup, escape them
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

//run status -> [css class, label]
const STATUS = {
    'completed': ['ogc-tag-done', 'has results'],
    'running': ['ogc-tag-run', 'running'],
    'pending': ['ogc-tag-mut', 'not run'],
    'failed': ['ogc-tag-need', 'failed'],
    'cancelled': ['ogc-tag-mut', 'cancelled']
};

//async work from an older page visit must not repaint the new page
let PAGE_ID = 0;

//the case and run the parameters page opens, handed over through localStorage so
//a reload of the parameters page keeps its context
const SEL_KEY = 'osy-ogc-selection';

export function saveSelection(sel){
    if (sel){
        localStorage.setItem(SEL_KEY, JSON.stringify(sel));
    }else{
        localStorage.removeItem(SEL_KEY);
    }
}

export function loadSelection(){
    try { return JSON.parse(localStorage.getItem(SEL_KEY)) || null; }
    catch (e) { return null; }
}

export default class OGCases {

    static onLoad(){
        PAGE_ID++;
        OGCases.pageID = PAGE_ID;
        OGCases.refresh(true, PAGE_ID);
    }

    static isCurrent(pageID){
        return pageID == PAGE_ID;
    }

    // Load the cases, then every case's runs, and render one table.
    static refresh(initEvents, pageID){
        Promise.all([Ogc.getCases(), Ogc.getInstalledCalibrations()])
        .then(data => {
            if (!OGCases.isCurrent(pageID)){
                return;
            }
            let [cases, installed] = data;
            let list = cases.cases || [];
            //runs come per case, so fetch them together and key by case name; a
            //case whose runs cannot be read still renders, with no runs
            return Promise.all($.map(list, function (c) {
                return Ogc.getRuns(c.casename)
                    .then(r => ({ casename: c.casename, runs: r.runs || [] }))
                    .catch(e => ({ casename: c.casename, runs: [] }));
            }))
            .then(runResults => {
                if (!OGCases.isCurrent(pageID)){
                    return;
                }
                let runsByCase = {};
                $.each(runResults, function (id, r) { runsByCase[r.casename] = r.runs; });
                OGCases.model = new Model(list, runsByCase, installed.calibrations);
                OGCases.render(OGCases.model, pageID);
                if (initEvents){
                    OGCases.initEvents();
                }
            });
        })
        .catch(error => {
            if (!OGCases.isCurrent(pageID)){
                return;
            }
            Message.danger(error);
            OGCases.model = new Model([], {}, []);
            OGCases.render(OGCases.model, pageID);
            if (initEvents){
                OGCases.initEvents();
            }
        });
    }

    static render(model, pageID){
        if (!OGCases.isCurrent(pageID)){
            return;
        }
        let rows = '';
        $.each(model.cases, function (id, c) {
            rows += OGCases.caseRows(c);
        });
        if (!rows){
            rows = `<tr><td class="ogc-empty-cell" colspan="5">No cases yet. Create one to start configuring a baseline.</td></tr>`;
        }
        $('#ogcCaseRows').html(rows);
        //a case needs an installed calibration to be created at all
        $('[data-act="new-case"]').prop('disabled', model.installed.length == 0);
        if (model.installed.length == 0){
            $('#ogcCasesNote').show();
        }else{
            $('#ogcCasesNote').hide();
        }
    }

    // One case header row, then a row per run under it.
    static caseRows(c){
        let countryTag = c.installed
            ? `<span class="ogc-tag ogc-tag-mut">${esc(c.country_id)}</span>`
            : `<span class="ogc-tag ogc-tag-need" title="This calibration is no longer installed">${esc(c.country_id)} missing</span>`;
        let html = `
            <tr data-case="${esc(c.casename)}">
                <td><i class="fa fa-folder-open-o"></i> <b>${esc(c.casename)}</b></td>
                <td>${countryTag}</td>
                <td class="ogc-mut">${esc(c.description)}</td>
                <td class="ogc-mut">${esc(c.modified_at)}</td>
                <td class="ogc-actcell">
                    <button class="btn ogc-btn ogc-btn-sm" data-act="new-run" data-case="${esc(c.casename)}"><i class="fa fa-plus"></i> Add run</button>
                    <button class="btn ogc-btn ogc-btn-ico" data-act="del-case" data-case="${esc(c.casename)}" title="Delete case"><i class="fa fa-times"></i></button>
                </td>
            </tr>`;

        let baselines = Model.baselines(c.runs);
        if (!baselines.length && !c.runs.length){
            html += `<tr><td class="ogc-empty-cell ogc-rowsub" colspan="5">No runs yet. Add a baseline to configure parameters.</td></tr>`;
            return html;
        }
        $.each(baselines, function (id, b) {
            html += OGCases.runRow(c, b, false);
            $.each(Model.reformsOf(c.runs, b.run_name), function (rid, r) {
                html += OGCases.runRow(c, r, true);
            });
        });
        //a reform whose baseline was deleted would otherwise vanish silently
        $.each(Model.orphanReforms(c.runs), function (id, r) {
            html += OGCases.runRow(c, r, true, true);
        });
        return html;
    }

    static runRow(c, run, indent, orphan){
        let status = STATUS[run.status] || ['ogc-tag-mut', run.status || 'not run'];
        let kindTag = run.run_type == 'reform'
            ? `<span class="ogc-tag ogc-tag-reform">reform</span>`
            : `<span class="ogc-tag ogc-tag-base">baseline</span>`;
        //a reform cannot be solved until its baseline has completed; surfaced here
        //because the run layer refuses it anyway
        let needs = '';
        if (run.run_type == 'reform'){
            if (orphan){
                needs = ` <span class="ogc-tag ogc-tag-need" title="Its baseline no longer exists">baseline missing</span>`;
            }else if (!Model.baselineDone(c.runs, run.baseline_run)){
                needs = ` <span class="ogc-tag ogc-tag-need" title="Run its baseline first">needs its baseline</span>`;
            }
        }
        let from = run.run_type == 'reform' ? esc(run.baseline_run) : '&mdash;';
        return `
            <tr data-case="${esc(c.casename)}" data-run="${esc(run.run_name)}">
                <td class="ogc-rowsub">${esc(run.run_name)}${needs}</td>
                <td>${kindTag}</td>
                <td class="ogc-mut">${from}</td>
                <td><span class="ogc-tag ${status[0]}">${esc(status[1])}</span></td>
                <td class="ogc-actcell">
                    <button class="btn ogc-btn ogc-btn-sm" data-act="params" data-case="${esc(c.casename)}" data-run="${esc(run.run_name)}"><i class="fa fa-sliders"></i> Parameters</button>
                    <button class="btn ogc-btn ogc-btn-ico" data-act="del-run" data-case="${esc(c.casename)}" data-run="${esc(run.run_name)}" title="Delete run"><i class="fa fa-times"></i></button>
                </td>
            </tr>`;
    }

    //dialog

    static openModal(head, body, foot, headClass){
        $('#ogcCasesModalHead').attr('class', 'ogc-box-head ' + (headClass || '')).html(head);
        $('#ogcCasesModalBody').html(body);
        $('#ogcCasesModalFoot').html(foot);
        $('#ogcCasesModal').show();
    }

    static closeModal(){
        $('#ogcCasesModal').hide();
    }

    static openNewCase(){
        let opts = '';
        $.each(OGCases.model.installed, function (id, r) {
            opts += `<option value="${esc(r.country_id)}">${esc(r.country_name)} (${esc(r.country_id)})</option>`;
        });
        let body = `
            <div class="ogc-formrow">
                <label>Case name</label>
                <input type="text" id="ogcCaseName" placeholder="e.g. corp-tax-2026" maxlength="64">
            </div>
            <div class="ogc-formrow">
                <label>Calibration</label>
                <select id="ogcCaseCountry" class="ogc-select">${opts}</select>
            </div>
            <div class="ogc-formrow">
                <label>Description</label>
                <input type="text" id="ogcCaseDesc" placeholder="optional">
            </div>
            <div id="ogcCaseErr"></div>`;
        let foot = `<button class="btn ogc-btn ogc-btn-line" data-act="close">Cancel</button>
                    <button class="btn ogc-btn ogc-btn-main" data-act="new-case-confirm"><i class="fa fa-plus"></i> Create case</button>`;
        OGCases.openModal(`<i class="fa fa-folder-open-o"></i> New case`, body, foot, '');
    }

    static newCaseConfirm(){
        let casename = $.trim($('#ogcCaseName').val());
        let countryId = $('#ogcCaseCountry').val();
        let desc = $.trim($('#ogcCaseDesc').val());
        if (!casename || !countryId){
            $('#ogcCaseErr').html(`<div class="ogc-checknote ogc-checknote-warn">Give the case a name and pick a calibration.</div>`);
            return;
        }
        let pageID = PAGE_ID;
        Ogc.saveCase({ casename: casename, country_id: countryId, description: desc })
        .then(response => {
            OGCases.closeModal();
            Message.smallBoxInfo('OG-Core', 'Case created.', 3000);
            if (OGCases.isCurrent(pageID)){
                OGCases.refresh(false, pageID);
            }
        })
        .catch(error => {
            $('#ogcCaseErr').html(`<div class="ogc-checknote ogc-checknote-warn"><i class="fa fa-times"></i> ${esc(error)}</div>`);
        });
    }

    static openNewRun(casename){
        let c = OGCases.findCase(casename);
        let baselines = c ? Model.baselines(c.runs) : [];
        let bopts = '';
        $.each(baselines, function (id, b) {
            bopts += `<option value="${esc(b.run_name)}">${esc(b.run_name)}</option>`;
        });
        //a reform needs a baseline to attach to, so without one only a baseline
        //can be created
        let canReform = baselines.length > 0;
        let body = `
            <div class="ogc-formrow">
                <label>Run name</label>
                <input type="text" id="ogcRunName" placeholder="e.g. baseline or corp-tax-cut" maxlength="64">
            </div>
            <div class="ogc-formrow">
                <label>Type</label>
                <select id="ogcRunType" class="ogc-select">
                    <option value="baseline">Baseline</option>
                    <option value="reform"${canReform ? '' : ' disabled'}>Reform${canReform ? '' : ' (needs a baseline first)'}</option>
                </select>
            </div>
            <div class="ogc-formrow" id="ogcRunBaseWrap" style="display: none;">
                <label>Reforms this baseline</label>
                <select id="ogcRunBaseline" class="ogc-select">${bopts}</select>
            </div>
            <div id="ogcRunErr"></div>`;
        let foot = `<button class="btn ogc-btn ogc-btn-line" data-act="close">Cancel</button>
                    <button class="btn ogc-btn ogc-btn-main" data-act="new-run-confirm"><i class="fa fa-plus"></i> Create run</button>`;
        OGCases.openModal(`<i class="fa fa-plus-circle"></i> New run in ${esc(casename)}`, body, foot, '');
        $('#ogcCasesModal').attr('data-case', casename);
    }

    static newRunConfirm(casename){
        let runName = $.trim($('#ogcRunName').val());
        let runType = $('#ogcRunType').val();
        let baseline = $('#ogcRunBaseline').val();
        if (!runName){
            $('#ogcRunErr').html(`<div class="ogc-checknote ogc-checknote-warn">Give the run a name.</div>`);
            return;
        }
        if (runType == 'reform' && !baseline){
            $('#ogcRunErr').html(`<div class="ogc-checknote ogc-checknote-warn">Pick the baseline this reform is built on.</div>`);
            return;
        }
        let payload = { casename: casename, run_name: runName, run_type: runType };
        if (runType == 'reform'){
            payload.baseline_run = baseline;
        }
        let pageID = PAGE_ID;
        Ogc.createRun(payload)
        .then(response => {
            OGCases.closeModal();
            Message.smallBoxInfo('OG-Core', 'Run created.', 3000);
            if (OGCases.isCurrent(pageID)){
                OGCases.refresh(false, pageID);
            }
        })
        .catch(error => {
            $('#ogcRunErr').html(`<div class="ogc-checknote ogc-checknote-warn"><i class="fa fa-times"></i> ${esc(error)}</div>`);
        });
    }

    static openDeleteCase(casename){
        let body = `<p>Delete the case <b>${esc(casename)}</b> and every run inside it, including any results? This cannot be undone.</p>`;
        let foot = `<button class="btn ogc-btn ogc-btn-line" data-act="close">Cancel</button>
                    <button class="btn ogc-btn ogc-btn-danger" data-act="del-case-confirm">Delete case</button>`;
        OGCases.openModal(`<i class="fa fa-exclamation-triangle"></i> Delete ${esc(casename)}?`, body, foot, 'ogc-head-err');
        $('#ogcCasesModal').attr('data-case', casename);
    }

    static openDeleteRun(casename, runName){
        let c = OGCases.findCase(casename);
        let reforms = c ? Model.reformsOf(c.runs, runName) : [];
        let warn = reforms.length
            ? `<p class="ogc-mut" style="margin-top:8px"><i class="fa fa-exclamation-triangle"></i> ${reforms.length} reform${reforms.length == 1 ? '' : 's'} built on this baseline will lose it and cannot be solved until reattached.</p>`
            : '';
        let body = `<p>Delete the run <b>${esc(runName)}</b> and its results? This cannot be undone.</p>${warn}`;
        let foot = `<button class="btn ogc-btn ogc-btn-line" data-act="close">Cancel</button>
                    <button class="btn ogc-btn ogc-btn-danger" data-act="del-run-confirm">Delete run</button>`;
        OGCases.openModal(`<i class="fa fa-exclamation-triangle"></i> Delete ${esc(runName)}?`, body, foot, 'ogc-head-err');
        $('#ogcCasesModal').attr('data-case', casename).attr('data-run', runName);
    }

    static deleteCaseConfirm(casename){
        let pageID = PAGE_ID;
        OGCases.closeModal();
        Ogc.deleteCase(casename)
        .then(response => {
            //a deleted case must not stay selected for the parameters page
            let sel = loadSelection();
            if (sel && sel.casename == casename){
                saveSelection(null);
            }
            Message.smallBoxInfo('OG-Core', 'Case deleted.', 3000);
            if (OGCases.isCurrent(pageID)){
                OGCases.refresh(false, pageID);
            }
        })
        .catch(error => Message.danger(error));
    }

    static deleteRunConfirm(casename, runName){
        let pageID = PAGE_ID;
        OGCases.closeModal();
        Ogc.deleteRun(casename, runName)
        .then(response => {
            let sel = loadSelection();
            if (sel && sel.casename == casename && sel.run_name == runName){
                saveSelection(null);
            }
            Message.smallBoxInfo('OG-Core', 'Run deleted.', 3000);
            if (OGCases.isCurrent(pageID)){
                OGCases.refresh(false, pageID);
            }
        })
        .catch(error => Message.danger(error));
    }

    //open the parameters page on one run

    static openParams(casename, runName){
        let c = OGCases.findCase(casename);
        if (c && !c.installed){
            Message.warning('The calibration for this case is not installed, so its parameters cannot be read.');
            return;
        }
        let run = null;
        $.each((c && c.runs) || [], function (id, r) {
            if (r.run_name == runName) run = r;
        });
        saveSelection({
            casename: casename,
            run_name: runName,
            run_type: run ? run.run_type : 'baseline',
            baseline_run: run ? (run.baseline_run || null) : null,
            country_id: c ? c.country_id : null
        });
        window.location.hash = '#/OGParameters';
    }

    static findCase(casename){
        let found = null;
        $.each(OGCases.model.cases, function (id, c) {
            if (c.casename == casename) found = c;
        });
        return found;
    }

    //events

    static initEvents(){
        $('#ogcCasesPage').off('click.ogcases').on('click.ogcases', '[data-act]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            let act = $(this).attr('data-act');
            let casename = $(this).attr('data-case');
            let runName = $(this).attr('data-run');
            if (act == 'new-case') OGCases.openNewCase();
            if (act == 'new-run') OGCases.openNewRun(casename);
            if (act == 'params') OGCases.openParams(casename, runName);
            if (act == 'del-case') OGCases.openDeleteCase(casename);
            if (act == 'del-run') OGCases.openDeleteRun(casename, runName);
        });

        $('#ogcCasesModal').off('click.ogcases').on('click.ogcases', '[data-act]', function (e) {
            e.preventDefault();
            let act = $(this).attr('data-act');
            let casename = $('#ogcCasesModal').attr('data-case');
            let runName = $('#ogcCasesModal').attr('data-run');
            if (act == 'close') OGCases.closeModal();
            if (act == 'new-case-confirm') OGCases.newCaseConfirm();
            if (act == 'new-run-confirm') OGCases.newRunConfirm(casename);
            if (act == 'del-case-confirm') OGCases.deleteCaseConfirm(casename);
            if (act == 'del-run-confirm') OGCases.deleteRunConfirm(casename, runName);
        });

        //the reform baseline picker only applies to a reform
        $('#ogcCasesModal').off('change.ogcases').on('change.ogcases', '#ogcRunType', function () {
            if ($(this).val() == 'reform'){
                $('#ogcRunBaseWrap').show();
            }else{
                $('#ogcRunBaseWrap').hide();
            }
        });

        //the dimmed backdrop closes the dialog
        $('#ogcCasesModal').off('click.ogcasesback').on('click.ogcasesback', function (e) {
            if (e.target === this) OGCases.closeModal();
        });
    }
}
