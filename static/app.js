// static/app.js
const $ = (s)=>document.querySelector(s);



const COLORS = { QB:'qb', RB:'rb', WR:'wr', TE:'te', 'PK':'k', 'DF':'dst' };

// --- Animation state & helpers ---
let PREV_STATE = null;

function getDetail(state){
  if (!state) return null;
  if (state.board_detail) return state.board_detail;
  if (!state.board) return null;
  return state.board.map(row => row.map(cell => {
    if (!cell) return null;
    if (typeof cell === 'string') {
      return { name: cell, pos: null, bye: null, color: null, pos_rank: '' };
    }
    // Assume object with fields coming from backend
    const name = cell.name || '';
    const pos = cell.pos || cell.position || '';
    const bye = cell.bye || cell.bye_week || '';
    const color = cell.color || null;
    const pos_rank = cell.pos_rank || cell.posRank || '';
    return { name, pos, bye, color, pos_rank };
  }));
}

function cloneDetail(detail){
  if (!detail) return null;
  return detail.map(row => row.map(cell => cell ? { ...cell } : null));
}

function computeDiff(prevDetail, nextDetail){
  const diffs = [];
  if (!nextDetail) return diffs;
  const rows = nextDetail.length;
  const cols = rows ? nextDetail[0].length : 0;
  for (let r = 0; r < rows; r++){
    for (let c = 0; c < cols; c++){
      const n = nextDetail[r][c];
      const p = (prevDetail && prevDetail[r]) ? prevDetail[r][c] : null;
      const changed = (!!n) && (!p || p.name !== n.name);
      if (changed) diffs.push({ r, c, cell: n });
    }
  }
  return diffs;
}

function renderBoardFrom(detail, teams, round){
  const POS_BG = {
    'QB':  '#ffe4e6',
    'RB':  '#e7f6ea',
    'WR':  '#fff7cc',
    'TE':  '#efe7ff',
    'PK':   '#ffefd9',
    'DF':'#f5f5f5'
  };
  let html = `<h2>Draft Board (Round ${round})</h2>`;
  html += `<table class="board"><thead><tr>`;
  teams.forEach(t => html += `<th>${t}</th>`);
  html += `</tr></thead><tbody>`;
  (detail || []).forEach(row => {
    html += `<tr>`;
    row.forEach(cell => {
      if (!cell) { html += `<td class="cell"></td>`; return; }
      const posUpper = (cell.pos || '').toUpperCase().replace('/', '');
      const posClass = posUpper ? `pos-${posUpper}` : '';
      const name = cell.name || '';
      const byeText = cell.bye ? `${cell.bye}` : '';
      const bg = posUpper && POS_BG[posUpper] ? ` style="background-color:${POS_BG[posUpper]}"` : '';
      html += `<td class="cell ${posClass}"${bg}>`+
              `<div class="player-name">${name}</div>`+
              `<div class="pos-rank">${cell.pos_rank || ''}</div>`+
              `<div class="bye">${byeText}</div>`+
              `</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  const mount = document.querySelector('#board');
  if (mount) mount.innerHTML = html;
}

function renderBoard(state){
  const detail = getDetail(state);
  renderBoardFrom(detail, state.teams, state.round);
}

function renderPool(state){
  const pool = state.pool || [];
  const on_the_clock = state.on_the_clock;
  const filters = state.filters || {};
  const positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLX', 'DF', 'PK'];

  let html = `<h3>Player Pool ${on_the_clock==='You' ? '(your pick)' : ''}</h3>`;

  // Build dropdown for position filter
  html += `<label for="posFilter">Filter by position: </label>`;
  html += `<select id="posFilter" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">`;
  positions.forEach(pos => {
    html += `<option value="${pos}">${pos}</option>`;
  });
  html += `</select>`;

  html += `<ol class="pool" id="poolList">`;
  pool.forEach((p,i)=>{
    html += `<li class="${COLORS[p.pos] || ''}">
      <button class="pick" data-index="${i}" ${on_the_clock!=='You'?'disabled':''}>
        ${p.name} <span class="meta">(${p.pos}, Bye ${p.bye})</span>
      </button>
    </li>`;
  });
  html += `</ol>`;

  $("#top20").innerHTML = html;

  // Wire pick buttons only if it's user's turn
  if (on_the_clock === 'You') {
    document.querySelectorAll('.pick').forEach(btn=>{
      btn.onclick = async e=>{
        // prevent double-clicks
        document.querySelectorAll('.pick').forEach(b=> b.disabled = true);
        try {
          const index = +e.currentTarget.dataset.index;
          const res = await fetch('/api/pick',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({index})
          });
          const state = await res.json();
          if (!state.ok) {
            setStatus(state.error || 'Pick failed');
          } else {
            setStatus(`On the clock: ${state.on_the_clock}`);
            updateUI(state);
          }
        } catch (err) {
          setStatus('Network error while picking');
        }
      };
    });
  }

  // Filter functionality client-side
  const posFilter = document.getElementById('posFilter');
  if (posFilter) {
    posFilter.addEventListener('change', () => {
      const selected = posFilter.value;
      const list = document.getElementById('poolList');
      if (!list) return;
      Array.from(list.children).forEach((li, idx) => {
        const player = pool[idx];
        if (selected === 'ALL') {
          li.style.display = '';
        } else if (selected === 'FLX') {
          // FLX includes RB, WR, TE
          if (['RB','WR','TE'].includes(player.pos)) {
            li.style.display = '';
          } else {
            li.style.display = 'none';
          }
        } else {
          if (player.pos === selected) {
            li.style.display = '';
          } else {
            li.style.display = 'none';
          }
        }
      });
    });
  }
}

function setStatus(msg) {
  const el = $("#status");
  if (el) el.textContent = msg;
}

function resetUI(){
  const b = document.querySelector('#board');
  const t = document.querySelector('#top20');
  if (b) b.innerHTML = '';
  if (t) t.innerHTML = '';
  setStatus('');
}


async function animateBoardDiff(prevState, nextState){
  const prevDetail = getDetail(prevState);
  const nextDetail = getDetail(nextState);
  let diffs = computeDiff(prevDetail, nextDetail);
  if (!diffs.length){
    renderBoard(nextState);
    return;
  }
  // Sort diffs in snake draft order:
  // - by row ascending
  // - for even rows, by col ascending; odd rows, by col descending
  diffs = diffs.slice().sort((a, b) => {
    if (a.r !== b.r) return a.r - b.r;
    // Even row: left to right; Odd row: right to left
    if (a.r % 2 === 0) {
      return a.c - b.c;
    } else {
      return b.c - a.c;
    }
  });
  // Working board starts as previous (or empty)
  const working = cloneDetail(prevDetail) || [];
  // Ensure working has the same shape as nextDetail
  while (working.length < nextDetail.length) working.push(new Array(nextDetail[0].length).fill(null));
  for (let r=0; r<nextDetail.length; r++){
    if (!working[r]) working[r] = new Array(nextDetail[0].length).fill(null);
  }

  // Disable pick buttons during animation
  document.querySelectorAll('.pick').forEach(b => b.disabled = true);

  // Apply each new pick with a 0.5s delay in snake order
  for (let i = 0; i < diffs.length; i++){
    const { r, c, cell } = diffs[i];
    working[r][c] = { ...cell };
    renderBoardFrom(working, nextState.teams, nextState.round);
    // eslint-disable-next-line no-await-in-loop
    await new Promise(res => setTimeout(res, 500));
  }
}

function updateUI(state){
  animateBoardDiff(PREV_STATE, state).then(() => {
    renderPool(state);
    PREV_STATE = state;
  });
}

// Wire up after DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.querySelector('#start');
  const slotInput = document.querySelector('#slot');

  const restartBtn = document.querySelector('#restart');
  if (restartBtn) {
    restartBtn.onclick = async () => {
      const slot = +(slotInput ? slotInput.value : 4) || 4;
      // Avoid double clicks and treat as a fresh start
      restartBtn.disabled = true;
      startBtn.disabled = true;
      setStatus('Restarting draft...');
      try {
        // Clear UI immediately for visual feedback
        resetUI();
        const res = await fetch('/api/restart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot })
        });
        const state = await res.json();
        if (!state.ok) {
          setStatus(state.error || 'Unable to restart draft');
        } else {
          setStatus(`On the clock: ${state.on_the_clock}`);
          updateUI(state); // full draft redone server-side to your next turn
        }
      } catch (err) {
        console.error(err);
        setStatus('Network error while restarting draft');
      } finally {
        restartBtn.disabled = false;
      }
    };
  }

  if (!startBtn) {
    console.warn('Start button (#start) not found');
    setStatus('Start button not found on page.');
    return;
  }

  startBtn.onclick = async () => {
    const slot = +(slotInput ? slotInput.value : 4) || 4;
    startBtn.disabled = true; // avoid duplicate starts
    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot })
      });
      const state = await res.json();
      if (!state.ok) {
        setStatus(state.error || 'Unable to start draft');
        startBtn.disabled = false; // allow retry
        return;
      }
      PREV_STATE = PREV_STATE || null;
      setStatus(`On the clock: ${state.on_the_clock}`);
      updateUI(state);
    } catch (err) {
      console.error(err);
      setStatus('Network error while starting draft');
      startBtn.disabled = false;
    }
  };

  // Optional: allow Enter to start
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !startBtn.disabled) startBtn.click();
  });
});