/* All content is read from the prior study's captured fixtures. No network calls. */
const workspace = document.getElementById('workspace');
const detail = document.getElementById('detail');
const clients = studies.wealth.rows;
const capture = crmSnapshot.personas.wealth;
const params = new URLSearchParams(location.search);
let direction = ['panorama','atlas','focus'].includes(params.get('direction')) ? params.get('direction') : 'panorama';
let selected = 1;
const clientMetrics = [
  ['59.34%', 'Plan success probability', 'Relationship attention'],
  ['31.4%', 'MSFT share of holdings', 'Portfolio review'],
  ['$783.8K', 'Assets held at Schwab', 'Outside assets'],
  ['42.03%', 'Plan success probability', 'Planning conversation'],
];
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cloud = '<svg class="logo-mark" viewBox="0 0 40 30" aria-hidden="true"><path d="M9 25h22a7 7 0 0 0 1-14 12 12 0 0 0-23-1A7.5 7.5 0 0 0 9 25Z" fill="currentColor"/></svg>';
const ring = () => '<div class="ring-wrap"><svg class="ring" viewBox="0 0 250 250" role="img" aria-label="Julie E Morris: MSFT 31.4305 percent of holdings; all other holdings 68.5695 percent"><circle class="base" cx="125" cy="125" r="105"/><circle class="part" cx="125" cy="125" r="105" pathLength="100"/></svg><div class="ring-caption"><strong>31.4%</strong><span>held in MSFT</span></div></div>';
const appHeader = () => `<div class="app-header"><div class="app-logo">${cloud} Cumulus Private Wealth</div><nav class="app-nav" aria-label="Workspace"><button class="active" data-home>Overview</button><button data-relationships>Relationships</button><button data-pipeline>Pipeline</button></nav><div class="identity"><span>Jose Sifontes</span><div class="avatar" aria-label="Jose Sifontes">JS</div></div></div>`;
const scope = '<div class="scope"><span class="dot"></span>Jose’s advisory book</div>';
const provenance = 'Design study using saved Nov 11–12, 2026 data. Selected examples; no live updates.';
const footer = () => `<footer class="footer-note">${provenance}</footer>`;
const supportBar = () => `<div class="support-bar"><button data-pipeline>Explore pipeline ${icon('arrow')}</button><button data-capabilities>All workspace capabilities ${icon('layers')}</button><p class="source-note">Four saved relationship signals. This selection does not represent the entire book.</p></div>`;

function render() {
  document.querySelectorAll('[data-direction]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.direction === direction)));
  workspace.className = direction;
  workspace.innerHTML = appHeader() + ({ panorama: panorama, atlas: atlas, focus: focus }[direction])() + footer();
  params.set('direction', direction);
  history.replaceState(null, '', '?' + params.toString());
  bindWorkspace();
}

function panorama() {
  return `<section class="hero"><div class="hero-copy">${scope}<h1>Start with<br>the relationship.</h1><p>Julie’s concentrated position deserves a closer look. Bring her goals into the conversation before discussing a change.</p><button class="primary" data-client="1">Review Julie’s relationship ${icon('arrow')}</button></div><div class="hero-chart"><p class="chart-title">One holding.<br>Almost a third of the portfolio.</p>${ring()}<span class="legend"><i></i>Microsoft</span><span class="legend"><i></i>Other holdings</span><p class="source-note">Julie E Morris · saved holdings signal, Nov 11</p></div></section>
  <section class="relationship-shelf" aria-labelledby="shelf-title"><div class="section-top"><h2 id="shelf-title">Conversations worth having.</h2><button class="text-button" data-relationships>Explore these relationships ${icon('arrow')}</button></div><div class="relationship-grid">${clients.map((c,i) => `<button class="person-tile" data-client="${i}"><span class="badge">${clientMetrics[i][2]}</span><span class="relationship-name">${escapeHtml(c.name)}</span><strong class="tile-value">${clientMetrics[i][0]}</strong><p>${clientMetrics[i][1]}</p><span class="tile-action">Review context <span class="round-arrow">${icon('arrow')}</span></span></button>`).join('')}</div>${supportBar()}</section>`;
}

function atlas() {
  return `<section class="atlas-heading"><div>${scope}<h1>A different way<br>to see your relationships.</h1><p>Choose a person. Bring their signals into focus.</p></div><p>Planning, portfolio, and outside assets, connected to your book.</p></section><div class="atlas-layout"><div><section class="map-canvas" aria-label="Selected relationship map"><svg class="map-lines" viewBox="0 0 700 570" preserveAspectRatio="none" aria-hidden="true"><line x1="350" y1="279" x2="145" y2="105"/><line x1="350" y1="279" x2="555" y2="197"/><line x1="350" y1="279" x2="160" y2="384"/><line x1="350" y1="279" x2="550" y2="490"/></svg><div class="book-center"><strong>JS</strong><span>Your book</span></div>${clients.map((c,i) => `<button class="map-node" data-select="${i}" aria-pressed="${selected === i}"><span class="relationship-name">${escapeHtml(c.name)}</span><small>${clientMetrics[i][2]}</small><b>${clientMetrics[i][0]}</b><small>${clientMetrics[i][1]}</small></button>`).join('')}</section><p class="map-key">Selected relationships in the advisor’s book. Position and distance carry no financial meaning.</p></div><section class="relationship-detail" id="atlas-detail" aria-label="Selected relationship details">${atlasDetail()}</section></div>${supportBar()}`;
}

function atlasDetail() {
  const c = clients[selected];
  return `<span class="badge">${clientMetrics[selected][2]}</span><h2 class="detail-heading">${escapeHtml(c.name)}</h2><p>${escapeHtml(c.reason)}</p>${evidence(c)}<button class="primary" data-prepare="${selected}">Prepare the conversation ${icon('arrow')}</button><button class="text-button" data-client="${selected}">Review all context</button>`;
}

function evidence(c) {
  return c.evidence.map(([title,body,source]) => `<div class="evidence-block"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><small>${escapeHtml(source)} · saved Nov 11 signal</small></div>`).join('');
}

function focus() {
  const c = clients[selected];
  const focusTitles = ['Make room for a personal check-in.','A portfolio worth a closer look.','Understand the assets beyond your book.','Revisit the plan. Start with the goal.'];
  const focusIntros = ['Graham’s call sentiment and plan outlook belong in the same conversation.','Julie’s MSFT position is meaningful. The right next step starts with her priorities.','David has a significant relationship at Charles Schwab. Find out what that relationship does for him.','Robles Household’s modeled outcome is a reason to review the assumptions together.'];
  return `<div class="focus-layout"><aside class="focus-queue"><span class="caption">Jose’s advisory book</span><h2>One relationship.<br>Your full attention.</h2><div class="focus-persons">${clients.map((p,i) => `<button class="focus-person" data-select="${i}" aria-pressed="${selected===i}"><span><span class="relationship-name">${escapeHtml(p.name)}</span><small>${clientMetrics[i][2]}</small></span><i class="queue-mark"></i></button>`).join('')}</div><p class="source-note">Four saved examples.<br>Choose a relationship to begin.</p></aside><section class="advisory-paper" aria-label="Advisory workspace"><div class="paper-header"><span>${escapeHtml(c.name)}</span><span class="badge">${clientMetrics[selected][2]}</span></div><h1 class="paper-heading">${focusTitles[selected]}</h1><p class="paper-intro">${focusIntros[selected]}</p><div class="feature">${selected===1 ? ring() : `<div><div class="feature-number">${clientMetrics[selected][0]}</div><p>${clientMetrics[selected][1]}</p></div>`}<div><h3>${escapeHtml(c.evidence[0][0])}</h3><p>${escapeHtml(c.evidence[0][1])}</p><p class="source-note">${escapeHtml(c.evidence[0][2])} · saved Nov 11 signal</p></div></div><div class="suggested"><h3>A useful starting point</h3><p>${escapeHtml(c.approach)}</p></div><div class="paper-actions"><button class="primary" data-prepare="${selected}">Prepare the conversation ${icon('arrow')}</button><button class="text-button" data-client="${selected}">Explore the evidence</button></div></section></div>`;
}

function bindWorkspace() {
  workspace.querySelectorAll('[data-client]').forEach(b => b.onclick = () => openClient(Number(b.dataset.client)));
  workspace.querySelectorAll('[data-prepare]').forEach(b => b.onclick = () => openPreparation(Number(b.dataset.prepare)));
  workspace.querySelectorAll('[data-select]').forEach(b => b.onclick = () => {
    selected = Number(b.dataset.select);
    if(direction === 'atlas') {
      workspace.querySelectorAll('[data-select]').forEach(n => n.setAttribute('aria-pressed', String(Number(n.dataset.select)===selected)));
      document.getElementById('atlas-detail').innerHTML = atlasDetail();
      bindWorkspace();
    } else {
      render();
      workspace.querySelector(`[data-select="${selected}"]`).focus({preventScroll:true});
    }
  });
  workspace.querySelectorAll('[data-relationships]').forEach(b => b.onclick = openRelationships);
  workspace.querySelectorAll('[data-pipeline]').forEach(b => b.onclick = openPipeline);
  workspace.querySelectorAll('[data-capabilities]').forEach(b => b.onclick = openCapabilities);
  workspace.querySelectorAll('[data-home]').forEach(b => b.onclick = () => {render(); window.scrollTo({top:0,behavior:'instant'});});
}

function showDialog(title, html) {
  document.getElementById('detail-body').innerHTML = `<div class="dialog-body"><h2 class="dialog-title" id="detail-title">${escapeHtml(title)}</h2>${html}</div>`;
  if(!detail.open) detail.showModal();
  detail.scrollTop = 0;
}

function openClient(index) {
  const c = clients[index];
  showDialog(c.name, `<p>${escapeHtml(c.reason)}</p>${evidence(c)}<h3>Suggested approach</h3><p>${escapeHtml(c.approach)}</p><button class="primary" id="prepare-from-detail">Prepare the conversation ${icon('arrow')}</button><p class="source-note">Historical study content. A production workspace would retain this account’s full 360, actions, and authenticated Agentforce conversation.</p>`);
  document.getElementById('prepare-from-detail').onclick = () => openPreparation(index);
}

function openPreparation(index) {
  const c = clients[index];
  let saved = '';
  try {saved = sessionStorage.getItem('cumulus-directions-notes-'+index)||'';} catch {}
  showDialog('Prepare for '+c.name, `<p class="source-note">Editable study notes, authored from the saved evidence. This preview does not call Agentforce or create CRM records.</p><label for="conversation-notes">Conversation notes</label><textarea id="conversation-notes">${escapeHtml(saved || c.approach)}</textarea><button class="primary" id="save-notes">Keep notes in this tab ${icon('check')}</button><p class="save-status" role="status" id="save-status"></p><h3>Evidence to bring</h3>${evidence(c)}`);
  document.getElementById('save-notes').onclick = () => {
    try {
      sessionStorage.setItem('cumulus-directions-notes-'+index, document.getElementById('conversation-notes').value);
      document.getElementById('save-status').textContent = 'Notes kept in this browser tab. No CRM record was created.';
    } catch {
      document.getElementById('save-status').textContent = 'Browser storage is unavailable. Copy these notes before closing.';
    }
  };
}

function openRelationships() {
  showDialog('Relationships in this study', '<p>Four selected signals from the saved Wealth fixtures. Choose a relationship to review its evidence.</p>' + clients.map((c,i) => `<div class="evidence-block"><button class="text-button" data-dialog-client="${i}">${escapeHtml(c.name)} ${icon('arrow')}</button><p>${escapeHtml(c.reason)}</p></div>`).join(''));
  document.querySelectorAll('[data-dialog-client]').forEach(b => b.onclick = () => openClient(Number(b.dataset.dialogClient)));
}

function openPipeline() {
  const total = capture.pipeline.reduce((sum,row) => sum + row.amount, 0);
  const count = capture.pipeline.reduce((sum,row) => sum + row.n, 0);
  const currency = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
  showDialog('Pipeline in the saved book', `<p class="design-description">${currency(total)} across ${count.toLocaleString()} open opportunities.</p><p class="source-note">Jose Sifontes’ owner-scoped CRM aggregate, captured Nov 12, 2026. These sandbox totals include large Innovation Pipeline opportunities.</p>${capture.pipeline.map(row=>`<div class="evidence-block"><h3>${escapeHtml(row.StageName)}</h3><p>${currency(row.amount)} · ${row.n.toLocaleString()} opportunities</p><svg viewBox="0 0 500 16" role="img" aria-label="${escapeHtml(row.StageName)}: ${(row.amount/total*100).toFixed(1)} percent of pipeline value"><rect width="500" height="16" rx="8" fill="#e8ecf5"/><rect width="${row.amount/total*500}" height="16" rx="8" fill="#234be8"/></svg></div>`).join('')}`);
}

function openCapabilities() {
  showDialog('Everything still has a place.', `<p class="design-description">These studies explore the first screen and a relationship conversation. The complete app will still need every existing capability.</p><h3>Relationship context</h3><p>Full customer 360, household goals, holdings, planning, external intelligence, service cases, and activity.</p><h3>Business and follow-through</h3><p>Pipeline, leads, cross-sell, tasks, scheduling, email, CRM writes, and successful-action refresh.</p><h3>Assistance and personalization</h3><p>Authenticated Agentforce with agent switching, AI actions, configuration, brand themes, display size, and view-as scoping.</p><p>See the existing <a href="../2026-11-11-cockpits/FUNCTIONALITY_MAP.md">functionality preservation map</a> for the implementation contract.</p>`);
}

document.querySelectorAll('[data-direction]').forEach(b => b.onclick = () => {
  direction = b.dataset.direction;
  render();
  window.scrollTo({top:0,behavior:'instant'});
});
document.getElementById('close-dialog').onclick = () => detail.close();
document.getElementById('study-info').onclick = () => showDialog('Three different design ideas.', `<p class="design-description">One Wealth content set. Three ways to experience it.</p><h3>Panorama</h3><p>An expansive cobalt workspace with an oversized portfolio visual and a broad relationship shelf. The book feels open, legible, and energetic.</p><h3>Relationship atlas</h3><p>A spatial relationship browser. Select a person on the canvas and bring their planning, holdings, and outside assets into a readable evidence panel.</p><h3>Advisory focus</h3><p>A quiet plum frame and a generous advisory canvas. Choose a relationship, investigate one meaningful issue, and prepare the conversation.</p><p class="source-note">Throwaway visual explorations. Values come from the previous study’s saved real-data fixtures. No live data, generated AI, or CRM writes. This is not a complete app replacement.</p>`);
render();
