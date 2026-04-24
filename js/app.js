/* ============================================================
   app.js — page orchestration, mode tabs, progress, flashcard
   interactions, challenge reveal.
   ============================================================ */

/* ---------- Code comparison helpers ----------
   stripComments walks character-by-character so we don't strip
   `//` inside a string literal. Handles regular, interpolated,
   and verbatim strings, plus // and /* ... *\/ comments.
   normalizeForCompare then collapses whitespace so formatting
   (indent style, blank lines, trailing spaces) doesn't matter.
*/
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line | block | str | vstr
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i += 2; continue; }
      if (c === '@' && c2 === '"') { state = 'vstr'; out += c + c2; i += 2; continue; }
      if ((c === '$' || c === '@') && (c2 === '@' || c2 === '$') && src[i + 2] === '"') {
        state = 'vstr'; out += c + c2 + '"'; i += 3; continue;
      }
      if (c === '$' && c2 === '"') { state = 'str'; out += c + c2; i += 2; continue; }
      if (c === '"') { state = 'str'; out += c; i++; continue; }
      out += c; i++;
    } else if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; i++; } else { i++; }
    } else if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; i += 2; } else { i++; }
    } else if (state === 'str') {
      if (c === '\\' && c2 !== undefined) { out += c + c2; i += 2; continue; }
      if (c === '"') { state = 'code'; out += c; i++; continue; }
      out += c; i++;
    } else if (state === 'vstr') {
      if (c === '"' && c2 === '"') { out += c + c2; i += 2; continue; }
      if (c === '"') { state = 'code'; out += c; i++; continue; }
      out += c; i++;
    }
  }
  return out;
}

function normalizeForCompare(src) {
  return stripComments(src)
    .replace(/\s+/g, ' ')
    // collapse spaces around common punctuation so style differences
    // (e.g. `a,b` vs `a, b`) don't produce a false mismatch
    .replace(/\s*([(){}\[\];,<>=+\-*/%!&|?:])\s*/g, '$1')
    .trim();
}

function getDayIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return parseInt(params.get('day') || '1', 10);
}

function renderDayPage() {
  const dayId = getDayIdFromUrl();
  const day = ALL_DAYS.find(d => d.id === dayId);
  if (!day) {
    document.querySelector('main').innerHTML = '<div class="container"><p>Day not found.</p></div>';
    return;
  }

  // Header
  document.title = `Day ${day.day} · ${day.title} — ASP.NET Core Study Guide`;
  document.getElementById('header-day-label').textContent = `Day ${String(day.day).padStart(2, '0')} / 25`;
  document.getElementById('day-number').textContent = `Day ${String(day.day).padStart(2, '0')} · Topic`;
  document.getElementById('day-title').textContent = day.title;
  document.getElementById('day-subtitle').textContent = day.subtitle || '';
  document.getElementById('day-overview').textContent = day.overview || '';
  if (day.csharpFocus) {
    document.getElementById('day-csharp').textContent = day.csharpFocus;
    document.getElementById('day-csharp-row').style.display = 'flex';
  }

  // Mode container
  const container = document.getElementById('mode-container');
  const modes = ['beginner', 'mid', 'advanced', 'enterprise'];
  container.innerHTML = modes.map(m => renderModeSection(m, day.modes[m])).join('');

  // Wire up the interactive code editors
  if (typeof initCodeEditors === 'function') initCodeEditors(container);

  // Show default (beginner)
  container.querySelector('.mode-content[data-mode="beginner"]').classList.add('active');

  // Tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.mode-content').forEach(mc => mc.classList.remove('active'));
      const target = container.querySelector(`.mode-content[data-mode="${mode}"]`);
      if (target) target.classList.add('active');
    });
  });

  // Flashcard flip
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.flashcard');
    if (card) {
      card.classList.toggle('flipped');
      card.setAttribute('aria-pressed', card.classList.contains('flipped'));
    }
    if (e.target.matches('[data-action="reveal"]')) {
      const challenge = e.target.closest('.challenge');
      const sol = challenge.querySelector('.challenge__solution');
      const btn = e.target;
      if (sol.classList.contains('revealed')) {
        sol.classList.remove('revealed');
        btn.textContent = 'Reveal solution';
      } else {
        sol.classList.add('revealed');
        btn.textContent = 'Hide solution';
      }
    }
    if (e.target.matches('[data-action="check"]')) {
      const challenge = e.target.closest('.challenge');
      const editor = challenge.querySelector('.challenge__editor');
      const rawSolution = challenge.querySelector('.challenge__solution-raw');
      const slot = challenge.querySelector('[data-slot="result"]');
      if (!editor || !rawSolution || !slot) return;

      const userNorm = normalizeForCompare(editor.value);
      const solNorm = normalizeForCompare(rawSolution.value);

      slot.hidden = false;
      if (userNorm === solNorm) {
        slot.textContent = '✓ Matches the solution';
        slot.className = 'challenge__result challenge__result--ok';
      } else if (userNorm.length === 0) {
        slot.textContent = 'Editor is empty — try writing something first';
        slot.className = 'challenge__result challenge__result--warn';
      } else {
        slot.textContent = '✗ Differs from the solution — compare with Reveal';
        slot.className = 'challenge__result challenge__result--diff';
      }
    }
  });

  // Keyboard support for flashcards
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.flashcard');
      if (card) {
        e.preventDefault();
        card.classList.toggle('flipped');
      }
    }
    // Tab inside the code editor inserts 4 spaces instead of jumping focus
    if (e.key === 'Tab' && e.target.classList.contains('challenge__editor')) {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + '    ' + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + 4;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // Prev / next
  const prev = ALL_DAYS.find(d => d.id === dayId - 1);
  const next = ALL_DAYS.find(d => d.id === dayId + 1);
  if (prev) {
    const prevEl = document.getElementById('prev-day');
    prevEl.href = `day.html?day=${prev.id}`;
    document.getElementById('prev-day-title').textContent = `Day ${prev.day}: ${prev.title}`;
    prevEl.style.visibility = 'visible';
  }
  if (next) {
    const nextEl = document.getElementById('next-day');
    nextEl.href = `day.html?day=${next.id}`;
    document.getElementById('next-day-title').textContent = `Day ${next.day}: ${next.title}`;
  } else {
    document.getElementById('next-day').style.visibility = 'hidden';
  }

  // Completion toggle
  const completeBtn = document.getElementById('toggle-complete');
  const done = JSON.parse(localStorage.getItem('completedDays') || '[]');
  const isDone = done.includes(dayId);
  if (isDone) {
    completeBtn.textContent = '✓ Completed — mark incomplete';
    completeBtn.style.background = 'var(--amber)';
    completeBtn.style.color = 'var(--ink)';
  }
  completeBtn.addEventListener('click', () => {
    let list = JSON.parse(localStorage.getItem('completedDays') || '[]');
    if (list.includes(dayId)) {
      list = list.filter(d => d !== dayId);
      completeBtn.textContent = 'Mark as complete';
      completeBtn.style.background = '';
      completeBtn.style.color = 'var(--amber)';
    } else {
      list.push(dayId);
      completeBtn.textContent = '✓ Completed — mark incomplete';
      completeBtn.style.background = 'var(--amber)';
      completeBtn.style.color = 'var(--ink)';
    }
    localStorage.setItem('completedDays', JSON.stringify(list));
  });
}