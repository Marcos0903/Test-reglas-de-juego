import { getUser, handleAuthCallback, login, logout, signup } from '@netlify/identity';

(() => {
  const BANK = window.QUESTION_BANK;
  const $ = id => document.getElementById(id);
  const available = BANK?.verified && BANK.questions.length >= 25;
  let currentUser = null;
  let progress = { history: [], wrongIds: [] };
  let exam = null;
  let ticker = null;

  const fmt = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const fullName = user => user?.userMetadata?.full_name?.trim() || user?.email?.split('@')[0] || 'Árbitro';
  const jsonFetch = async (path, options = {}) => {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la solicitud.');
    return body;
  };

  function setAuthMessage(message = '', isError = false) {
    $('authMessage').textContent = message;
    $('authMessage').classList.toggle('error', isError);
  }

  function renderDashboard() {
    const history = progress.history || [];
    const average = history.length ? Math.round(history.reduce((sum, item) => sum + item.score, 0) / history.length) : null;
    $('statTests').textContent = history.length;
    $('statAvg').textContent = average === null ? '—' : average;
    $('statBest').textContent = history.length ? Math.max(...history.map(item => item.score)) : '—';
    $('statWrong').textContent = (progress.wrongIds || []).length;

    const list = $('history');
    if (!currentUser) {
      list.className = 'history-empty';
      list.innerHTML = '<span class="empty-icon">↗</span><p>Inicia sesión para consultar tu historial personal.</p>';
      return;
    }
    if (!history.length) {
      list.className = 'history-empty';
      list.innerHTML = '<span class="empty-icon">↗</span><p>Aún no hay resultados.<br>Completa tu primer examen para ver aquí tu evolución.</p>';
      return;
    }
    list.className = 'history-list';
    list.innerHTML = history.slice(0, 4).map(item => `<div class="history-item"><span><b>${item.score}/100</b><small>${new Date(item.date).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })} · ${item.correct}/${item.questionCount || 25} correctas</small></span><span>${item.passed ? 'Aprobado' : 'Revisar'}</span></div>`).join('');
  }

  function renderAccount() {
    const signedIn = Boolean(currentUser);
    $('currentName').childNodes[0].textContent = signedIn ? fullName(currentUser) : 'ÁRBITRO';
    $('brandMeta').textContent = signedIn ? 'CUENTA PERSONAL' : 'ENTRENAMIENTO';
    $('authStatus').innerHTML = signedIn ? '<i></i> Progreso sincronizado' : '<i></i> Acceso personal';
    $('logoutButton').hidden = !signedIn;
    $('adminButton').hidden = !currentUser?.roles?.includes('admin');
    $('startBtn').disabled = !available || !signedIn;
    $('startBtn2').disabled = !available || !signedIn;
    $('bankStatus').textContent = !signedIn ? 'Accede o crea una cuenta para practicar' : available ? `${BANK.questions.length} preguntas verificadas disponibles` : `Banco pendiente de verificación (${BANK?.questions?.length || 0}/25)`;
    renderDashboard();
  }

  async function loadMyProgress() {
    progress = await jsonFetch('/.netlify/functions/progress');
    renderDashboard();
  }

  async function setUser(user) {
    currentUser = user || null;
    progress = { history: [], wrongIds: [] };
    renderAccount();
    if (currentUser) {
      try {
        await loadMyProgress();
      } catch (error) {
        $('history').className = 'history-error';
        $('history').textContent = 'No se pudo cargar tu progreso. Comprueba que la cuenta esté activada.';
      }
      if ($('authDialog').open) $('authDialog').close();
    }
  }

  async function initializeAccount() {
    try {
      await handleAuthCallback();
      const user = await getUser();
      await setUser(user);
      if (!user) $('authDialog').showModal();
    } catch (error) {
      renderAccount();
      setAuthMessage(error.message || 'No se pudo conectar con el servicio de cuentas.', true);
      if (!$('authDialog').open) $('authDialog').showModal();
    }
  }

  function currentExamConfig() {
    const mode = $('examMode').value;
    return {
      mode,
      questionCount: mode === 'official' ? 25 : Number($('questionCount').value),
      timeLimitSeconds: mode === 'official' ? 35 * 60 : mode === 'untimed' ? 0 : Number($('timeLimit').value) * 60
    };
  }

  function updateExamSettings() {
    const mode = $('examMode').value;
    if (mode === 'official') {
      $('questionCount').value = '25';
      $('timeLimit').value = '35';
    } else if (mode === 'untimed') {
      $('timeLimit').value = '0';
    } else if ($('timeLimit').value === '0') {
      $('timeLimit').value = '35';
    }
    $('questionCount').disabled = mode === 'official';
    $('timeLimit').disabled = mode !== 'timed';
    const config = currentExamConfig();
    $('factQuestions').textContent = config.questionCount;
    $('factPass').textContent = '84%';
    $('factTime').textContent = config.timeLimitSeconds ? `${config.timeLimitSeconds / 60} min` : 'Sin límite';
    $('modeBadge').textContent = mode === 'official' ? '25 PREGUNTAS · 35 MIN' : mode === 'timed' ? 'A TU MEDIDA' : 'SIN CRONÓMETRO';
  }

  function begin() {
    if (!available || !currentUser) return;
    const config = currentExamConfig();
    const selected = [...BANK.questions].sort(() => Math.random() - 0.5).slice(0, config.questionCount);
    exam = { ...config, questions: selected, answers: Array.from({ length: selected.length }, () => []), index: 0, remaining: config.timeLimitSeconds, startedAt: Date.now(), finishing: false };
    $('timer').textContent = exam.timeLimitSeconds ? fmt(exam.remaining) : 'Sin tiempo';
    $('timer').classList.remove('urgent');
    $('timer').classList.toggle('no-limit', !exam.timeLimitSeconds);
    $('examTitle').textContent = exam.mode === 'official' ? 'EXAMEN OFICIAL · 25 PREGUNTAS' : exam.mode === 'untimed' ? 'PRUEBA SIN TIEMPO' : 'ENTRENAMIENTO CON TIEMPO';
    $('examDialog').showModal();
    renderQuestion();
    clearInterval(ticker);
    if (!exam.timeLimitSeconds) return;
    ticker = setInterval(() => {
      if (!exam) return;
      exam.remaining--;
      $('timer').textContent = fmt(exam.remaining);
      $('timer').classList.toggle('urgent', exam.remaining <= 300);
      if (exam.remaining <= 0) finish();
    }, 1000);
  }

  function renderQuestion() {
    const question = exam.questions[exam.index];
    const number = exam.index + 1;
    const questionCount = exam.questions.length;
    $('progressText').textContent = `Pregunta ${number} de ${questionCount}`;
    $('questionNumber').textContent = `PREGUNTA ${String(number).padStart(2, '0')}`;
    $('questionText').textContent = question.text;
    $('multiHint').textContent = question.correct.length > 1 ? 'Selecciona todas las respuestas correctas' : '';
    $('options').innerHTML = question.options.map(option => `<label class="option"><input type="${question.correct.length > 1 ? 'checkbox' : 'radio'}" name="answer" value="${option.key}" ${exam.answers[exam.index].includes(option.key) ? 'checked' : ''}><span><b>${option.key.toUpperCase()}.</b> ${escapeHtml(option.text)}</span></label>`).join('');
    $('options').querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
      exam.answers[exam.index] = [...$('options').querySelectorAll('input:checked')].map(item => item.value);
      $('answeredCount').textContent = `${exam.answers.filter(answer => answer.length).length} / ${questionCount} respondidas`;
    }));
    $('answeredCount').textContent = `${exam.answers.filter(answer => answer.length).length} / ${questionCount} respondidas`;
    $('progressBar').style.width = `${number / questionCount * 100}%`;
    $('prevBtn').disabled = exam.index === 0;
    $('nextBtn').hidden = exam.index === questionCount - 1;
    $('finishBtn').hidden = exam.index !== questionCount - 1;
  }

  async function finish() {
    if (!exam || exam.finishing) return;
    exam.finishing = true;
    clearInterval(ticker);
    const entries = exam.questions.map((question, index) => ({
      question,
      chosen: exam.answers[index],
      ok: [...question.correct].sort().join(',') === [...exam.answers[index]].sort().join(',')
    }));
    const correct = entries.filter(entry => entry.ok).length;
    const questionCount = exam.questions.length;
    const score = Math.round(correct * 100 / questionCount);
    const passed = correct >= Math.ceil(questionCount * 0.84);
    const elapsedSeconds = exam.timeLimitSeconds ? Math.max(0, exam.timeLimitSeconds - exam.remaining) : Math.floor((Date.now() - exam.startedAt) / 1000);
    const attempt = {
      date: new Date().toISOString(), score, correct, passed,
      seconds: elapsedSeconds,
      questionCount,
      mode: exam.mode,
      timeLimitSeconds: exam.timeLimitSeconds,
      wrongIds: entries.filter(entry => !entry.ok).map(entry => entry.question.id),
      correctIds: entries.filter(entry => entry.ok).map(entry => entry.question.id)
    };

    $('scoreValue').textContent = score;
    $('passBadge').textContent = passed ? 'APROBADO' : 'NO APROBADO';
    $('passBadge').style.background = passed ? '#eff5e8' : '#faeee8';
    $('passBadge').style.color = passed ? '#55733f' : '#a14d37';
    $('scoreSummary').textContent = 'Guardando tu resultado…';
    $('reviewList').innerHTML = entries.map((entry, index) => {
      const labels = keys => keys.length ? keys.map(key => {
        const option = entry.question.options.find(item => item.key === key);
        return `${key.toUpperCase()}) ${option ? escapeHtml(option.text) : ''}`;
      }).join(' · ') : 'Sin responder';
      return `<details class="review-item"><summary>${entry.ok ? '✓' : '✕'} &nbsp; ${String(index + 1).padStart(2, '0')} · ${escapeHtml(entry.question.text.slice(0, 115))}${entry.question.text.length > 115 ? '…' : ''}</summary><p class="${entry.ok ? 'correct' : 'incorrect'}">Tu respuesta: ${labels(entry.chosen)}</p><p class="correct">Correcta: ${labels(entry.question.correct)}</p></details>`;
    }).join('');

    $('examDialog').close();
    $('resultDialog').showModal();
    try {
      await jsonFetch('/.netlify/functions/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attempt }) });
      await loadMyProgress();
      $('scoreSummary').textContent = `${correct} de ${questionCount} respuestas correctas · ${score}/100 · ${exam.timeLimitSeconds ? `${fmt(attempt.seconds)} de ${fmt(exam.timeLimitSeconds)}` : `${fmt(attempt.seconds)} de tiempo empleado`}. Resultado guardado en tu cuenta.`;
    } catch (error) {
      $('scoreSummary').textContent = `${correct} de ${questionCount} respuestas correctas · ${score}/100 · ${fmt(attempt.seconds)} de tiempo empleado. No se pudo sincronizar el resultado: ${error.message}`;
    }
    exam = null;
  }

  async function openAdminPanel() {
    $('adminDialog').showModal();
    $('adminStatus').textContent = 'Cargando cuentas y resultados…';
    $('adminUsers').innerHTML = '';
    try {
      const data = await jsonFetch('/.netlify/functions/admin-progress');
      $('adminStatus').textContent = `${data.users.length} cuentas registradas`;
      if (!data.users.length) {
        $('adminUsers').innerHTML = '<tr><td class="empty-row" colspan="7">Todavía no hay cuentas registradas.</td></tr>';
        return;
      }
      $('adminUsers').innerHTML = data.users.map(user => {
        const exams = user.history.map(item => `<li>${new Date(item.date).toLocaleDateString('es-ES')} · ${item.score}/100 · ${item.correct}/${item.questionCount || 25} ${item.passed ? '· aprobado' : ''}</li>`).join('');
        return `<tr><td><span class="user-name">${escapeHtml(user.name)}</span><span class="user-email">${escapeHtml(user.email)}</span><details class="user-attempts"><summary>Ver ${user.history.length} exámenes</summary><ul>${exams || '<li>Sin exámenes todavía</li>'}</ul></details></td><td>${escapeHtml(user.federation || 'Sin indicar')}</td><td>${user.examCount}</td><td>${user.average === null ? '—' : `${user.average}/100`}</td><td>${user.best === null ? '—' : `${user.best}/100`}</td><td class="pass-count">${user.passedCount}</td><td class="fail-count">${user.failedCount}</td></tr>`;
      }).join('');
    } catch (error) {
      $('adminStatus').textContent = error.message || 'No se pudo cargar el seguimiento.';
      $('adminStatus').classList.add('auth-status-error');
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    setAuthMessage('Comprobando tus datos…');
    try {
      await login($('loginEmail').value.trim(), $('loginPassword').value);
      await setUser(await getUser());
      setAuthMessage('');
    } catch (error) {
      setAuthMessage(error.message || 'No se pudo iniciar sesión.', true);
    }
  });
  $('signupForm').addEventListener('submit', async event => {
    event.preventDefault();
    setAuthMessage('Creando tu cuenta…');
    try {
      await signup($('signupEmail').value.trim(), $('signupPassword').value, {
        full_name: $('signupName').value.trim(),
        federation: $('signupFederation').value.trim()
      });
      const user = await getUser();
      if (user) {
        await setUser(user);
        setAuthMessage('Cuenta creada. Ya puedes empezar a practicar.');
      } else {
        setAuthMessage('Cuenta creada. Revisa tu correo y confirma la dirección para iniciar sesión.');
        $('signupForm').reset();
        showLoginForm();
      }
    } catch (error) {
      setAuthMessage(error.message || 'No se pudo crear la cuenta.', true);
    }
  });

  function showLoginForm() {
    $('loginForm').hidden = false;
    $('signupForm').hidden = true;
    $('authTitle').textContent = 'Inicia sesión';
    setAuthMessage('');
  }
  function showSignupForm() {
    $('loginForm').hidden = true;
    $('signupForm').hidden = false;
    $('authTitle').textContent = 'Crea tu cuenta';
    setAuthMessage('');
  }

  $('showSignup').onclick = showSignupForm;
  $('showLogin').onclick = showLoginForm;
  $('examMode').addEventListener('change', updateExamSettings);
  $('questionCount').addEventListener('change', updateExamSettings);
  $('timeLimit').addEventListener('change', updateExamSettings);
  updateExamSettings();
  const menuButton = $('accountMenuButton');
  const accountMenu = $('accountMenu');
  function closeAccountMenu() { accountMenu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }
  menuButton.onclick = () => { accountMenu.hidden = !accountMenu.hidden; menuButton.setAttribute('aria-expanded', String(!accountMenu.hidden)); };
  document.addEventListener('click', event => { if (!event.target.closest('.account-menu-wrap')) closeAccountMenu(); });
  $('menuAccount').onclick = () => {
    closeAccountMenu();
    if (!currentUser) { showLoginForm(); $('authDialog').showModal(); return; }
    $('accountDetails').innerHTML = `<p class="account-name">${escapeHtml(fullName(currentUser))}</p><p class="account-email">${escapeHtml(currentUser.email || '')}</p><p class="account-hint">Federación: ${escapeHtml(currentUser.userMetadata?.federation || 'Sin indicar')}</p>`;
    $('accountAccess').hidden = true;
    $('accountDialog').showModal();
  };
  $('accountAccess').onclick = () => { $('accountDialog').close(); showLoginForm(); $('authDialog').showModal(); };
  $('closeAccount').onclick = () => $('accountDialog').close();
  $('rulesButton').onclick = () => { closeAccountMenu(); $('rulesDialog').showModal(); };
  $('closeRules').onclick = () => $('rulesDialog').close();
  $('closeAuth').onclick = () => $('authDialog').close();
  $('logoutButton').onclick = async () => {
    closeAccountMenu();
    await logout();
    await setUser(null);
    showLoginForm();
    $('authDialog').showModal();
  };
  $('adminButton').onclick = () => { closeAccountMenu(); openAdminPanel(); };
  $('closeAdmin').onclick = () => $('adminDialog').close();
  $('startBtn').onclick = begin;
  $('startBtn2').onclick = begin;
  $('prevBtn').onclick = () => { exam.index--; renderQuestion(); };
  $('nextBtn').onclick = () => { exam.index++; renderQuestion(); };
  $('finishBtn').onclick = finish;
  $('closeExam').onclick = () => { clearInterval(ticker); exam = null; $('examDialog').close(); };
  $('closeResult').onclick = $('doneBtn').onclick = () => $('resultDialog').close();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});

  $('bankStatus').textContent = 'Comprobando cuenta…';
  renderAccount();
  initializeAccount();
})();
