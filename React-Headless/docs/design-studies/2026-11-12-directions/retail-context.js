/* Pure exact-record selection. Source precedence is explicit and page-independent. */
globalThis.createRetailContext = function ({ownerId, accountIds, offerSources, holdingSources}) {
  const allowedAccounts = new Set(accountIds);
  const retailCodes = new Set(['CHK-ACQ','HYS-ACQ','CRC-ACQ','AUTO-ACQ','MTG-30','HEL-ACQ','PL-ACQ','INV-ACQ']);
  function select(sources, accountId, effectiveOwnerId, key) {
    if (!allowedAccounts.has(accountId) || effectiveOwnerId !== ownerId) return [];
    const rows = new Map();
    for (const source of sources) {
      for (const row of source.rows) {
        if (row.account !== accountId) continue;
        const id = key(row);
        if (!rows.has(id)) rows.set(id, {...row, captureSource: source.label});
      }
    }
    return [...rows.values()];
  }
  return {
    offersForAccount(accountId, effectiveOwnerId) {
      return select(offerSources, accountId, effectiveOwnerId, r => r.code)
        .filter(r => retailCodes.has(r.code))
        .sort((a,b) => (a.rank ?? 999) - (b.rank ?? 999) || b.value - a.value);
    },
    holdingsForAccount(accountId, effectiveOwnerId) {
      return select(holdingSources, accountId, effectiveOwnerId, r => r.id || r.name);
    }
  };
};

/* Retail relationship evidence uses the same captured account/product keys as Growth. */
globalThis.createRetailRelationshipContext = function (api) {
  const {state, E, compact, money, historyFor, offerTrend, offerLabels, fresh, modal, openForm, render} = api;
  const source = createRetailContext({
    ownerId: retailCohortData.ownerId,
    accountIds: [
      ...workspaceCapture.accounts.filter(a=>a.OwnerId===retailCohortData.ownerId).map(a=>a.Id),
      ...retailCohortData.profiles.map(r=>r.account),
      ...retailData.datasets.heatmap.map(r=>r.account)
    ],
    offerSources: [
      {rows: workspaceDC.datasets.offers, label: 'Original eligibility capture'},
      {rows: retailCohortData.offers, label: 'Cohort eligibility capture'},
      {rows: retailData.datasets.heatmap, label: 'Selected eligibility capture'}
    ],
    holdingSources: [
      {rows: retailCohortData.holdings, label: 'Captured CRM holdings'},
      {rows: retailData.datasets.holdings, label: 'Captured CRM holdings'}
    ]
  });
  const selections = new Map();
  const offers = id => source.offersForAccount(id, fresh().ownerId);
  const holdings = id => source.holdingsForAccount(id, fresh().ownerId);
  const selected = id => offers(id).find(r => r.code === selections.get(id)) || offers(id)[0];
  const label = r => offerLabels[r.code] || r.code;
  const attrs = r => `data-account="${E(r.account)}" data-code="${E(r.code)}"`;
  function actions(r) {
    return `<div class="rc-actions"><button class="primary" data-rc="task" ${attrs(r)}>Prepare follow-up</button><button class="secondary" data-rc="opportunity" ${attrs(r)}>Plan opportunity</button><button class="text-button" data-rc="evidence" ${attrs(r)}>Review evidence</button></div>`;
  }
  function opportunities(a) {
    const rows = offers(a.Id), r = selected(a.Id);
    if (!r) return `<section class="rc-context"><h2>Customer opportunities</h2><p>No scored product row was included for this customer. This is a capture boundary, not a statement about eligibility.</p></section>`;
    const own = holdings(a.Id);
    return `<section class="rc-context" data-customer-offers="${E(a.Id)}"><header><div><span>Customer opportunities</span><h2>Start with ${E(a.Name)}’s next need.</h2><p>${rows.length} captured product scores · exact customer record</p></div><label>Explore a product<select data-rc-select="${E(a.Id)}" aria-label="Customer product">${rows.map(o => `<option value="${E(o.code)}" ${o.code===r.code?'selected':''}>${E(label(o))}${o.rank==null?' · score only':''}</option>`).join('')}</select></label></header><div class="rc-opportunity-layout"><div class="rc-offer-focus"><span class="badge">${E(label(r))}</span><h3>${Number(r.probability).toFixed(1)}<small>% modeled conversion</small></h3><div class="rc-probability-track" role="img" aria-label="${Number(r.probability).toFixed(1)} percent modeled conversion"><i style="width:${Math.max(0,Math.min(100,r.probability))}%"></i></div><div class="rc-value-pair"><strong>${compact(r.value)}</strong><span>Modeled expected-value uplift</span></div><p>${r.rank==null?'Recommendation rank not recorded':'Recorded rank '+E(r.rank)} · ${E(r.channels?r.channels.replaceAll('CC','Call').replaceAll('EM','Email'):'Channels not captured')}</p>${actions(r)}</div><div class="rc-source-context"><h3>${historyFor(r).length>1?'How this score has changed':'The evidence behind this conversation'}</h3>${offerTrend(r)}<p>${E(r.captureSource)} · captured Nov 12, 2026${r.period?' · model run '+E(r.period):' · run date not recorded'}</p><div class="rc-ownership-note"><strong>${own.length?'Known product holdings are on file':'Ownership evidence is incomplete'}</strong><p>${own.length?'Review the captured holdings in Finances before proposing a product. A scored row alone does not establish an unmet need.':'No financial-account balance or complete ownership inventory was included for this customer.'}</p><button class="text-button" data-action="tab" data-tab="finances">Review financial context</button></div></div></div><footer>Selected source evidence, not an approved offer, booked revenue or complete eligibility/ownership inventory. Customer scores remain available when you leave the Growth cohort view.</footer></section>`;
  }
  function holdingSurface(a) {
    const rows=holdings(a.Id);
    if (!rows.length) return '';
    return `<section class="rc-context" data-customer-holdings="${E(a.Id)}"><header><div><span>Captured product ownership</span><h2>Products already on file.</h2><p>These source rows identify holdings; account balances were not included.</p></div></header><div class="rc-holdings">${rows.map(r=>`<article><span>✓</span><div><h3>${E(r.name)}</h3><p>${E(r.status||'Status not captured')} · ${E(r.captureSource)}</p></div><strong>Balance unavailable</strong></article>`).join('')}</div></section>`;
  }
  document.addEventListener('change', e => {
    const id=e.target.dataset.rcSelect;
    if (!id) return;
    selections.set(id,e.target.value);
    const y=scrollY;render();scrollTo(0,y);
    document.querySelector('[data-rc-select]')?.focus({preventScroll:true});
  });
  document.addEventListener('click', e => {
    const b=e.target.closest('[data-rc]');
    if (!b || state.style!=='atlas' || state.persona!=='retail') return;
    const r=offers(b.dataset.account).find(o=>o.code===b.dataset.code);
    if (!r) return;
    const a=api.accounts().find(a=>a.Id===r.account);
    if (!a) return;
    const notes=`${label(r)}: ${r.probability}% modeled conversion; ${money(r.value)} modeled expected-value uplift. ${r.captureSource}, captured Nov 12, 2026. Confirm needs and ownership before outreach.`;
    if (b.dataset.rc==='evidence') modal(a.Name+' · '+label(r),`<p>${E(notes)}</p>${offerTrend(r)}${actions(r)}`);
    if (b.dataset.rc==='task' || b.dataset.rc==='opportunity') openForm(b.dataset.rc==='task'?'task':'opportunity',a.Name,null,{
      accountId:a.Id,offerCode:r.code,offerAccountId:a.Id,notes,
      title:b.dataset.rc==='task'?'Discuss '+label(r)+' with '+a.Name:label(r)+' — '+a.Name,
      crossSell:b.dataset.rc==='opportunity'
    });
  });
  return {opportunities,holdingSurface,hasHoldings:id=>holdings(id).length>0};
};
