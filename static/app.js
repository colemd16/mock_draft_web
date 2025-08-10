// static/app.js
const $ = (s)=>document.querySelector(s);


const COLORS = { QB:'qb', RB:'rb', WR:'wr', TE:'te', 'K':'k', 'D/ST':'dst' };

// Compute starters/bench from the user's drafted players
function renderBoard(state){
  const { teams, round } = state;
  // Prefer detailed board with name/pos/bye; fallback to names-only
  const detailed = state.board_detail;
  if (!detailed) {
    console.warn('[renderBoard] board_detail missing; using names-only fallback. Colors may not apply without pos data.');
  }
  const fallback = state.board ? state.board.map(row => row.map(name => name ? ({ name, pos: null, bye: null }) : null)) : [];
  const board = detailed || fallback;

  // Inline background colors as a fail-safe (matches your CSS palette)
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

  board.forEach(row => {
    html += `<tr>`;
    row.forEach(cell => {
      if (!cell) { html += `<td class="cell"></td>`; return; }
      const rawPos = cell.pos || '';
      // Map "D/ST" -> "DST" for CSS class
      const posKey = rawPos.toUpperCase().replace('/', '');
      const posClass = rawPos ? `pos-${posKey}` : '';
      const name = cell.name || '';
      const byeText = cell.bye ? `Bye ${cell.bye}` : '';
      const bg = rawPos && POS_BG[rawPos] ? ` style="background-color:${POS_BG[rawPos]}"` : '';
      html += `<td class="cell ${posClass}"${bg}>`
           +  `<div class="player-name">${name}</div>`
           +  `<div class="bye">${byeText}</div>`
           +  `</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  document.querySelector('#board').innerHTML = html;
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

function updateUI(state){
  renderBoard(state);
  renderTop20(state);
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