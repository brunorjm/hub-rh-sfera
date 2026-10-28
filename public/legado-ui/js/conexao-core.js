(function (root) {
  'use strict';
  const defaults = Object.freeze({ milestones: [30, 75, 120], before: 10, after: 10, upcoming: 10, horizon: 180, capacity: 8, duration: 45, launchDate: '2026-10-21', maxEligibleAge: 140, initialRecovery: true });
  const sessionHours = Object.freeze({ start: '10:00', end: '16:00' });
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function date(v) {
    const s = String(v || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + 'T12:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s ? s : null;
  }
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function days(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000); }
  function add(a, n) { const d = new Date(a + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function settings(input = {}) {
    const c = { ...defaults, ...input };
    if (!Array.isArray(c.milestones) || !c.milestones.length || c.milestones.length > 6 || c.milestones.some(x => !Number.isInteger(x) || x < 1 || x > 730) || new Set(c.milestones).size !== c.milestones.length) throw new Error('Informe marcos únicos entre 1 e 730 dias.');
    c.milestones = [...c.milestones].sort((a, b) => a - b);
    for (const k of ['before', 'after', 'upcoming', 'horizon', 'capacity', 'duration']) if (!Number.isInteger(c[k]) || c[k] < (['capacity', 'duration', 'horizon'].includes(k) ? 1 : 0) || c[k] > 1000) throw new Error('Parâmetro inválido: ' + k);
    if (c.horizon < Math.max(...c.milestones) + c.after) throw new Error('O horizonte deve incluir o último marco e sua tolerância.');
    if (!date(c.launchDate)) throw new Error('Data de início do programa inválida.');
    if (!Number.isInteger(c.maxEligibleAge) || c.maxEligibleAge < Math.max(...c.milestones) + c.after || c.maxEligibleAge > 730) throw new Error('O limite de elegibilidade deve incluir o último marco e sua tolerância.');
    if (typeof c.initialRecovery !== 'boolean') throw new Error('Regra de recuperação inicial inválida.');
    return c;
  }
  function stageKey(employee, milestone) { return employee.key + ':' + milestone; }
  function inPeriod(value, filters = {}) {
    if (filters.start && !date(filters.start) || filters.end && !date(filters.end)) return false;
    return !!date(value) && (!filters.start || value >= filters.start) && (!filters.end || value <= filters.end);
  }
  function matchesEmployee(employee, filters = {}) {
    const matches = (value, list) => !list?.length || list.some(item => norm(item) === norm(value));
    return matches(employee.unit, filters.unidade) && matches(employee.department, filters.departamento)
      && (!filters.gestor || norm(employee.manager).includes(norm(filters.gestor)))
      && (!filters.colaborador || norm(employee.name).includes(norm(filters.colaborador)));
  }
  function sessionWindow(session) {
    const scheduled = date(session.date);
    let created = date(session.created);
    if (session.created && !/^\d{4}-\d{2}-\d{2}$/.test(session.created)) {
      const instant = new Date(session.created);
      if (Number.isFinite(+instant)) created = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
    }
    return { start: created && scheduled && created <= scheduled ? created : scheduled, end: scheduled, created };
  }
  function sessionInPeriod(session, filters = {}) {
    const window = sessionWindow(session);
    if (!window.start || !window.end || filters.start && !date(filters.start) || filters.end && !date(filters.end) || filters.start && filters.end && filters.start > filters.end) return false;
    return (!filters.start || window.end >= filters.start) && (!filters.end || window.start <= filters.end);
  }
  function scopeSessions(sessions, employees, filters = {}) {
    const keys = new Set(employees.filter(e => matchesEmployee(e, filters)).map(e => e.key));
    const matching = sessions.filter(s => s.participants.some(key => keys.has(key)));
    return { matching, visible: matching.filter(s => sessionInPeriod(s, filters)), outsidePeriod: matching.filter(s => !sessionInPeriod(s, filters)) };
  }
  function filterStages(stages, filters = {}) {
    // Same principle as AVE: period selects when the stage becomes available,
    // independently of completion. Urgency continues to use today's date.
    return stages.filter(stage => inPeriod(stage.start, filters) && matchesEmployee(stage.employee, filters));
  }
  function launchQueue(model, filters = {}) {
    const c = model.config, ref = model.reference, queue = [], excluded = [];
    if (ref < c.launchDate) return { queue, excluded, beforeLaunch: true };
    for (const employee of model.employees) {
      if (!matchesEmployee(employee, filters)) continue;
      const ageAtLaunch = days(employee.admission, c.launchDate);
      if (employee.age > c.maxEligibleAge || ageAtLaunch > c.maxEligibleAge) {
        excluded.push({ employee, reason: 'Mais de ' + c.maxEligibleAge + ' dias de empresa' }); continue;
      }
      const firstMilestone = Math.min(...c.milestones);
      const launchThirty = ageAtLaunch >= 0 && ageAtLaunch <= Math.max(...c.milestones) && firstMilestone === 30;
      const recovery = c.initialRecovery && ageAtLaunch > Math.max(...c.milestones) + c.after && ageAtLaunch <= c.maxEligibleAge;
      const openAtLaunch = c.milestones.filter(n => ageAtLaunch >= n-c.before && ageAtLaunch <= n+c.after);
      const closestOpen = [...openAtLaunch].sort((a,b)=>Math.abs(ageAtLaunch-a)-Math.abs(ageAtLaunch-b)||b-a)[0];
      const entry = launchThirty ? firstMilestone : recovery ? Math.max(...c.milestones) : closestOpen ?? c.milestones.find(n => ageAtLaunch <= n + c.after);
      if (entry == null) { excluded.push({ employee, reason: 'Fora das janelas do programa' }); continue; }
      const candidates = model.stages.filter(s => s.employee.key === employee.key && s.milestone >= entry).sort((a,b) => a.milestone-b.milestone);
      // A scheduled stage remains visible; a completed stage advances the
      // person to the next stage. Older, pre-launch stages never become debt.
      // After the exceptional first 30-day meeting, skip later milestones
      // whose normal windows have already closed; do not create retroactive debt.
      const chosen = candidates.find(s => !s.completed && (s.milestone === entry || !launchThirty || s.end >= ref || s.scheduled));
      if (!chosen) { excluded.push({ employee, reason: 'Ciclo concluído' }); continue; }
      const start = chosen.start < c.launchDate ? c.launchDate : chosen.start;
      const initialThirty = launchThirty && chosen.milestone === firstMilestone && ageAtLaunch > firstMilestone + c.after;
      const end = (recovery && chosen.milestone === Math.max(...c.milestones)) || initialThirty ? add(employee.admission,c.maxEligibleAge) : chosen.end;
      const timing = ref > end ? 'atrasado' : ref >= start ? 'apto' : days(ref,start) <= c.upcoming ? 'proximo' : 'futuro';
      // A period selects windows that intersect it, so a currently open
      // window is not lost merely because it started before the first day.
      if (filters.start && end < filters.start || filters.end && start > filters.end) continue;
      if (filters.start && !date(filters.start) || filters.end && !date(filters.end) || filters.start && filters.end && filters.start > filters.end) continue;
      const previousSession = (model.sessions || []).find(s => !s.cancelled && s.date >= ref && s.participants.includes(employee.key) && s.milestone < entry);
      queue.push({ ...chosen, originalStart: chosen.start, originalEnd: chosen.end, start, end, timing, operation: chosen.operation === 'verificar' ? 'convocar' : chosen.operation, initialRecovery: recovery, initialThirty, entryMilestone: entry, daysToTarget: days(ref,chosen.target), previousSession });
    }
    return { queue, excluded, beforeLaunch: false };
  }
  function build(rows, input = {}, reference = today(), events = [], sessions = []) {
    const c = settings(input), ref = date(reference);
    if (!ref) throw new Error('Data de referência inválida.');
    const employees = [], stages = [], rejected = [], seen = new Set();
    for (const r of rows || []) {
      if (!['ativo', 'desativado'].includes(norm(r.situacao))) { rejected.push({ reason: 'Fora do quadro atual (Ativo/Desativado)', id: r.id }); continue; }
      const admission = date(r.data_admissao);
      if (!admission || admission > ref || r.id == null) { rejected.push({ reason: 'Admissão inválida, futura ou registro sem ID', id: r.id }); continue; }
      const key = String(r.id) + '@' + admission;
      if (seen.has(key)) { rejected.push({ reason: 'Vínculo duplicado', id: r.id }); continue; }
      seen.add(key);
      const employee = { key, id: r.id, admission, name: r.nome_completo || r.nome || 'Nome não informado', unit: r.unidade || 'Não informada', department: r.departamento || 'Não informado', role: r.cargo_visivel || r.cargo || 'Não informado', manager: r.gestor_direto || 'Não informado', situation: r.situacao, available: norm(r.situacao) === 'ativo', age: days(admission, ref), updated: r.updated_at || null };
      employees.push(employee);
      for (const milestone of c.milestones) {
        const key = stageKey(employee, milestone), target = add(admission, milestone), start = add(target, -c.before), end = add(target, c.after);
        const history = events.filter(e => e.stage === key && date(e.date) && e.date <= ref).sort((a, b) => String(a.created).localeCompare(String(b.created)));
        const last = history.at(-1);
        const completed = last?.type === 'presente';
        const scheduled = sessions.filter(s => !s.cancelled && s.milestone === milestone && s.participants.includes(employee.key) && s.date >= ref).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
        const timing = ref > end ? 'atrasado' : ref >= start ? 'apto' : days(ref, start) <= c.upcoming ? 'proximo' : 'futuro';
        stages.push({ key, employee, milestone, target, start, end, timing, history, completed, scheduled, operation: completed ? 'realizado' : scheduled ? 'agendado' : last?.type === 'faltou' ? 'reagendar' : 'verificar', inCycle: employee.age <= c.horizon });
      }
    }
    return { employees, stages, rejected, config: c, reference: ref, sessions };
  }
  function sessionConflicts(candidate, sessions, config, employees, { manual = false } = {}) {
    const errors = [], c = settings(config);
    if (!date(candidate.date) || !/^\d{2}:\d{2}$/.test(candidate.time || '') || Number(candidate.time.slice(0, 2)) > 23 || Number(candidate.time.slice(3)) > 59) errors.push('Data ou horário inválido.');
    if (!c.milestones.includes(candidate.milestone)) errors.push('Marco inválido.');
    if (!candidate.facilitator?.trim()) errors.push('Informe o facilitador.');
    if (!Number.isInteger(candidate.duration) || candidate.duration < 15 || candidate.duration > 180) errors.push('Duração deve ficar entre 15 e 180 minutos.');
    if (/^\d{2}:\d{2}$/.test(candidate.time || '') && Number.isInteger(candidate.duration) && (minutes(candidate.time) < minutes(sessionHours.start) || minutes(candidate.time) + candidate.duration > minutes(sessionHours.end))) errors.push('A turma deve começar a partir das 10h e terminar até as 16h.');
    if (!candidate.participants.some(k => employees.some(e => e.key === k))) errors.push('Inclua ao menos um colaborador do cadastro atual para agendar a turma.');
    if (candidate.participants.length > c.capacity || new Set(candidate.participants).size !== candidate.participants.length) errors.push('Selecione participantes distintos, respeitando a capacidade.');
    if (candidate.participants.some(k => !employees.some(e => e.key === k))) errors.push('Há participante fora da base atual.');
    if (!manual && candidate.participants.some(k => employees.find(e => e.key === k)?.available === false)) errors.push('Confirme a disponibilidade do vínculo desativado antes de incluí-lo em turma.');
    if (candidate.date && date(candidate.date)) {
      if (candidate.date < c.launchDate) errors.push('A turma não pode ocorrer antes do início do programa.');
      if (candidate.participants.some(k => { const e=employees.find(e=>e.key===k); return e?.admission && candidate.date<e.admission; })) errors.push('A turma não pode ocorrer antes da admissão de um participante.');
      if (!manual && candidate.participants.some(k => { const e=employees.find(e=>e.key===k); return e?.admission && days(e.admission,candidate.date)>c.maxEligibleAge; })) errors.push('Há participante que terá mais de '+c.maxEligibleAge+' dias na data da turma.');
    }
    if (candidate.link && !/^https:\/\//i.test(candidate.link)) errors.push('O link deve começar com https://.');
    for (const s of sessions.filter(s => !s.cancelled && s.id !== candidate.id && s.date === candidate.date && s.participants.some(k => employees.some(e => e.key === k)))) {
      if (minutes(candidate.time) < minutes(s.time) + s.duration && minutes(s.time) < minutes(candidate.time) + candidate.duration && (norm(s.facilitator) === norm(candidate.facilitator) || s.participants.some(k => candidate.participants.includes(k)))) errors.push('Conflito de horário com outra turma ou facilitador.');
    }
    return [...new Set(errors)];
  }
  const api = { defaults, sessionHours, norm, date, today, days, add, settings, stageKey, inPeriod, matchesEmployee, sessionWindow, sessionInPeriod, scopeSessions, filterStages, launchQueue, build, sessionConflicts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HUB_CONEXAO_CORE = api;
})(typeof window !== 'undefined' ? window : globalThis);
