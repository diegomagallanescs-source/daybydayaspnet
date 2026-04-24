/* ============================================================
   components.js — render helpers for code blocks, flashcards,
   coding challenges, and a lightweight C# syntax highlighter.
   ============================================================ */

/* ---------- Lightweight C# / JS syntax highlighter ---------- */
const KEYWORDS = new Set([
  'public','private','protected','internal','static','readonly','const','sealed','abstract','virtual','override','new','this','base','return','if','else','for','foreach','while','do','switch','case','default','break','continue','using','namespace','class','interface','struct','enum','record','void','async','await','try','catch','finally','throw','throws','in','out','ref','params','is','as','null','true','false','var','get','set','init','yield','when','where','from','select','let','orderby','group','join','on','equals','into','descending','ascending','global'
]);
const TYPES = new Set([
  'string','int','long','short','byte','bool','double','float','decimal','object','char','dynamic','Task','Task<','IActionResult','ActionResult','IEnumerable','IList','List','IQueryable','ICollection','Dictionary','HashSet','IEnumerable<','IList<','List<','IQueryable<','ICollection<','Dictionary<','HashSet<','Guid','DateTime','DateTimeOffset','TimeSpan','Exception','HttpClient','HttpContext','HttpResponse','HttpRequest','CancellationToken','ILogger','IConfiguration','IServiceProvider','IServiceCollection','WebApplication','WebApplicationBuilder','Controller','ControllerBase','DbContext','DbSet','IHostedService','BackgroundService'
]);

function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

function highlight(code, lang = 'csharp') {
  let src = escapeHtml(code);

  // Comments (line & block) — do first so nothing inside them gets re-colored
  src = src.replace(/(\/\/[^\n]*)/g, '\u0001$1\u0002');
  src = src.replace(/(\/\*[\s\S]*?\*\/)/g, '\u0001$1\u0002');

  // Strings — "..." and @"..." and $"..."
  src = src.replace(/(\$?@?"(?:[^"\\]|\\.)*")/g, '\u0003$1\u0004');

  // Numbers
  src = src.replace(/\b(\d+(?:\.\d+)?[fFmMdDlL]?)\b/g, '\u0005$1\u0006');

  // Attributes [Something]
  src = src.replace(/(\[[A-Za-z][\w]*(?:\([^\]]*\))?\])/g, '\u0007$1\u0008');

  // Keywords
  for (const kw of KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'g');
    src = src.replace(re, `\u000B${kw}\u000C`);
  }

  // Types (simple)
  for (const t of TYPES) {
    if (t.endsWith('<')) continue;
    const re = new RegExp(`\\b${t}\\b`, 'g');
    src = src.replace(re, `\u000E${t}\u000F`);
  }

  // PascalCase types heuristic (word starting with uppercase letter, not already marked)
  src = src.replace(/(?<![\w\u000E])\b([A-Z][A-Za-z0-9]+)\b(?!\u000F)/g, '\u000E$1\u000F');

  // Now substitute markers back to <span> tags
  src = src
    .replace(/\u0001/g, '<span class="tok-comment">').replace(/\u0002/g, '</span>')
    .replace(/\u0003/g, '<span class="tok-string">').replace(/\u0004/g, '</span>')
    .replace(/\u0005/g, '<span class="tok-number">').replace(/\u0006/g, '</span>')
    .replace(/\u0007/g, '<span class="tok-attr">').replace(/\u0008/g, '</span>')
    .replace(/\u000B/g, '<span class="tok-keyword">').replace(/\u000C/g, '</span>')
    .replace(/\u000E/g, '<span class="tok-type">').replace(/\u000F/g, '</span>');

  return src;
}

/* ---------- Code block ---------- */
function renderCodeBlock(example) {
  const lang = example.lang || 'csharp';
  const explanation = example.explanation
    ? `<div class="code-block__explanation">${example.explanation.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>`
    : '';
  return `
    <div class="code-block">
      <div class="code-block__header">
        <span class="code-block__title">${example.title || ''}</span>
        <span class="code-block__lang">${lang}</span>
      </div>
      <pre><code>${highlight(example.code, lang)}</code></pre>
      ${explanation}
    </div>
  `;
}

/* ---------- Flashcard ---------- */
function renderFlashcard(card, idx) {
  return `
    <div class="flashcard" data-idx="${idx}" tabindex="0" role="button" aria-pressed="false">
      <div class="flashcard__label">Card ${String(idx + 1).padStart(2, '0')}</div>
      <div class="flashcard__front">${card.front}</div>
      <div class="flashcard__back">${card.back}</div>
      <div class="flashcard__hint">tap ⇄</div>
    </div>
  `;
}

/* ---------- Coding challenge ---------- */
function renderChallenge(ch, idx) {
  const starterHtml = ch.starterCode
    ? `<div class="challenge__starter"><pre><code>${highlight(ch.starterCode)}</code></pre></div>`
    : '';
  const explanationHtml = ch.explanation
    ? `<div class="challenge__explanation">${ch.explanation.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>`
    : '';
  return `
    <div class="challenge" data-idx="${idx}">
      <div class="challenge__header">
        <span class="challenge__label">◆ Challenge ${idx + 1}${ch.title ? ' · ' + ch.title : ''}</span>
        <span class="challenge__difficulty">${ch.difficulty || ''}</span>
      </div>
      <div class="challenge__prompt">${ch.prompt.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>
      ${starterHtml}
      <div class="challenge__controls">
        <button class="btn-reveal" data-action="reveal">Reveal solution</button>
        <span class="challenge__hint">${ch.hint || 'Try it first on paper, then flip it.'}</span>
      </div>
      <div class="challenge__solution">
        <div class="challenge__solution-label">Solution</div>
        <pre><code>${highlight(ch.solution)}</code></pre>
        ${explanationHtml}
      </div>
    </div>
  `;
}

/* ---------- Mode section ---------- */
function renderModeSection(mode, data) {
  if (!data) return `<div class="mode-content" data-mode="${mode}"><p class="text-mute">Content for this mode is still being written.</p></div>`;

  const codeBlocks = (data.codeExamples || []).map(renderCodeBlock).join('');
  const flashcards = (data.flashcards || []).map(renderFlashcard).join('');
  const challenges = (data.challenges || []).map(renderChallenge).join('');

  const intro = Array.isArray(data.concept)
    ? data.concept.map(p => `<p>${p}</p>`).join('')
    : `<p>${data.concept}</p>`;

  return `
    <div class="mode-content" data-mode="${mode}">
      <div class="mode-intro">${intro}</div>

      ${codeBlocks ? `
      <div class="subsection">
        <div class="subsection__title">
          <span class="subsection__title-label">◇ Code</span>
          <h3 style="font-size: 1.1rem;">Walk-through</h3>
        </div>
        ${codeBlocks}
      </div>` : ''}

      ${flashcards ? `
      <div class="subsection">
        <div class="subsection__title">
          <span class="subsection__title-label">◇ Flashcards</span>
          <h3 style="font-size: 1.1rem;">Tap to flip</h3>
        </div>
        <div class="flashcards">${flashcards}</div>
      </div>` : ''}

      ${challenges ? `
      <div class="subsection">
        <div class="subsection__title">
          <span class="subsection__title-label">◇ Practice</span>
          <h3 style="font-size: 1.1rem;">Coding challenges</h3>
        </div>
        ${challenges}
      </div>` : ''}
    </div>
  `;
}
