import { Message } from "../../Classes/Message.Class.js";
import { Ogc } from "../../Classes/Ogc.Class.js";
import { Model } from "../Model/OGCases.Model.js";
import { clearRunStale, isRunStale, loadWorkspace } from "./OGCases.js";

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const STATUS = {
    completed: ['ogc-tag-done', 'ran'], running: ['ogc-tag-run', 'running'],
    queued: ['ogc-tag-mut', 'queued'], pending: ['ogc-tag-mut', 'never run'],
    failed: ['ogc-tag-need', 'failed'], cancelled: ['ogc-tag-mut', 'cancelled'],
    cached: ['ogc-tag-done', 'cached'], blocked: ['ogc-tag-need', 'blocked']
};
let PAGE_ID = 0;

export default class OGRuns {
    static onLoad(){
        OGRuns.workspace = loadWorkspace();
        if (!OGRuns.workspace || !OGRuns.workspace.country_id){
            window.location.hash = '#/OGCore';
            return;
        }
        PAGE_ID++;
        OGRuns.pageID = PAGE_ID;
        OGRuns.selected = {};
        OGRuns.plan = [];
        OGRuns.running = false;
        OGRuns.cancelled = false;
        OGRuns.load(PAGE_ID);
        OGRuns.initEvents();
    }

    static isCurrent(pageID){
        return pageID == PAGE_ID && localStorage.getItem('osy-pageId') == 'OGRuns';
    }

    static load(pageID){
        return Ogc.getCases().then(cases => {
            let list = $.isArray(cases) ? cases : (cases.cases || []);
            list = $.grep(list, c => c.country_id == OGRuns.workspace.country_id);
            return Promise.all($.map(list, c => Ogc.getRuns(c.casename)
                .then(r => ({case: c, runs: r.runs || r || []}))
                .catch(() => ({case: c, runs: []}))));
        }).then(items => {
            if (!OGRuns.isCurrent(pageID)) return;
            OGRuns.items = items;
            OGRuns.entries = OGRuns.flatten(items);
            $.each(OGRuns.entries, function (id, e) {
                if (OGRuns.selected[e.key] === undefined) OGRuns.selected[e.key] = true;
            });
            OGRuns.render();
        }).catch(error => Message.danger(error));
    }

    static flatten(items){
        let entries = [];
        $.each(items || [], function (id, item) {
            let runs = new Model([], {}, [], null).flattenRuns(item.runs);
            $.each(runs, function (rid, run) {
                entries.push({
                    case: item.case, run: run,
                    key: item.case.casename + ':' + run.run_name,
                    stale: isRunStale(item.case.casename + ':' + run.run_name),
                    name: run.run_type == 'baseline' && run.run_name == 'baseline'
                        ? item.case.casename : run.run_name
                });
            });
        });
        return entries;
    }

    static render(){
        $('#ogcRunsTitle').text('Run');
        $('#ogcRunsSub').text("Pick the cases to solve. A reform waits for its baseline's results first; progress and logs come directly from OG-Core.");
        $('#ogcRunWorkspace').html(`<b>${esc(OGRuns.workspace.country_name)}</b> <span class="ogc-mono ogc-mut">${esc(OGRuns.workspace.country_id)}</span>`);
        let rows = '';
        let force = $('#ogcForceRun').prop('checked');
        $.each(OGRuns.entries || [], function (id, e) {
            let status = e.stale ? ['ogc-tag-need', 'needs run'] : (STATUS[e.run.status] || STATUS.pending);
            let cached = e.run.status == 'completed' && !e.stale && !force;
            let from = e.run.run_type == 'reform' ? e.run.baseline_run : '—';
            rows += `<tr data-key="${esc(e.key)}">
                <td><input type="checkbox" data-role="select-run" data-key="${esc(e.key)}"${OGRuns.selected[e.key] ? ' checked' : ''}${OGRuns.running ? ' disabled' : ''}></td>
                <td><b>${esc(e.name)}</b> <span class="ogc-tag ogc-tag-${e.run.run_type == 'reform' ? 'reform' : 'base'}">${esc(e.run.run_type)}</span></td>
                <td class="ogc-mut">${esc(from)}</td>
                <td><span class="ogc-run-state"><i class="fa fa-${e.run.status == 'completed' ? 'check-circle' : 'circle-o'}"></i> ${esc(status[1])}</span>${cached ? ' <span class="ogc-cache-tag">will use cached</span>' : ''}</td>
            </tr>`;
        });
        if (!rows) rows = '<tr><td class="ogc-empty-cell" colspan="4">No configured cases yet. Add one from Cases.</td></tr>';
        $('#ogcRunRows').html(rows);
        OGRuns.renderQueue();
        OGRuns.updateControls();
    }

    static renderQueue(){
        if (!OGRuns.plan.length){
            let history = '';
            $.each(OGRuns.entries || [], function (id, e) {
                if (e.run.status != 'completed' && e.run.status != 'failed') return;
                let s = STATUS[e.run.status] || STATUS.pending;
                history += `<button class="ogc-history-row" data-act="history" data-case="${esc(e.case.casename)}" data-run="${esc(e.run.run_name)}">
                    <span><i class="fa fa-caret-right"></i> <b>${esc(e.name)}</b> <span class="ogc-mut">${esc(e.run.run_type)}</span></span>
                    <span class="ogc-tag ${s[0]}">${esc(s[1])}</span></button>
                    <div class="ogc-history-log" data-history="${esc(e.key)}" style="display:none"></div>`;
            });
            $('#ogcQueueBody').html(history
                ? `<div class="ogc-queue-label">History</div>${history}`
                : '<div class="ogc-queue-empty">Nothing queued. Select cases on the left and press Run.</div>');
            return;
        }
        let html = OGRuns.running ? '<div class="ogc-queue-label">Now running</div>' : '<div class="ogc-queue-label">Last run</div>';
        $.each(OGRuns.plan, function (id, job) {
            let s = STATUS[job.state] || STATUS.pending;
            let active = job.state == 'running';
            let meta = [];
            if (job.stage) meta.push(job.stage);
            if (job.iteration) meta.push('iteration ' + job.iteration);
            if (job.error) meta.push(job.error);
            html += `<div class="ogc-job ${active ? 'ogc-job-active' : ''}">
                <div class="ogc-job-head"><b>${id + 1}. ${esc(job.entry.name)}</b><span class="ogc-tag ${s[0]}">${esc(s[1])}</span></div>
                ${meta.length ? `<div class="ogc-job-meta">${esc(meta.join(' · '))}</div>` : ''}
                ${job.note ? `<div class="ogc-job-meta">${esc(job.note)}</div>` : ''}
                ${job.log && job.log.length ? `<pre class="ogc-run-log">${esc(job.log.join('\n'))}</pre>` : ''}
            </div>`;
        });
        $('#ogcQueueBody').html(html);
    }

    static updateControls(){
        let count = 0;
        $.each(OGRuns.selected, function (key, selected) { if (selected) count++; });
        $('#ogcRunSelected').prop('disabled', OGRuns.running || !count)
            .html(`<i class="fa fa-play"></i> Run selected${count ? ' (' + count + ')' : ''}`);
        $('#ogcCancelRun').toggle(OGRuns.running).prop('disabled', !OGRuns.currentJob);
        $('#ogcForceRun, #ogcSelectAll').prop('disabled', OGRuns.running);
    }

    static buildQueue(entries, selected, force){
        let chosen = $.grep(entries || [], e => !!selected[e.key]);
        let byKey = {};
        $.each(entries || [], (id, e) => { byKey[e.key] = e; });
        let ordered = [], added = {};
        function add(entry, dependency){
            if (!entry || added[entry.key]) return;
            let invalidatedByBaseline = false;
            if (entry.run.run_type == 'reform'){
                let base = byKey[entry.case.casename + ':' + entry.run.baseline_run];
                invalidatedByBaseline = !!(base && base.stale);
                if (base && (base.run.status != 'completed' || base.stale || selected[base.key])){
                    add(base, !selected[base.key]);
                }
            }
            added[entry.key] = true;
            ordered.push({
                entry: entry,
                state: entry.run.status == 'completed' && !entry.stale && !invalidatedByBaseline && !force ? 'cached' : 'queued',
                note: dependency ? 'Added because a selected reform depends on it.' : '',
                log: []
            });
        }
        $.each(chosen, function (id, e) { add(e, false); });
        return ordered;
    }

    static async runSelected(){
        if (OGRuns.running) return;
        let force = $('#ogcForceRun').prop('checked');
        OGRuns.plan = OGRuns.buildQueue(OGRuns.entries, OGRuns.selected, force);
        OGRuns.running = true;
        OGRuns.cancelled = false;
        OGRuns.render();
        for (let i = 0; i < OGRuns.plan.length; i++){
            if (OGRuns.cancelled) break;
            let job = OGRuns.plan[i], e = job.entry;
            if (job.state == 'cached'){
                job.note = 'Existing completed results reused.';
                await OGRuns.readStatus(job);
                OGRuns.renderQueue();
                continue;
            }
            if (e.run.run_type == 'reform'){
                let base = OGRuns.findEntry(e.case.casename, e.run.baseline_run);
                let baseJob = $.grep(OGRuns.plan, j => j.entry.key == (base && base.key))[0];
                if ((baseJob && baseJob.state == 'failed') || (!baseJob && (!base || base.run.status != 'completed' || base.stale))){
                    job.state = 'blocked';
                    job.error = 'Its baseline did not complete.';
                    OGRuns.renderQueue();
                    continue;
                }
            }
            job.state = 'running';
            OGRuns.currentJob = job;
            OGRuns.renderQueue();
            OGRuns.updateControls();
            try {
                await Ogc.run(e.case.casename, e.run.run_name, false);
                await OGRuns.waitForTerminal(job);
            } catch (error) {
                job.state = 'failed';
                job.error = String(error);
            }
            OGRuns.currentJob = null;
            OGRuns.renderQueue();
        }
        OGRuns.running = false;
        OGRuns.currentJob = null;
        OGRuns.updateControls();
        await OGRuns.load(OGRuns.pageID);
        let failed = $.grep(OGRuns.plan, j => j.state == 'failed' || j.state == 'blocked').length;
        if (failed) Message.warning(failed + ' selected run' + (failed == 1 ? '' : 's') + ' did not complete.');
        else Message.smallBoxInfo('OG-Core', OGRuns.plan.length + ' selected run' + (OGRuns.plan.length == 1 ? '' : 's') + ' complete.', 4000);
    }

    static async waitForTerminal(job){
        while (OGRuns.isCurrent(OGRuns.pageID) && !OGRuns.cancelled){
            let status = await OGRuns.readStatus(job);
            OGRuns.renderQueue();
            if (status.run_state == 'completed'){
                job.state = 'completed';
                clearRunStale(job.entry.key);
                job.entry.stale = false;
                return;
            }
            if (status.run_state == 'failed' || status.run_state == 'cancelled'){
                job.state = 'failed';
                job.error = status.error || 'The run failed.';
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    static async readStatus(job){
        let e = job.entry;
        let status = await Ogc.getRunStatus(e.case.casename, e.run.run_name);
        job.stage = status.run_stage || '';
        job.iteration = status.run_iteration || null;
        job.log = $.isArray(status.run_log) ? status.run_log : [];
        job.error = status.error || job.error;
        return status;
    }

    static findEntry(casename, runName){
        let found = null;
        $.each(OGRuns.entries || [], function (id, e) {
            if (e.case.casename == casename && e.run.run_name == runName) found = e;
        });
        return found;
    }

    static async cancel(){
        OGRuns.cancelled = true;
        let job = OGRuns.currentJob;
        if (!job) return;
        try {
            await Ogc.cancelRun(job.entry.case.casename, job.entry.run.run_name);
            job.state = 'failed';
            job.error = 'Cancelled by user.';
        } catch (error) {
            Message.danger(error);
        }
        OGRuns.renderQueue();
    }

    static initEvents(){
        $('#ogcRunsPage').off('.ogruns')
        .on('change.ogruns', '[data-role="select-run"]', function () {
            OGRuns.selected[$(this).attr('data-key')] = $(this).prop('checked');
            OGRuns.updateControls();
        })
        .on('change.ogruns', '#ogcForceRun', function () { OGRuns.render(); })
        .on('click.ogruns', '[data-act]', async function (e) {
            e.preventDefault();
            let act = $(this).attr('data-act');
            if (act == 'run-selected') OGRuns.runSelected();
            if (act == 'cancel') OGRuns.cancel();
            if (act == 'select-all'){
                let select = !OGRuns.entries.every(e => OGRuns.selected[e.key]);
                $.each(OGRuns.entries, (id, entry) => { OGRuns.selected[entry.key] = select; });
                OGRuns.render();
            }
            if (act == 'history'){
                let box = $(this).next('.ogc-history-log');
                box.toggle();
                $(this).find('.fa-caret-right').toggleClass('ogc-rotated', box.is(':visible'));
                if (box.is(':visible') && !box.attr('data-loaded')){
                    box.text('Loading log…');
                    try {
                        let status = await Ogc.getRunStatus($(this).attr('data-case'), $(this).attr('data-run'));
                        let lines = $.isArray(status.run_log) ? status.run_log : [];
                        box.html(lines.length ? `<pre class="ogc-run-log">${esc(lines.join('\n'))}</pre>` : '<span class="ogc-mut">No log output recorded.</span>');
                        box.attr('data-loaded', '1');
                    } catch (error) { box.text(String(error)); }
                }
            }
        });
    }
}
