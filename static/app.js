// static/app.js
const $ = (s)=>document.querySelector(s);



const COLORS = { QB:'qb', RB:'rb', WR:'wr', TE:'te', 'K':'k', 'D/ST':'dst' };

// --- Animation state & helpers ---
let PREV_STATE = null;

function getDetail(state){
  if (!state) return null;
  if (state.board_detail) return state.board_detail;
  if (!state.board) return null;
  return state.board.map(row => row.map(name => name ? ({ name, pos:null, bye:null }) : null));
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
    'K':   '#ffefd9',
    'D/ST':'#f5f5f5'
  };
  let html = `<h2>Draft Board (Round ${round})</h2>`;
  html += `<table class="board"><thead><tr>`;
  teams.forEach(t => html += `<th>${t}</th>`);
  html += `</tr></thead><tbody>`;
  (detail || []).forEach(row => {
    html += `<tr>`;
    row.forEach(cell => {
      if (!cell) { html += `<td class="cell"></td>`; return; }
      const rawPos = cell.pos || '';
      const posKey = rawPos.toUpperCase().replace('/', '');
      const posClass = rawPos ? `pos-${posKey}` : '';
      const name = cell.name || '';
      const byeText = cell.bye ? `Bye ${cell.bye}` : '';
      const bg = rawPos && POS_BG[rawPos] ? ` style=\"background-color:${POS_BG[rawPos]}\"` : '';
      html += `<td class="cell ${posClass}"${bg}>`+
              `<div class="player-name">${name}</div>`+
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

function renderTop20(state){
  const { top20, on_the_clock } = state;
  let html = `<h3>Top 20 Available ${on_the_clock==='You' ? '(your pick)' : ''}</h3>`;
  html += `<ol class="pool">`;
  top20.forEach((p,i)=>{
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
    renderTop20(state);
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