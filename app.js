(function () {
  "use strict";

  /* =========================================================
     Storage helpers
     ========================================================= */
  const PROFILE_KEY = "pulse_profile";
  const WORKOUTS_KEY = "pulse_workouts";
  const PLANS_KEY = "pulse_plans";
  const FAVORITES_KEY = "pulse_favorites";
  const GOALS_KEY = "pulse_goals";
  const JOURNAL_KEY = "pulse_journal";
  const MEALS_KEY = "pulse_meals";

  function getProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  function getWorkouts() {
    try {
      const raw = localStorage.getItem(WORKOUTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveWorkouts(list) {
    localStorage.setItem(WORKOUTS_KEY, JSON.stringify(list));
  }

  function makeStore(key) {
    return {
      get() {
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : [];
        } catch (e) {
          return [];
        }
      },
      save(list) {
        localStorage.setItem(key, JSON.stringify(list));
      },
    };
  }
  const plansStore = makeStore(PLANS_KEY);
  const favoritesStore = makeStore(FAVORITES_KEY);
  const goalsStore = makeStore(GOALS_KEY);
  const mealsStore = makeStore(MEALS_KEY);

  function getJournal() {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  function saveJournal(obj) {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(obj));
  }

  function makeId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }

  const DISTANCE_TYPES = ["running", "walking", "swimming", "biking"];
  const DURATION_TYPES = ["yoga", "hiit", "sports"];

  const TYPE_LABEL = {
    running: "Running", walking: "Walking", swimming: "Swimming",
    biking: "Biking", lifting: "Lifting", yoga: "Yoga",
    hiit: "HIIT", sports: "Sports",
  };
  const TYPE_ICON = {
    running: "🏃", walking: "🚶", swimming: "🏊", biking: "🚴",
    lifting: "🏋️", yoga: "🧘", hiit: "🔥", sports: "⚽",
  };

  /* =========================================================
     Validation
     ========================================================= */
  function validateName(name) {
    if (!name || !name.trim()) return "Name is required.";
    const trimmed = name.trim();
    if (trimmed.length < 2) return "Name must be at least 2 characters.";
    if (/\d/.test(trimmed)) return "Name cannot contain numbers.";
    if (!/^[a-zA-Z\s\-'.]+$/.test(trimmed)) return "Name contains invalid characters.";
    return "";
  }
  function validateAge(age) {
    const n = Number(age);
    if (age === "" || age === null || age === undefined) return "Age is required.";
    if (!Number.isFinite(n)) return "Age must be a number.";
    if (!Number.isInteger(n)) return "Age must be a whole number.";
    if (n < 5 || n > 120) return "Enter an age between 5 and 120.";
    return "";
  }
  function validateHeight(ft, inch) {
    const f = Number(ft), i = Number(inch);
    if (ft === "" || ft === null || inch === "" || inch === null) return "Height is required.";
    if (!Number.isFinite(f) || !Number.isFinite(i)) return "Height must be numeric.";
    if (f < 2 || f > 8) return "Feet should be between 2 and 8.";
    if (i < 0 || i > 11) return "Inches should be between 0 and 11.";
    return "";
  }
  function validateWeight(w) {
    const n = Number(w);
    if (w === "" || w === null || w === undefined) return "Weight is required.";
    if (!Number.isFinite(n)) return "Weight must be a number.";
    if (n < 40 || n > 700) return "Enter a weight between 40 and 700 lbs.";
    return "";
  }

  /* =========================================================
     DOM refs
     ========================================================= */
  const $ = (id) => document.getElementById(id);

  const screenOnboarding = $("screen-onboarding");
  const screenWelcome = $("screen-welcome");
  const appShell = $("app-shell");

  /* =========================================================
     Boot
     ========================================================= */
  function boot() {
    const profile = getProfile();
    if (!profile) {
      screenOnboarding.classList.remove("hidden");
      wireOnboardingForm();
    } else {
      screenWelcome.classList.remove("hidden");
      $("welcome-name").textContent = profile.name;
      $("welcome-initial").textContent = profile.name.charAt(0).toUpperCase();
      $("btn-begin-workout").addEventListener("click", enterApp);
    }
  }

  function enterApp() {
    screenWelcome.classList.add("hidden");
    screenOnboarding.classList.add("hidden");
    appShell.classList.remove("hidden");
    initAppShell();
  }

  /* =========================================================
     Onboarding form
     ========================================================= */
  function wireOnboardingForm() {
    const form = $("profile-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const name = $("in-name").value;
      const age = $("in-age").value;
      const ft = $("in-height-ft").value;
      const inch = $("in-height-in").value;
      const weight = $("in-weight").value;

      const nameErr = validateName(name);
      const ageErr = validateAge(age);
      const heightErr = validateHeight(ft, inch);
      const weightErr = validateWeight(weight);

      $("err-name").textContent = nameErr;
      $("err-age").textContent = ageErr;
      $("err-height").textContent = heightErr;
      $("err-weight").textContent = weightErr;

      if (nameErr || ageErr || heightErr || weightErr) return;

      const profile = {
        name: name.trim(),
        age: Number(age),
        heightFeet: Number(ft),
        heightInches: Number(inch),
        weight: Number(weight),
        createdAt: new Date().toISOString(),
      };
      saveProfile(profile);
      screenOnboarding.classList.add("hidden");
      screenWelcome.classList.remove("hidden");
      $("welcome-name").textContent = profile.name;
      $("welcome-initial").textContent = profile.name.charAt(0).toUpperCase();
      $("btn-begin-workout").addEventListener("click", enterApp);
    });
  }

  /* =========================================================
     App shell: sidebar + navigation
     ========================================================= */
  let calendarViewDate = new Date();
  let selectedDayISO = null;

  function initAppShell() {
    const profile = getProfile();
    $("dash-name").textContent = profile.name;
    $("sidebar-name").textContent = profile.name;
    $("sidebar-initial").textContent = profile.name.charAt(0).toUpperCase();

    // sidebar toggle
    const sidebar = $("sidebar");
    const overlay = $("sidebar-overlay");
    $("sidebar-open").addEventListener("click", () => {
      sidebar.classList.add("open");
      overlay.classList.add("visible");
    });
    $("sidebar-close").addEventListener("click", closeSidebar);
    overlay.addEventListener("click", closeSidebar);
    function closeSidebar() {
      sidebar.classList.remove("open");
      overlay.classList.remove("visible");
    }

    // nav links
    document.querySelectorAll(".nav-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        showView(btn.dataset.view);
        closeSidebar();
      });
    });

    wireLogForm();
    wireCalendar();
    wireProfileEditForm();
    wirePlanForm();
    wireBests();
    wireJournal();
    wireGoalsForm();
    wireMealsForm();
    wireMealCalendar();

    // sidebar profile shortcut
    $("sidebar-user").addEventListener("click", () => {
      const profileLink = document.querySelector('.nav-link[data-view="profile"]');
      if (profileLink) profileLink.click();
    });

    // default date on log form = today
    $("log-date").value = todayISO();
    $("plan-date").value = todayISO();
    $("goal-date").value = todayISO();
    $("meal-date").value = todayISO();

    renderDashboard();
  }

  const VIEW_TITLES = {
    dashboard: "Dashboard", log: "Log workout", plan: "Plan workout", bests: "Personal bests",
    calendar: "Calendar", journal: "Workout journal", goals: "Fitness goals",
    meals: "Meal tracking", profile: "Profile",
  };

  function showView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    $("view-" + name).classList.remove("hidden");
    $("topbar-heading").textContent = VIEW_TITLES[name];
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

    if (name === "dashboard") renderDashboard();
    if (name === "calendar") renderCalendar();
    if (name === "profile") fillProfileEditForm();
    if (name === "plan") { renderFavorites(); renderPlannedList(); }
    if (name === "bests") renderBests(getActiveBestsType());
    if (name === "journal") renderJournalDay();
    if (name === "goals") renderGoalsLists();
    if (name === "meals") { renderMealsToday(); renderMealCalendar(); }
  }

  /* =========================================================
     Log workout form
     ========================================================= */
  function wireLogForm() {
    const typeSelect = $("log-type");
    typeSelect.addEventListener("change", () => {
      const type = typeSelect.value;
      $("fields-distance").classList.toggle("hidden", !DISTANCE_TYPES.includes(type));
      $("fields-lifting").classList.toggle("hidden", type !== "lifting");
      $("fields-duration").classList.toggle("hidden", !DURATION_TYPES.includes(type));
      $("err-log").textContent = "";
    });

    $("log-bodyweight").addEventListener("change", () => {
      const isBW = $("log-bodyweight").checked;
      $("field-weight-wrap").classList.toggle("hidden", isBW);
      if (isBW) $("log-weight").value = "";
    });

    $("btn-log-workout").addEventListener("click", handleLogWorkout);
  }

  const ENCOURAGEMENTS = [
    "Nice work — keep the momentum going.",
    "That's another one in the books.",
    "Consistency is the whole game. Well done.",
    "Logged. Your future self says thanks.",
  ];

  function handleLogWorkout() {
    const errEl = $("err-log");
    errEl.textContent = "";

    const date = $("log-date").value;
    const type = $("log-type").value;

    if (!date) { errEl.textContent = "Please choose a date."; return; }
    if (!type) { errEl.textContent = "Please select an exercise."; return; }

    const entry = {
      id: "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      type,
      date,
      createdAt: new Date().toISOString(),
    };

    if (DISTANCE_TYPES.includes(type)) {
      const distance = Number($("log-distance").value);
      const time = Number($("log-time").value);
      if (!$("log-distance").value || !(distance > 0)) { errEl.textContent = "Enter a distance greater than 0."; return; }
      if ($("log-time").value && !(time >= 0)) { errEl.textContent = "Enter a valid time."; return; }
      entry.distance = distance;
      entry.timeMinutes = $("log-time").value ? time : null;
    } else if (type === "lifting") {
      const exerciseName = $("log-exercise-name").value.trim();
      const muscleGroup = $("log-muscle-group").value;
      const bodyweight = $("log-bodyweight").checked;
      const weight = Number($("log-weight").value);
      const reps = Number($("log-reps").value);
      const sets = Number($("log-sets").value);

      if (!exerciseName) { errEl.textContent = "Enter the exercise name."; return; }
      if (!muscleGroup) { errEl.textContent = "Select a muscle group."; return; }
      if (!bodyweight && (!$("log-weight").value || weight <= 0)) { errEl.textContent = "Enter a weight, or mark as bodyweight."; return; }
      if (!$("log-reps").value || reps <= 0) { errEl.textContent = "Enter reps greater than 0."; return; }
      if (!$("log-sets").value || sets <= 0) { errEl.textContent = "Enter sets greater than 0."; return; }

      entry.exerciseName = exerciseName;
      entry.muscleGroup = muscleGroup;
      entry.bodyweight = bodyweight;
      entry.weight = bodyweight ? 0 : weight;
      entry.reps = reps;
      entry.sets = sets;
    } else if (DURATION_TYPES.includes(type)) {
      const duration = Number($("log-duration").value);
      if (!$("log-duration").value || duration <= 0) { errEl.textContent = "Enter a duration greater than 0."; return; }
      entry.duration = duration;
      entry.notes = $("log-notes").value.trim();
    }

    const workouts = getWorkouts();
    workouts.push(entry);
    saveWorkouts(workouts);

    resetLogForm();
    showSuccessOverlay("log-success-overlay", "log-form-wrap", "success-encouragement");
  }

  function showSuccessOverlay(overlayId, formWrapId, encouragementId) {
    const overlay = $(overlayId);
    const formWrap = $(formWrapId);
    if (encouragementId) {
      $(encouragementId).textContent = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
    }
    formWrap.classList.add("hidden");
    overlay.classList.remove("hidden");
    setTimeout(() => {
      overlay.classList.add("hidden");
      formWrap.classList.remove("hidden");
    }, 1400);
  }

  function resetLogForm() {
    $("log-type").value = "";
    $("log-distance").value = "";
    $("log-time").value = "";
    $("log-exercise-name").value = "";
    $("log-muscle-group").value = "";
    $("log-bodyweight").checked = false;
    $("field-weight-wrap").classList.remove("hidden");
    $("log-weight").value = "";
    $("log-reps").value = "";
    $("log-sets").value = "";
    $("log-duration").value = "";
    $("log-notes").value = "";
    $("fields-distance").classList.add("hidden");
    $("fields-lifting").classList.add("hidden");
    $("fields-duration").classList.add("hidden");
    $("log-date").value = todayISO();
  }

  /* =========================================================
     Plan workout
     ========================================================= */
  let planExerciseRowCount = 0;

  function wirePlanForm() {
    const typeSelect = $("plan-type");
    typeSelect.addEventListener("change", () => {
      const type = typeSelect.value;
      $("plan-fields-distance").classList.toggle("hidden", !DISTANCE_TYPES.includes(type));
      $("plan-fields-lifting").classList.toggle("hidden", type !== "lifting");
      $("plan-fields-duration").classList.toggle("hidden", !DURATION_TYPES.includes(type));
      $("err-plan").textContent = "";
      if (type === "lifting" && $("plan-exercise-list").children.length === 0) {
        addPlanExerciseRow();
      }
    });

    $("btn-add-plan-exercise").addEventListener("click", () => addPlanExerciseRow());
    $("btn-save-plan").addEventListener("click", handleSavePlan);
  }

  function addPlanExerciseRow(prefill) {
    planExerciseRowCount++;
    const rowId = "per_" + planExerciseRowCount;
    const wrap = document.createElement("div");
    wrap.className = "plan-exercise-row";
    wrap.dataset.rowId = rowId;
    wrap.innerHTML = `
      <button type="button" class="remove-row" aria-label="Remove exercise">✕</button>
      <div class="field">
        <label>Exercise name</label>
        <input type="text" class="pe-name" placeholder="e.g. Bench press" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Weight (lbs)</label>
          <input type="text" inputmode="decimal" class="pe-weight" placeholder="e.g. 135" />
        </div>
        <div class="field">
          <label>Reps</label>
          <input type="text" inputmode="numeric" class="pe-reps" placeholder="e.g. 10" />
        </div>
        <div class="field">
          <label>Sets</label>
          <input type="text" inputmode="numeric" class="pe-sets" placeholder="e.g. 3" />
        </div>
      </div>`;
    $("plan-exercise-list").appendChild(wrap);
    wrap.querySelector(".remove-row").addEventListener("click", () => wrap.remove());
    if (prefill) {
      wrap.querySelector(".pe-name").value = prefill.name || "";
      wrap.querySelector(".pe-weight").value = prefill.weight || "";
      wrap.querySelector(".pe-reps").value = prefill.reps || "";
      wrap.querySelector(".pe-sets").value = prefill.sets || "";
    }
    return wrap;
  }

  function collectPlanExercises() {
    const rows = Array.from(document.querySelectorAll("#plan-exercise-list .plan-exercise-row"));
    return rows.map((row) => ({
      name: row.querySelector(".pe-name").value.trim(),
      weight: Number(row.querySelector(".pe-weight").value) || 0,
      reps: Number(row.querySelector(".pe-reps").value) || 0,
      sets: Number(row.querySelector(".pe-sets").value) || 0,
    })).filter((ex) => ex.name);
  }

  function handleSavePlan() {
    const errEl = $("err-plan");
    errEl.textContent = "";

    const name = $("plan-name").value.trim();
    const date = $("plan-date").value;
    const type = $("plan-type").value;

    if (!name) { errEl.textContent = "Give this plan a name."; return; }
    if (!date) { errEl.textContent = "Choose a date."; return; }
    if (!type) { errEl.textContent = "Select an exercise."; return; }

    const plan = {
      id: makeId("plan"),
      name, date, type,
      createdAt: new Date().toISOString(),
    };

    if (DISTANCE_TYPES.includes(type)) {
      const distance = Number($("plan-distance").value);
      if (!$("plan-distance").value || !(distance > 0)) { errEl.textContent = "Enter a target distance greater than 0."; return; }
      plan.distance = distance;
      plan.timeMinutes = $("plan-time").value ? Number($("plan-time").value) : null;
    } else if (type === "lifting") {
      const exercises = collectPlanExercises();
      if (exercises.length === 0) { errEl.textContent = "Add at least one exercise with a name."; return; }
      plan.exercises = exercises;
    } else if (DURATION_TYPES.includes(type)) {
      const duration = Number($("plan-duration").value);
      if (!$("plan-duration").value || duration <= 0) { errEl.textContent = "Enter a target duration greater than 0."; return; }
      plan.duration = duration;
      plan.notes = $("plan-notes").value.trim();
    }

    const plans = plansStore.get();
    plans.push(plan);
    plansStore.save(plans);

    if ($("plan-save-favorite").checked) {
      const favorites = favoritesStore.get();
      favorites.push({ ...plan, id: makeId("fav") });
      favoritesStore.save(favorites);
    }

    resetPlanForm();
    $("plan-success").classList.remove("hidden");
    setTimeout(() => $("plan-success").classList.add("hidden"), 2200);
    renderFavorites();
    renderPlannedList();
    renderCalendar();
    renderDashboard();
  }

  function resetPlanForm() {
    $("plan-name").value = "";
    $("plan-date").value = todayISO();
    $("plan-type").value = "";
    $("plan-distance").value = "";
    $("plan-time").value = "";
    $("plan-exercise-list").innerHTML = "";
    $("plan-duration").value = "";
    $("plan-notes").value = "";
    $("plan-save-favorite").checked = false;
    $("plan-fields-distance").classList.add("hidden");
    $("plan-fields-lifting").classList.add("hidden");
    $("plan-fields-duration").classList.add("hidden");
  }

  function planSummaryMeta(plan) {
    if (DISTANCE_TYPES.includes(plan.type)) {
      return `${plan.distance.toFixed(2)} mi${plan.timeMinutes ? " · " + plan.timeMinutes + " min" : ""}`;
    } else if (plan.type === "lifting") {
      const n = (plan.exercises || []).length;
      return `${n} exercise${n === 1 ? "" : "s"}`;
    } else {
      return `${plan.duration} min${plan.notes ? " · " + plan.notes : ""}`;
    }
  }

  function renderFavorites() {
    const favorites = favoritesStore.get();
    const container = $("favorites-list");
    if (favorites.length === 0) {
      container.innerHTML = '<p class="empty-state">No favorites saved yet.</p>';
      return;
    }
    container.innerHTML = favorites.map((f) => `
      <div class="favorite-row" data-fav-id="${f.id}">
        <div class="fav-body">
          <p class="fav-title">${TYPE_ICON[f.type] || "•"} ${escapeHTML(f.name)}</p>
          <p class="fav-meta">${TYPE_LABEL[f.type] || f.type} · ${escapeHTML(planSummaryMeta(f))}</p>
        </div>
        <button class="btn-small primary" data-action="use">Use</button>
        <button class="icon-x-btn" data-action="remove" aria-label="Remove favorite">✕</button>
      </div>`).join("");

    container.querySelectorAll(".favorite-row").forEach((row) => {
      const favId = row.dataset.favId;
      row.querySelector('[data-action="use"]').addEventListener("click", () => useFavorite(favId));
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        favoritesStore.save(favoritesStore.get().filter((f) => f.id !== favId));
        renderFavorites();
      });
    });
  }

  function useFavorite(favId) {
    const fav = favoritesStore.get().find((f) => f.id === favId);
    if (!fav) return;
    resetPlanForm();
    $("plan-name").value = fav.name;
    $("plan-date").value = todayISO();
    $("plan-type").value = fav.type;
    $("plan-type").dispatchEvent(new Event("change"));
    if (DISTANCE_TYPES.includes(fav.type)) {
      $("plan-distance").value = fav.distance || "";
      $("plan-time").value = fav.timeMinutes || "";
    } else if (fav.type === "lifting") {
      $("plan-exercise-list").innerHTML = "";
      (fav.exercises || []).forEach((ex) => addPlanExerciseRow(ex));
    } else {
      $("plan-duration").value = fav.duration || "";
      $("plan-notes").value = fav.notes || "";
    }
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function renderPlannedList() {
    const plans = plansStore.get();
    const todayStr = todayISO();
    const upcoming = plans.filter((p) => p.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
    const container = $("planned-list");
    if (upcoming.length === 0) {
      container.innerHTML = '<p class="empty-state">Nothing planned yet.</p>';
      return;
    }
    container.innerHTML = upcoming.map((p) => `
      <div class="planned-item" data-plan-id="${p.id}">
        <div class="recent-icon">${TYPE_ICON[p.type] || "•"}</div>
        <div class="fav-body">
          <p class="fav-title">${escapeHTML(p.name)}</p>
          <p class="fav-meta">${formatShortDate(p.date)} · ${escapeHTML(planSummaryMeta(p))}</p>
        </div>
        <button class="icon-x-btn" data-action="remove" aria-label="Remove plan">✕</button>
      </div>`).join("");

    container.querySelectorAll(".planned-item").forEach((row) => {
      const planId = row.dataset.planId;
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        plansStore.save(plansStore.get().filter((p) => p.id !== planId));
        renderPlannedList();
        renderCalendar();
        renderDashboard();
      });
    });
  }

  /* =========================================================
     Dashboard rendering
     ========================================================= */
  function renderDashboard() {
    const workouts = getWorkouts();
    $("stat-total-workouts").textContent = workouts.length;
    $("stat-streak").textContent = computeStreak(workouts);

    const distanceTotals = { running: 0, walking: 0, swimming: 0, biking: 0 };
    let weightLifted = 0;
    let bodyweightSets = 0;

    workouts.forEach((w) => {
      if (DISTANCE_TYPES.includes(w.type) && typeof w.distance === "number") {
        distanceTotals[w.type] += w.distance;
      }
      if (w.type === "lifting") {
        if (w.bodyweight) {
          bodyweightSets += (w.sets || 0);
        } else {
          weightLifted += (w.weight || 0) * (w.reps || 0) * (w.sets || 0);
        }
      }
    });

    $("stat-running").innerHTML = distanceTotals.running.toFixed(1) + "<small>mi</small>";
    $("stat-walking").innerHTML = distanceTotals.walking.toFixed(1) + "<small>mi</small>";
    $("stat-swimming").innerHTML = distanceTotals.swimming.toFixed(1) + "<small>mi</small>";
    $("stat-biking").innerHTML = distanceTotals.biking.toFixed(1) + "<small>mi</small>";
    $("stat-weight-lifted").innerHTML = Math.round(weightLifted).toLocaleString() + "<small>lbs</small>";
    $("stat-bodyweight-sets").textContent = bodyweightSets;

    renderRecentList(workouts);
    renderDashGoals();
    renderDashUpcoming();
  }

  function renderDashGoals() {
    const goals = goalsStore.get().filter((g) => !g.achieved && !g.cancelled && g.targetDate >= todayISO());
    const container = $("dash-goals-list");
    if (goals.length === 0) {
      container.innerHTML = '<p class="empty-state">No goals set yet. Head to <strong>Fitness goals</strong> to create one.</p>';
      return;
    }
    const workouts = getWorkouts();
    container.innerHTML = goals.slice(0, 3).map((g) => {
      const p = computeGoalProgress(g, workouts);
      return `<div class="recent-item">
        <div class="recent-icon blue">🎯</div>
        <div class="recent-body">
          <p class="recent-title">${escapeHTML(goalTitle(g))}</p>
          <p class="recent-meta">${Math.round(p.pct * 100)}% there · due ${formatShortDate(g.targetDate)}</p>
        </div>
      </div>`;
    }).join("");
  }

  function renderDashUpcoming() {
    const plans = plansStore.get();
    const todayStr = todayISO();
    const weekOut = new Date();
    weekOut.setDate(weekOut.getDate() + 7);
    const weekOutStr = toISO(weekOut);
    const upcoming = plans.filter((p) => p.date >= todayStr && p.date <= weekOutStr).sort((a, b) => a.date.localeCompare(b.date));
    const container = $("dash-upcoming-list");
    if (upcoming.length === 0) {
      container.innerHTML = '<p class="empty-state">Nothing planned for the next 7 days.</p>';
      return;
    }
    container.innerHTML = upcoming.slice(0, 4).map((p) => `
      <div class="recent-item">
        <div class="recent-icon">${TYPE_ICON[p.type] || "•"}</div>
        <div class="recent-body">
          <p class="recent-title">${escapeHTML(p.name)}</p>
          <p class="recent-meta">${escapeHTML(planSummaryMeta(p))}</p>
        </div>
        <div class="recent-date">${formatShortDate(p.date)}</div>
      </div>`).join("");
  }

  function computeStreak(workouts) {
    const daysWithWorkout = new Set(workouts.map((w) => w.date));
    let streak = 0;
    let cursor = new Date();
    // if no workout today, streak counts back from yesterday (today doesn't break a streak until day ends)
    if (!daysWithWorkout.has(toISO(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (daysWithWorkout.has(toISO(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function renderRecentList(workouts) {
    const container = $("recent-list");
    if (workouts.length === 0) {
      container.innerHTML = '<p class="empty-state">No workouts logged yet. Head to <strong>Log workout</strong> to get started.</p>';
      return;
    }
    const sorted = [...workouts].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    const recent = sorted.slice(0, 6);
    container.innerHTML = recent.map(workoutRowHTML).join("");
  }

  function workoutRowHTML(w) {
    const icon = TYPE_ICON[w.type] || "•";
    const title = TYPE_LABEL[w.type] || w.type;
    let meta = "";
    if (DISTANCE_TYPES.includes(w.type)) {
      meta = `${w.distance.toFixed(2)} mi${w.timeMinutes ? " · " + w.timeMinutes + " min" : ""}`;
    } else if (w.type === "lifting") {
      meta = `${w.exerciseName} · ${w.bodyweight ? "Bodyweight" : w.weight + " lbs"} · ${w.reps}×${w.sets}`;
    } else {
      meta = `${w.duration} min${w.notes ? " · " + w.notes : ""}`;
    }
    const accentClass = DISTANCE_TYPES.includes(w.type) ? "blue" : "";
    return `<div class="recent-item">
      <div class="recent-icon ${accentClass}">${icon}</div>
      <div class="recent-body">
        <p class="recent-title">${title}</p>
        <p class="recent-meta">${escapeHTML(meta)}</p>
      </div>
      <div class="recent-date">${formatShortDate(w.date)}</div>
    </div>`;
  }

  /* =========================================================
     Personal bests
     ========================================================= */
  function getActiveBestsType() {
    const activeChip = document.querySelector("#bests-chip-row .chip.active");
    return activeChip ? activeChip.dataset.type : "lifting";
  }

  function wireBests() {
    document.querySelectorAll("#bests-chip-row .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("#bests-chip-row .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        $("bests-search").value = "";
        renderBests(chip.dataset.type);
      });
    });
    $("bests-search").addEventListener("input", () => renderBests(getActiveBestsType()));
  }

  function renderBests(type) {
    $("bests-search-wrap").classList.toggle("hidden", type !== "lifting");
    const workouts = getWorkouts().filter((w) => w.type === type);
    const content = $("bests-content");

    if (workouts.length === 0) {
      content.innerHTML = '<p class="empty-state">No ' + (TYPE_LABEL[type] || type).toLowerCase() + ' workouts logged yet.</p>';
      return;
    }

    if (type === "lifting") {
      const query = ($("bests-search").value || "").trim().toLowerCase();
      const byExercise = {};
      workouts.forEach((w) => {
        if (!w.exerciseName) return;
        const key = w.exerciseName.toLowerCase();
        const current = byExercise[key];
        const score = (w.bodyweight ? 0 : w.weight) * 1000 + w.reps;
        if (!current || score > current.score) {
          byExercise[key] = { name: w.exerciseName, weight: w.weight, reps: w.reps, sets: w.sets, bodyweight: w.bodyweight, date: w.date, score };
        }
      });
      let entries = Object.values(byExercise);
      if (query) entries = entries.filter((e) => e.name.toLowerCase().includes(query));
      entries.sort((a, b) => b.score - a.score);

      if (entries.length === 0) {
        content.innerHTML = '<p class="empty-state">No exercises match your search.</p>';
        return;
      }
      renderBestsPodiumAndList(entries, content, (e) => ({
        value: e.bodyweight ? "BW" : e.weight + " lbs",
        label: e.name,
        meta: `${e.reps} reps × ${e.sets} sets · ${formatShortDate(e.date)}`,
      }));
    } else if (DISTANCE_TYPES.includes(type)) {
      const sorted = [...workouts].sort((a, b) => b.distance - a.distance).slice(0, 8);
      renderBestsPodiumAndList(sorted, content, (w) => ({
        value: w.distance.toFixed(2) + " mi",
        label: TYPE_LABEL[type],
        meta: `${w.timeMinutes ? w.timeMinutes + " min · " : ""}${formatShortDate(w.date)}`,
      }));
    } else {
      const sorted = [...workouts].sort((a, b) => b.duration - a.duration).slice(0, 8);
      renderBestsPodiumAndList(sorted, content, (w) => ({
        value: w.duration + " min",
        label: TYPE_LABEL[type],
        meta: `${w.notes ? w.notes + " · " : ""}${formatShortDate(w.date)}`,
      }));
    }
  }

  function renderBestsPodiumAndList(entries, content, mapFn) {
    const medals = ["🥇", "🥈"];
    const podium = entries.slice(0, 2).map((e, i) => {
      const d = mapFn(e);
      return `<div class="podium-card">
        <span class="podium-medal">${medals[i]}</span>
        <span class="podium-value">${escapeHTML(d.value)}</span>
        <span class="podium-label">${escapeHTML(d.label)}</span>
        <span class="podium-meta">${escapeHTML(d.meta)}</span>
      </div>`;
    }).join("");

    const rest = entries.slice(2).map((e, i) => {
      const d = mapFn(e);
      return `<div class="pr-card">
        <div class="pr-medal">${i + 3}</div>
        <div class="pr-body">
          <p class="pr-title">${escapeHTML(d.label)}</p>
          <p class="pr-meta">${escapeHTML(d.meta)}</p>
        </div>
        <span class="pr-value">${escapeHTML(d.value)}</span>
      </div>`;
    }).join("");

    content.innerHTML = `<div class="podium-row">${podium}</div>` + (rest ? `<div class="pr-grid">${rest}</div>` : "");
  }

  /* =========================================================
     Calendar
     ========================================================= */
  function wireCalendar() {
    $("cal-prev").addEventListener("click", () => {
      calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
      selectedDayISO = null;
      renderCalendar();
    });
    $("cal-next").addEventListener("click", () => {
      calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
      selectedDayISO = null;
      renderCalendar();
    });
  }

  function renderCalendar() {
    const workouts = getWorkouts();
    const workoutDates = new Set(workouts.map((w) => w.date));
    const plannedDates = new Set(plansStore.get().map((p) => p.date));
    const goalDueDates = new Set(goalsStore.get().filter((g) => !g.achieved && !g.cancelled).map((g) => g.targetDate));

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const monthLabel = calendarViewDate.toLocaleString("default", { month: "long", year: "numeric" });
    $("cal-month-label").textContent = monthLabel;

    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = todayISO();

    const grid = $("calendar-grid");
    grid.innerHTML = "";

    for (let i = 0; i < startWeekday; i++) {
      const filler = document.createElement("div");
      filler.className = "cal-day empty";
      grid.appendChild(filler);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const iso = toISO(dateObj);
      const cell = document.createElement("div");
      cell.className = "cal-day";
      cell.textContent = day;

      if (iso === todayStr) {
        cell.classList.add("today");
      } else if (workoutDates.has(iso)) {
        cell.classList.add("trained");
      } else if (iso > todayStr) {
        cell.classList.add(plannedDates.has(iso) ? "planned" : "future");
      } else {
        cell.classList.add("rest");
      }

      if (iso === selectedDayISO) cell.classList.add("selected");

      if (goalDueDates.has(iso)) {
        const flag = document.createElement("span");
        flag.className = "goal-flag";
        flag.textContent = "🎯";
        cell.appendChild(flag);
      }

      cell.addEventListener("click", () => {
        selectedDayISO = iso;
        renderCalendar();
        showDayDetail(iso, workouts);
      });

      grid.appendChild(cell);
    }

    if (selectedDayISO) {
      showDayDetail(selectedDayISO, workouts);
    } else {
      $("day-detail").classList.add("hidden");
    }
  }

  function showDayDetail(iso, workouts) {
    const detail = $("day-detail");
    detail.classList.remove("hidden");
    $("day-detail-title").textContent = "Workouts on " + formatLongDate(iso);

    const dayWorkouts = workouts.filter((w) => w.date === iso);
    const dayPlans = plansStore.get().filter((p) => p.date === iso);
    const listEl = $("day-detail-list");

    if (dayWorkouts.length === 0 && dayPlans.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No workouts logged for this day.</p>';
      return;
    }
    let html = dayWorkouts.map(workoutRowHTML).join("");
    html += dayPlans.map((p) => `<div class="planned-item">
      <div class="recent-icon">${TYPE_ICON[p.type] || "•"}</div>
      <div class="fav-body">
        <p class="fav-title">${escapeHTML(p.name)} <span style="color:var(--blue); font-size:11px;">PLANNED</span></p>
        <p class="fav-meta">${escapeHTML(planSummaryMeta(p))}</p>
      </div>
    </div>`).join("");
    listEl.innerHTML = html;
  }

  /* =========================================================
     Workout journal
     ========================================================= */
  let journalViewDate = new Date();
  let journalSaveTimer = null;

  function wireJournal() {
    $("journal-prev").addEventListener("click", () => {
      journalViewDate.setDate(journalViewDate.getDate() - 1);
      renderJournalDay();
    });
    $("journal-next").addEventListener("click", () => {
      const iso = toISO(journalViewDate);
      if (iso >= todayISO()) return; // can't go past today
      journalViewDate.setDate(journalViewDate.getDate() + 1);
      renderJournalDay();
    });
    $("journal-textarea").addEventListener("input", () => {
      const iso = toISO(journalViewDate);
      const journal = getJournal();
      journal[iso] = $("journal-textarea").value;
      saveJournal(journal);
      $("journal-save-note").textContent = "Saved ✓";
      clearTimeout(journalSaveTimer);
      journalSaveTimer = setTimeout(() => { $("journal-save-note").textContent = ""; }, 1500);
    });
  }

  function renderJournalDay() {
    const iso = toISO(journalViewDate);
    const todayStr = todayISO();
    const journal = getJournal();

    if (iso === todayStr) {
      $("journal-date-label").textContent = "Today";
    } else {
      $("journal-date-label").textContent = formatShortDate(iso) + (iso.slice(0, 4) !== todayStr.slice(0, 4) ? ", " + iso.slice(0, 4) : "");
    }

    $("journal-textarea").value = journal[iso] || "";
    $("journal-textarea").disabled = false;
    $("journal-next").disabled = iso >= todayStr;
    $("journal-lock-note").textContent = iso === todayStr ? "" : "Viewing a past entry — you can still edit it.";
    $("journal-save-note").textContent = "";
  }

  /* =========================================================
     Fitness goals
     ========================================================= */
  function wireGoalsForm() {
    const typeSelect = $("goal-type");
    typeSelect.addEventListener("change", () => {
      const type = typeSelect.value;
      $("goal-fields-distance").classList.toggle("hidden", type !== "distance");
      $("goal-fields-weight").classList.toggle("hidden", type !== "weight");
      $("goal-fields-frequency").classList.toggle("hidden", type !== "frequency");
      $("err-goal").textContent = "";
    });

    $("goal-distance-metric").addEventListener("change", () => {
      const isTime = $("goal-distance-metric").value === "time";
      $("goal-distance-target-label").textContent = isTime ? "Target time (min)" : "Target distance (mi)";
      $("goal-distance-target").placeholder = isTime ? "e.g. 30" : "e.g. 5";
    });
    $("goal-weight-metric").addEventListener("change", () => {
      const isReps = $("goal-weight-metric").value === "reps";
      $("goal-weight-target-label").textContent = isReps ? "Target reps" : "Target weight (lbs)";
      $("goal-weight-target").placeholder = isReps ? "e.g. 15" : "e.g. 200";
    });

    $("btn-save-goal").addEventListener("click", handleSaveGoal);
  }

  function refreshKnownExercisesDatalist() {
    const workouts = getWorkouts().filter((w) => w.type === "lifting" && w.exerciseName);
    const names = Array.from(new Set(workouts.map((w) => w.exerciseName)));
    $("known-exercises").innerHTML = names.map((n) => `<option value="${escapeHTML(n)}"></option>`).join("");
  }

  function handleSaveGoal() {
    const errEl = $("err-goal");
    errEl.textContent = "";

    const type = $("goal-type").value;
    const targetDate = $("goal-date").value;
    if (!targetDate) { errEl.textContent = "Choose a target date."; return; }

    const goal = {
      id: makeId("goal"),
      type, targetDate,
      createdAt: new Date().toISOString(),
      achieved: false,
      cancelled: false,
    };

    if (type === "distance") {
      const activity = $("goal-activity").value;
      const metric = $("goal-distance-metric").value;
      const target = Number($("goal-distance-target").value);
      if (!$("goal-distance-target").value || !(target > 0)) { errEl.textContent = "Enter a target greater than 0."; return; }
      goal.activity = activity;
      goal.metric = metric;
      goal.target = target;
    } else if (type === "weight") {
      const exerciseName = $("goal-exercise-name").value.trim();
      const metric = $("goal-weight-metric").value;
      const target = Number($("goal-weight-target").value);
      if (!exerciseName) { errEl.textContent = "Enter the exercise name."; return; }
      if (!$("goal-weight-target").value || !(target > 0)) { errEl.textContent = "Enter a target greater than 0."; return; }
      goal.exerciseName = exerciseName;
      goal.metric = metric;
      goal.target = target;
    } else if (type === "frequency") {
      const target = Number($("goal-frequency-target").value);
      if (!$("goal-frequency-target").value || !(target > 0)) { errEl.textContent = "Enter a target workout count."; return; }
      goal.target = target;
    }

    const goals = goalsStore.get();
    goals.push(goal);
    goalsStore.save(goals);

    resetGoalForm();
    showSuccessOverlay("goal-success-overlay", "goal-form-wrap", null);
    renderGoalsLists();
    renderDashboard();
    renderCalendar();
  }

  function resetGoalForm() {
    $("goal-type").value = "distance";
    $("goal-type").dispatchEvent(new Event("change"));
    $("goal-activity").value = "running";
    $("goal-distance-metric").value = "distance";
    $("goal-distance-target-label").textContent = "Target distance (mi)";
    $("goal-distance-target").value = "";
    $("goal-exercise-name").value = "";
    $("goal-weight-metric").value = "weight";
    $("goal-weight-target-label").textContent = "Target weight (lbs)";
    $("goal-weight-target").value = "";
    $("goal-frequency-target").value = "";
    $("goal-date").value = todayISO();
  }

  function goalTitle(g) {
    if (g.type === "distance") {
      const label = g.metric === "time" ? `${g.target} min` : `${g.target} mi`;
      return `${TYPE_ICON[g.activity] || "•"} ${TYPE_LABEL[g.activity] || g.activity}: ${label}`;
    } else if (g.type === "weight") {
      const label = g.metric === "reps" ? `${g.target} reps` : `${g.target} lbs`;
      return `🏋️ ${g.exerciseName}: ${label}`;
    } else {
      return `📈 ${g.target} workouts`;
    }
  }

  function computeGoalProgress(g, workouts) {
    let current = 0;
    let pct = 0;
    let unit = "";

    if (g.type === "distance") {
      const relevant = workouts.filter((w) => w.type === g.activity && w.date >= g.createdAt.slice(0, 10));
      if (g.metric === "time") {
        const best = relevant.filter((w) => w.timeMinutes).map((w) => w.timeMinutes);
        current = best.length ? Math.min(...best) : 0;
        pct = current > 0 ? Math.min(g.target / current, 1) : 0;
        unit = "min (fastest)";
      } else {
        const best = relevant.filter((w) => typeof w.distance === "number").map((w) => w.distance);
        current = best.length ? Math.max(...best) : 0;
        pct = Math.min(current / g.target, 1);
        unit = "mi (best)";
      }
    } else if (g.type === "weight") {
      const relevant = workouts.filter((w) => w.type === "lifting" && w.exerciseName && w.exerciseName.toLowerCase() === g.exerciseName.toLowerCase());
      if (g.metric === "reps") {
        const best = relevant.map((w) => w.reps || 0);
        current = best.length ? Math.max(...best) : 0;
        unit = "reps (best)";
      } else {
        const best = relevant.filter((w) => !w.bodyweight).map((w) => w.weight || 0);
        current = best.length ? Math.max(...best) : 0;
        unit = "lbs (best)";
      }
      pct = g.target > 0 ? Math.min(current / g.target, 1) : 0;
    } else if (g.type === "frequency") {
      const relevant = workouts.filter((w) => w.date >= g.createdAt.slice(0, 10));
      current = relevant.length;
      pct = Math.min(current / g.target, 1);
      unit = "workouts";
    }
    return { current, pct, unit };
  }

  function renderGoalsLists() {
    refreshKnownExercisesDatalist();
    const goals = goalsStore.get();
    const workouts = getWorkouts();
    const todayStr = todayISO();
    let changed = false;

    goals.forEach((g) => {
      if (!g.achieved && !g.cancelled) {
        const p = computeGoalProgress(g, workouts);
        if (p.pct >= 1) { g.achieved = true; g.achievedAt = new Date().toISOString(); changed = true; }
      }
    });
    if (changed) goalsStore.save(goals);

    const active = goals.filter((g) => !g.achieved && !g.cancelled && g.targetDate >= todayStr);
    const achieved = goals.filter((g) => g.achieved);
    const inactive = goals.filter((g) => !g.achieved && (g.cancelled || g.targetDate < todayStr));

    $("goals-active-list").innerHTML = active.length === 0
      ? '<p class="empty-state">No active goals.</p>'
      : active.map((g) => {
        const p = computeGoalProgress(g, workouts);
        return `<div class="goal-card" data-goal-id="${g.id}">
          <div class="goal-icon">${g.type === "weight" ? "🏋️" : g.type === "frequency" ? "📈" : (TYPE_ICON[g.activity] || "🎯")}</div>
          <div class="goal-body">
            <p class="goal-title">${escapeHTML(goalTitle(g))}</p>
            <p class="goal-meta">Due ${formatShortDate(g.targetDate)} · ${p.current} ${escapeHTML(p.unit)} so far</p>
            <div class="goal-progress-track"><div class="goal-progress-fill" style="width:${Math.round(p.pct * 100)}%"></div></div>
            <div class="goal-actions">
              <button class="btn-small" data-action="cancel">Cancel goal</button>
            </div>
          </div>
        </div>`;
      }).join("");

    $("goals-achieved-list").innerHTML = achieved.length === 0
      ? '<p class="empty-state">No goals achieved yet — keep going.</p>'
      : achieved.map((g) => `<div class="goal-card achieved" data-goal-id="${g.id}">
          <div class="goal-icon">${g.type === "weight" ? "🏋️" : g.type === "frequency" ? "📈" : (TYPE_ICON[g.activity] || "🎯")}</div>
          <div class="goal-body">
            <p class="goal-title">${escapeHTML(goalTitle(g))}</p>
            <p class="goal-meta">Achieved</p>
            <span class="goal-badge achieved">✓ Achieved</span>
          </div>
        </div>`).join("");

    $("goals-inactive-list").innerHTML = inactive.length === 0
      ? '<p class="empty-state">Nothing here.</p>'
      : inactive.map((g) => `<div class="goal-card expired-inactive" data-goal-id="${g.id}">
          <div class="goal-icon">${g.type === "weight" ? "🏋️" : g.type === "frequency" ? "📈" : (TYPE_ICON[g.activity] || "🎯")}</div>
          <div class="goal-body">
            <p class="goal-title">${escapeHTML(goalTitle(g))}</p>
            <span class="goal-badge ${g.cancelled ? "cancelled" : "expired"}">${g.cancelled ? "Cancelled" : "Expired"}</span>
          </div>
        </div>`).join("");

    document.querySelectorAll('#goals-active-list [data-action="cancel"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const goalId = e.target.closest(".goal-card").dataset.goalId;
        const list = goalsStore.get();
        const g = list.find((x) => x.id === goalId);
        if (g) { g.cancelled = true; goalsStore.save(list); renderGoalsLists(); }
      });
    });
  }

  /* =========================================================
     Meal tracking
     ========================================================= */
  const MEAL_TYPE_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
  const MEAL_TYPE_ICON = { breakfast: "🍳", lunch: "🥪", dinner: "🍽️", snack: "🍎" };
  const MACRO_FIELDS = ["calories", "protein", "carbs", "fat", "sugar", "fiber", "sodium", "cholesterol"];

  function wireMealsForm() {
    $("btn-save-meal").addEventListener("click", handleSaveMeal);
  }

  function handleSaveMeal() {
    const errEl = $("err-meal");
    errEl.textContent = "";

    const date = $("meal-date").value;
    const mealType = $("meal-type").value;
    const name = $("meal-name").value.trim();

    if (!date) { errEl.textContent = "Choose a date."; return; }
    if (!name) { errEl.textContent = "Enter a meal name."; return; }

    const meal = { id: makeId("meal"), date, mealType, name, createdAt: new Date().toISOString() };
    MACRO_FIELDS.forEach((f) => {
      const val = $("meal-" + f).value;
      meal[f] = val === "" ? null : Number(val);
    });

    const meals = mealsStore.get();
    meals.push(meal);
    mealsStore.save(meals);

    resetMealForm();
    showSuccessOverlay("meal-success-overlay", "meal-form-wrap", null);
    renderMealsToday();
    renderMealCalendar();
  }

  function resetMealForm() {
    $("meal-date").value = todayISO();
    $("meal-type").value = "breakfast";
    $("meal-name").value = "";
    MACRO_FIELDS.forEach((f) => { $("meal-" + f).value = ""; });
  }

  function sumMacros(meals) {
    const totals = {};
    MACRO_FIELDS.forEach((f) => { totals[f] = 0; });
    meals.forEach((m) => MACRO_FIELDS.forEach((f) => { totals[f] += (m[f] || 0); }));
    return totals;
  }

  function mealRowHTML(m) {
    const icon = MEAL_TYPE_ICON[m.mealType] || "🍽️";
    const bits = [];
    if (m.calories != null) bits.push(m.calories + " cal");
    if (m.protein != null) bits.push(m.protein + "g protein");
    if (m.carbs != null) bits.push(m.carbs + "g carbs");
    if (m.fat != null) bits.push(m.fat + "g fat");
    return `<div class="recent-item" data-meal-id="${m.id}">
      <div class="recent-icon">${icon}</div>
      <div class="recent-body">
        <p class="recent-title">${escapeHTML(m.name)}</p>
        <p class="recent-meta">${escapeHTML(bits.join(" · ") || "No macros logged")}</p>
      </div>
      <button class="icon-x-btn" data-action="remove" aria-label="Delete meal">✕</button>
    </div>`;
  }

  function renderMealsToday() {
    const todayStr = todayISO();
    const meals = mealsStore.get().filter((m) => m.date === todayStr);
    const totals = sumMacros(meals);

    $("stat-meal-calories").textContent = Math.round(totals.calories);
    $("stat-meal-protein").innerHTML = Math.round(totals.protein) + "<small>g</small>";
    $("stat-meal-carbs").innerHTML = Math.round(totals.carbs) + "<small>g</small>";
    $("stat-meal-fat").innerHTML = Math.round(totals.fat) + "<small>g</small>";
    $("meal-secondary-totals").textContent =
      `Sugar ${Math.round(totals.sugar)}g · Fiber ${Math.round(totals.fiber)}g · Sodium ${Math.round(totals.sodium)}mg · Cholesterol ${Math.round(totals.cholesterol)}mg`;

    const container = $("todays-meals-list");
    if (meals.length === 0) {
      container.innerHTML = '<p class="empty-state">No meals logged today.</p>';
      return;
    }
    const order = ["breakfast", "lunch", "dinner", "snack"];
    const sorted = [...meals].sort((a, b) => order.indexOf(a.mealType) - order.indexOf(b.mealType) || a.createdAt.localeCompare(b.createdAt));
    container.innerHTML = sorted.map(mealRowHTML).join("");
    wireMealDeleteButtons(container, renderMealsToday);
  }

  function wireMealDeleteButtons(container, refreshFn) {
    container.querySelectorAll('[data-action="remove"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const mealId = e.target.closest("[data-meal-id]").dataset.mealId;
        mealsStore.save(mealsStore.get().filter((m) => m.id !== mealId));
        refreshFn();
        renderMealCalendar();
      });
    });
  }

  let mealCalendarViewDate = new Date();
  let selectedMealDayISO = null;

  function wireMealCalendar() {
    $("meal-cal-prev").addEventListener("click", () => {
      mealCalendarViewDate.setMonth(mealCalendarViewDate.getMonth() - 1);
      selectedMealDayISO = null;
      renderMealCalendar();
    });
    $("meal-cal-next").addEventListener("click", () => {
      mealCalendarViewDate.setMonth(mealCalendarViewDate.getMonth() + 1);
      selectedMealDayISO = null;
      renderMealCalendar();
    });
  }

  function renderMealCalendar() {
    const meals = mealsStore.get();
    const mealDates = new Set(meals.map((m) => m.date));

    const year = mealCalendarViewDate.getFullYear();
    const month = mealCalendarViewDate.getMonth();
    $("meal-cal-month-label").textContent = mealCalendarViewDate.toLocaleString("default", { month: "long", year: "numeric" });

    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = todayISO();

    const grid = $("meal-calendar-grid");
    grid.innerHTML = "";

    for (let i = 0; i < startWeekday; i++) {
      const filler = document.createElement("div");
      filler.className = "cal-day empty";
      grid.appendChild(filler);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const iso = toISO(dateObj);
      const cell = document.createElement("div");
      cell.className = "cal-day";
      cell.textContent = day;

      if (iso === todayStr) cell.classList.add("today");
      else if (iso > todayStr) cell.classList.add("future");
      else if (mealDates.has(iso)) cell.classList.add("trained");
      else cell.classList.add("rest");

      if (iso === selectedMealDayISO) cell.classList.add("selected");

      cell.addEventListener("click", () => {
        selectedMealDayISO = iso;
        renderMealCalendar();
        showMealDayDetail(iso);
      });

      grid.appendChild(cell);
    }

    if (selectedMealDayISO) {
      showMealDayDetail(selectedMealDayISO);
    } else {
      $("meal-day-detail").classList.add("hidden");
    }
  }

  function showMealDayDetail(iso) {
    const detail = $("meal-day-detail");
    detail.classList.remove("hidden");
    $("meal-day-detail-title").textContent = "Meals on " + formatLongDate(iso);

    const dayMeals = mealsStore.get().filter((m) => m.date === iso);
    const totals = sumMacros(dayMeals);
    $("meal-day-detail-totals").textContent = dayMeals.length === 0 ? "" :
      `${Math.round(totals.calories)} cal · ${Math.round(totals.protein)}g protein · ${Math.round(totals.carbs)}g carbs · ${Math.round(totals.fat)}g fat`;

    const listEl = $("meal-day-detail-list");
    if (dayMeals.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No meals logged for this day.</p>';
      return;
    }
    listEl.innerHTML = dayMeals.map(mealRowHTML).join("");
    wireMealDeleteButtons(listEl, () => showMealDayDetail(iso));
  }

  /* =========================================================
     Profile edit
     ========================================================= */
  function fillProfileEditForm() {
    const profile = getProfile();
    if (!profile) return;
    $("ed-name").value = profile.name;
    $("ed-age").value = profile.age;
    $("ed-height-ft").value = profile.heightFeet;
    $("ed-height-in").value = profile.heightInches;
    $("ed-weight").value = profile.weight;
    $("ed-created").textContent = formatLongDate(profile.createdAt.slice(0, 10));
    ["err-ed-name", "err-ed-age", "err-ed-height", "err-ed-weight"].forEach((id) => $(id).textContent = "");
    $("profile-saved-msg").classList.add("hidden");
  }

  function wireProfileEditForm() {
    $("profile-edit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("ed-name").value;
      const age = $("ed-age").value;
      const ft = $("ed-height-ft").value;
      const inch = $("ed-height-in").value;
      const weight = $("ed-weight").value;

      const nameErr = validateName(name);
      const ageErr = validateAge(age);
      const heightErr = validateHeight(ft, inch);
      const weightErr = validateWeight(weight);

      $("err-ed-name").textContent = nameErr;
      $("err-ed-age").textContent = ageErr;
      $("err-ed-height").textContent = heightErr;
      $("err-ed-weight").textContent = weightErr;

      if (nameErr || ageErr || heightErr || weightErr) return;

      const existing = getProfile();
      const updated = {
        ...existing,
        name: name.trim(),
        age: Number(age),
        heightFeet: Number(ft),
        heightInches: Number(inch),
        weight: Number(weight),
      };
      saveProfile(updated);

      $("dash-name").textContent = updated.name;
      $("sidebar-name").textContent = updated.name;
      $("sidebar-initial").textContent = updated.name.charAt(0).toUpperCase();

      $("profile-saved-msg").classList.remove("hidden");
      setTimeout(() => $("profile-saved-msg").classList.add("hidden"), 2500);
    });
  }

  /* =========================================================
     Utilities
     ========================================================= */
  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function todayISO() { return toISO(new Date()); }

  function formatShortDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("default", { month: "short", day: "numeric" });
  }
  function formatLongDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("default", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
