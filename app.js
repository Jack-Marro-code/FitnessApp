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
  const REST_DAYS_KEY = "pulse_rest_days";

  // Wraps localStorage.setItem so a failure (private-browsing mode, storage
  // quota exceeded, disabled storage, etc.) is caught and reported instead of
  // throwing silently — previously an uncaught error here could make whatever
  // button triggered the save look completely dead, with no feedback at all.
  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage write failed for", key, e);
      notifyStorageFailure();
      return false;
    }
  }

  let storageWarningTimer = null;
  function notifyStorageFailure() {
    let banner = document.getElementById("storage-warning-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "storage-warning-banner";
      banner.className = "storage-warning-banner";
      banner.textContent = "Couldn't save — your browser's storage is full or blocked (this can happen in private browsing). Your last change wasn't saved.";
      document.body.appendChild(banner);
    }
    banner.classList.add("visible");
    clearTimeout(storageWarningTimer);
    storageWarningTimer = setTimeout(() => banner.classList.remove("visible"), 5000);
  }

  function getProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveProfile(profile) {
    return safeStorageSet(PROFILE_KEY, profile);
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
    return safeStorageSet(WORKOUTS_KEY, list);
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
        return safeStorageSet(key, list);
      },
    };
  }
  const plansStore = makeStore(PLANS_KEY);
  const favoritesStore = makeStore(FAVORITES_KEY);
  const goalsStore = makeStore(GOALS_KEY);
  const mealsStore = makeStore(MEALS_KEY);
  const restDaysStore = makeStore(REST_DAYS_KEY); // array of ISO date strings the person marked as an intentional rest/recovery day

  function getRestDaySet() {
    return new Set(restDaysStore.get());
  }
  function isRestDay(iso) {
    return restDaysStore.get().includes(iso);
  }
  function toggleRestDay(iso) {
    const days = restDaysStore.get();
    const idx = days.indexOf(iso);
    if (idx >= 0) {
      days.splice(idx, 1);
    } else {
      days.push(iso);
    }
    restDaysStore.save(days);
    return idx < 0; // true if the day is now marked as rest
  }

  function getJournal() {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  function saveJournal(obj) {
    return safeStorageSet(JOURNAL_KEY, obj);
  }

  function makeId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }

  const DISTANCE_TYPES = ["running", "walking", "swimming", "biking"];
  const DURATION_TYPES = ["yoga", "hiit", "sports"];

  // Lifting workouts are now stored as ONE entry per session with an `exercises` array,
  // each exercise optionally having multiple weight/rep/set "sets" and drop sets.
  // entry.completed = false means it's a saved draft that doesn't count toward stats yet.
  function liftingEntryWeightTotal(entry) {
    // sums weight*reps*sets across all exercises/sets/drop-sets in a lifting session entry
    let total = 0;
    let bwSets = 0;
    (entry.exercises || []).forEach((ex) => {
      (ex.sets || []).forEach((s) => {
        if (ex.bodyweight) {
          bwSets += (s.sets || 0);
        } else {
          total += (s.weight || 0) * (s.reps || 0) * (s.sets || 0);
        }
        (s.dropSets || []).forEach((ds) => {
          if (ex.bodyweight) {
            bwSets += (ds.sets || 0);
          } else {
            total += (ds.weight || 0) * (ds.reps || 0) * (ds.sets || 0);
          }
        });
      });
    });
    return { weight: total, bodyweightSets: bwSets };
  }

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

  /* =========================================================
     Global error surfacing — an uncaught error used to leave the app
     silently stuck (blank view, dead button) with no clue why. Now it
     shows a visible message so the actual problem can be diagnosed.
     ========================================================= */
  window.addEventListener("error", (e) => {
    showFatalErrorBanner(e.message || "Something went wrong.");
  });

  function showFatalErrorBanner(message) {
    let banner = document.getElementById("fatal-error-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "fatal-error-banner";
      banner.className = "storage-warning-banner visible";
      document.body.appendChild(banner);
    }
    banner.textContent = "Something broke: " + message + " — try reloading the page. If it keeps happening, please report this.";
  }

  function enterApp() {
    screenWelcome.classList.add("hidden");
    screenOnboarding.classList.add("hidden");
    appShell.classList.remove("hidden");
    try {
      initAppShell();
    } catch (e) {
      console.error(e);
      showFatalErrorBanner(e.message);
    }
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
        // navigating to Log workout from the menu (as opposed to via "Edit" in History)
        // means the person wants a fresh form, so cancel any in-progress edit.
        // (Bug fix: this used to only check editingSimpleWorkoutId, so an abandoned
        // lifting-draft edit left editingDraftId stale — the next "new" workout would
        // silently overwrite that old draft instead of being created, or throw if the
        // draft had since been deleted, making the Log workout button appear dead.)
        if (btn.dataset.view === "log" && (editingSimpleWorkoutId || editingDraftId)) {
          editingSimpleWorkoutId = null;
          editingDraftId = null;
          $("btn-log-workout-simple").textContent = "Log workout";
          resetLogForm();
        }
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
    wireHistory();
    wireDashTabs();
    wireDashSectionTabs();
    wireOverloadTab();
    wireLogRestDayBanner();

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

    renderLogDrafts();
    renderLogRestDayBanner();
    renderDashboard();
  }

  const VIEW_TITLES = {
    dashboard: "Dashboard", log: "Log workout", plan: "Plan workout", bests: "Personal bests",
    journal: "Workout journal", goals: "Fitness goals",
    meals: "Meal tracking", profile: "Profile", history: "History",
  };

  function showView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    $("view-" + name).classList.remove("hidden");
    $("topbar-heading").textContent = VIEW_TITLES[name];
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

    try {
      if (name === "dashboard") renderDashboard();
      if (name === "profile") fillProfileEditForm();
      if (name === "plan") { renderFavorites(); renderPlannedList(); }
      if (name === "bests") renderBests(getActiveBestsType());
      if (name === "journal") renderJournalDay();
      if (name === "goals") renderGoalsLists();
      if (name === "meals") { renderMealsToday(); renderMealCalendar(); }
      if (name === "log") { renderLogDrafts(); renderLogRestDayBanner(); refreshKnownExercisesDatalist(); }
      if (name === "history") renderHistory(getActiveHistoryType());
    } catch (e) {
      console.error("Failed to render view:", name, e);
      showFatalErrorBanner(e.message);
    }
  }

  function goToView(name) {
    const link = document.querySelector('.nav-link[data-view="' + name + '"]');
    if (link) {
      document.querySelectorAll(".nav-link").forEach((b) => b.classList.remove("active"));
      link.classList.add("active");
    }
    showView(name);
  }

  /* =========================================================
     Log workout form
     ========================================================= */
  let logExerciseRowCount = 0;
  let editingDraftId = null; // if set, we're completing/editing an existing draft rather than creating new
  let editingSimpleWorkoutId = null; // if set, the simple log button is in "update" mode for this history entry

  function wireLogForm() {
    const typeSelect = $("log-type");
    typeSelect.addEventListener("change", () => {
      const type = typeSelect.value;
      $("fields-distance").classList.toggle("hidden", !DISTANCE_TYPES.includes(type));
      $("fields-lifting").classList.toggle("hidden", type !== "lifting");
      $("fields-duration").classList.toggle("hidden", !DURATION_TYPES.includes(type));
      $("log-lifting-actions").classList.toggle("hidden", type !== "lifting");
      $("btn-log-workout-simple").classList.toggle("hidden", type === "lifting");
      $("err-log").textContent = "";
      if (type === "lifting" && $("log-exercise-list").children.length === 0) {
        addLogExerciseRow();
      }
    });

    $("btn-add-log-exercise").addEventListener("click", () => addLogExerciseRow());
    $("btn-save-log-draft").addEventListener("click", () => handleLogLifting(false));
    $("btn-log-workout").addEventListener("click", () => handleLogLifting(true));
    $("btn-log-workout-simple").addEventListener("click", handleLogSimple);

    // default to lifting on load
    typeSelect.value = "lifting";
    typeSelect.dispatchEvent(new Event("change"));
  }

  const ENCOURAGEMENTS = [
    "Nice work — keep the momentum going.",
    "That's another one in the books.",
    "Consistency is the whole game. Well done.",
    "Logged. Your future self says thanks.",
  ];

  /* ---- Multi-exercise lifting row builder (mirrors plan workout) ---- */
  function addLogExerciseRow(prefill) {
    logExerciseRowCount++;
    const rowId = "ler_" + logExerciseRowCount;
    const wrap = document.createElement("div");
    wrap.className = "plan-exercise-row";
    wrap.dataset.rowId = rowId;
    wrap.innerHTML = `
      <button type="button" class="remove-row" aria-label="Remove exercise">✕</button>
      <div class="field">
        <label>Exercise name</label>
        <input type="text" class="le-name" list="known-exercises" placeholder="e.g. Bench press" />
        <span class="le-name-hint hidden"></span>
      </div>
      <div class="field">
        <label>Muscle group</label>
        <select class="le-muscle">
          <option value="">Select a muscle group…</option>
          <option value="chest">Chest</option>
          <option value="back">Back</option>
          <option value="shoulders">Shoulders</option>
          <option value="biceps">Biceps</option>
          <option value="triceps">Triceps</option>
          <option value="legs">Legs</option>
          <option value="glutes">Glutes</option>
          <option value="core">Core</option>
          <option value="full-body">Full body</option>
        </select>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" class="le-bodyweight" />
        <span>Bodyweight exercise</span>
      </label>
      <div class="weight-set-list"></div>
      <button type="button" class="btn-ghost small le-add-set">+ Add weight/set</button>
    `;
    $("log-exercise-list").appendChild(wrap);

    wrap.querySelector(".remove-row").addEventListener("click", () => wrap.remove());
    wrap.querySelector(".le-bodyweight").addEventListener("change", () => {
      const isBW = wrap.querySelector(".le-bodyweight").checked;
      wrap.querySelectorAll(".le-weight").forEach((inp) => {
        inp.classList.toggle("hidden", isBW);
        if (isBW) inp.value = "";
      });
    });
    wrap.querySelector(".le-add-set").addEventListener("click", () => addWeightSetRow(wrap));
    wireExerciseNameSuggestion(wrap.querySelector(".le-name"), wrap.querySelector(".le-name-hint"));

    if (prefill) {
      wrap.querySelector(".le-name").value = prefill.name || "";
      wrap.querySelector(".le-muscle").value = prefill.muscleGroup || "";
      wrap.querySelector(".le-bodyweight").checked = !!prefill.bodyweight;
      (prefill.sets && prefill.sets.length ? prefill.sets : [{}]).forEach((s) => addWeightSetRow(wrap, s, prefill.bodyweight));
      if (prefill.bodyweight) {
        wrap.querySelectorAll(".le-weight").forEach((inp) => inp.classList.add("hidden"));
      }
    } else {
      addWeightSetRow(wrap);
    }
    return wrap;
  }

  function addWeightSetRow(exerciseWrap, prefillSet, isBodyweight) {
    const list = exerciseWrap.querySelector(".weight-set-list");
    const row = document.createElement("div");
    row.className = "weight-set-row";
    row.innerHTML = `
      <input type="text" inputmode="decimal" class="le-weight${isBodyweight ? " hidden" : ""}" placeholder="Weight (lbs)" />
      <input type="text" inputmode="numeric" class="le-reps" placeholder="Reps" />
      <input type="text" inputmode="numeric" class="le-sets" placeholder="Sets (default 1)" />
      <button type="button" class="remove-set" aria-label="Remove">✕</button>
    `;
    list.appendChild(row);
    if (prefillSet) {
      row.querySelector(".le-weight").value = prefillSet.weight || "";
      row.querySelector(".le-reps").value = prefillSet.reps || "";
      row.querySelector(".le-sets").value = prefillSet.sets || "";
    }
    row.querySelector(".remove-set").addEventListener("click", () => {
      // keep at least one row
      if (list.children.length > 1) row.remove();
    });

    // drop set support
    const dropWrap = document.createElement("div");
    dropWrap.className = "dropset-list hidden";
    dropWrap.innerHTML = `<span class="dropset-label">Drop sets</span>`;
    row.insertAdjacentElement("afterend", dropWrap);
    row.dropWrap = dropWrap;

    const dropToggleBtn = document.createElement("button");
    dropToggleBtn.type = "button";
    dropToggleBtn.className = "btn-ghost small";
    dropToggleBtn.textContent = "+ Add drop set";
    dropWrap.insertAdjacentElement("afterend", dropToggleBtn);
    dropToggleBtn.addEventListener("click", () => {
      dropWrap.classList.remove("hidden");
      addDropSetRow(dropWrap, exerciseWrap);
    });
    row.dropToggleBtn = dropToggleBtn;
  }

  function addDropSetRow(dropWrap, exerciseWrap, prefill) {
    const isBW = exerciseWrap.querySelector(".le-bodyweight").checked;
    const row = document.createElement("div");
    row.className = "dropset-row";
    row.innerHTML = `
      <input type="text" inputmode="decimal" class="ds-weight${isBW ? " hidden" : ""}" placeholder="Weight (lbs)" />
      <input type="text" inputmode="numeric" class="ds-reps" placeholder="Reps" />
      <input type="text" inputmode="numeric" class="ds-sets" placeholder="Sets" />
      <button type="button" class="remove-set" aria-label="Remove">✕</button>
    `;
    dropWrap.appendChild(row);
    if (prefill) {
      row.querySelector(".ds-weight").value = prefill.weight || "";
      row.querySelector(".ds-reps").value = prefill.reps || "";
      row.querySelector(".ds-sets").value = prefill.sets || "";
    }
    row.querySelector(".remove-set").addEventListener("click", () => {
      row.remove();
      if (dropWrap.querySelectorAll(".dropset-row").length === 0) dropWrap.classList.add("hidden");
    });
  }

  function collectLogExercises() {
    const rows = Array.from(document.querySelectorAll("#log-exercise-list .plan-exercise-row"));
    return rows.map((row) => {
      const name = row.querySelector(".le-name").value.trim();
      const muscleGroup = row.querySelector(".le-muscle").value;
      const bodyweight = row.querySelector(".le-bodyweight").checked;
      const setRows = Array.from(row.querySelectorAll(".weight-set-row"));
      const sets = setRows.map((setRow) => {
        const dropRows = setRow.dropWrap ? Array.from(setRow.dropWrap.querySelectorAll(".dropset-row")) : [];
        const dropSets = dropRows.map((dr) => ({
          weight: Number(dr.querySelector(".ds-weight").value) || 0,
          reps: Number(dr.querySelector(".ds-reps").value) || 0,
          sets: dr.querySelector(".ds-sets").value.trim() === "" ? 1 : (Number(dr.querySelector(".ds-sets").value) || 0),
        })).filter((ds) => ds.reps > 0 && ds.sets > 0);
        const setsRaw = setRow.querySelector(".le-sets").value.trim();
        return {
          weight: bodyweight ? 0 : (Number(setRow.querySelector(".le-weight").value) || 0),
          reps: Number(setRow.querySelector(".le-reps").value) || 0,
          // Leaving "Sets" blank means "just the one" — default to 1 rather than
          // treating it as 0 and silently dropping an otherwise-filled-in row.
          sets: setsRaw === "" ? 1 : (Number(setsRaw) || 0),
          dropSets,
        };
      }).filter((s) => s.reps > 0 && s.sets > 0);
      return { name, muscleGroup, bodyweight, sets };
    }).filter((ex) => ex.name && ex.sets.length > 0);
  }

  function handleLogLifting(complete) {
    const errEl = $("err-log");
    errEl.textContent = "";

    const date = $("log-date").value;
    if (!date) { errEl.textContent = "Please choose a date."; return; }

    const exercises = collectLogExercises();
    if (exercises.length === 0) { errEl.textContent = "Add at least one exercise with a weight/rep/set entry."; return; }

    const workouts = getWorkouts();
    let entry = editingDraftId ? workouts.find((w) => w.id === editingDraftId) : null;
    if (editingDraftId && !entry) {
      // stale reference (draft was deleted elsewhere) — fall back to creating a new one
      editingDraftId = null;
    }
    if (!entry) {
      entry = { id: makeId("w"), type: "lifting", createdAt: new Date().toISOString() };
    }

    entry.date = date;
    entry.type = "lifting";
    entry.exercises = exercises;
    entry.completed = !!complete;
    if (complete) entry.completedAt = new Date().toISOString();

    if (!editingDraftId) workouts.push(entry);
    if (!saveWorkouts(workouts)) {
      errEl.textContent = "Couldn't save this workout — please try again.";
      return;
    }

    editingDraftId = null;
    resetLogForm();
    renderLogDrafts();
    renderDashboard();

    if (complete) {
      showSuccessOverlay("log-success-overlay", "log-form-wrap", "success-encouragement");
    } else {
      const msg = $("success-encouragement");
      showSuccessOverlay("log-success-overlay", "log-form-wrap", "success-encouragement");
      // customize text for draft save
      $("log-success-overlay").querySelector(".success-title").textContent = "Saved!";
      msg.textContent = "Pick it back up any time from below.";
      setTimeout(() => { $("log-success-overlay").querySelector(".success-title").textContent = "Workout logged!"; }, 1500);
    }
  }

  function handleLogSimple() {
    const errEl = $("err-log");
    errEl.textContent = "";

    const date = $("log-date").value;
    const type = $("log-type").value;

    if (!date) { errEl.textContent = "Please choose a date."; return; }
    if (!type) { errEl.textContent = "Please select an exercise."; return; }

    // Editing an existing cardio/duration history entry vs. logging a brand new one.
    const isUpdate = !!editingSimpleWorkoutId;
    const workouts = getWorkouts();
    const entry = isUpdate
      ? workouts.find((w) => w.id === editingSimpleWorkoutId)
      : { id: makeId("w"), createdAt: new Date().toISOString(), completed: true };

    if (isUpdate && !entry) {
      // stale reference (entry was deleted elsewhere) — fall back to creating a new one
      editingSimpleWorkoutId = null;
      return handleLogSimple();
    }

    entry.type = type;
    entry.date = date;

    if (DISTANCE_TYPES.includes(type)) {
      const distance = Number($("log-distance").value);
      const time = Number($("log-time").value);
      if (!$("log-distance").value || !(distance > 0)) { errEl.textContent = "Enter a distance greater than 0."; return; }
      if ($("log-time").value && !(time >= 0)) { errEl.textContent = "Enter a valid time."; return; }
      entry.distance = distance;
      entry.timeMinutes = $("log-time").value ? time : null;
    } else if (DURATION_TYPES.includes(type)) {
      const duration = Number($("log-duration").value);
      if (!$("log-duration").value || duration <= 0) { errEl.textContent = "Enter a duration greater than 0."; return; }
      entry.duration = duration;
      entry.notes = $("log-notes").value.trim();
    }

    if (!isUpdate) workouts.push(entry);
    if (!saveWorkouts(workouts)) {
      errEl.textContent = "Couldn't save this workout — please try again.";
      return;
    }

    const wasUpdate = isUpdate;
    editingSimpleWorkoutId = null;
    $("btn-log-workout-simple").textContent = "Log workout";

    resetLogForm();
    renderDashboard();
    renderCalendar();
    if (wasUpdate) renderHistory(getActiveHistoryType());
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
    $("log-type").value = "lifting";
    $("log-distance").value = "";
    $("log-time").value = "";
    $("log-exercise-list").innerHTML = "";
    $("log-duration").value = "";
    $("log-notes").value = "";
    $("fields-distance").classList.add("hidden");
    $("fields-lifting").classList.remove("hidden");
    $("fields-duration").classList.add("hidden");
    $("log-lifting-actions").classList.remove("hidden");
    $("btn-log-workout-simple").classList.add("hidden");
    $("log-date").value = todayISO();
    addLogExerciseRow();
  }

  /* ---- Saved (incomplete) lifting drafts, shown below the form ---- */
  function renderLogDrafts() {
    const drafts = getWorkouts().filter((w) => w.type === "lifting" && w.completed === false);
    const heading = $("log-drafts-heading");
    const list = $("log-drafts-list");
    if (drafts.length === 0) {
      heading.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    heading.classList.remove("hidden");
    const sorted = [...drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    list.innerHTML = sorted.map((d) => `
      <div class="history-item" data-draft-id="${d.id}">
        <div class="recent-icon">🏋️</div>
        <div class="recent-body">
          <p class="recent-title">${formatShortDate(d.date)} <span class="status-pill">Not finished</span></p>
          <p class="recent-meta">${escapeHTML((d.exercises || []).map((e) => e.name).join(", "))}</p>
        </div>
        <div class="history-actions">
          <button class="btn-small primary" data-action="resume">Resume</button>
          <button class="icon-x-btn" data-action="delete" aria-label="Delete draft">✕</button>
        </div>
      </div>`).join("");

    list.querySelectorAll(".history-item").forEach((row) => {
      const id = row.dataset.draftId;
      row.querySelector('[data-action="resume"]').addEventListener("click", () => resumeDraft(id));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => {
        saveWorkouts(getWorkouts().filter((w) => w.id !== id));
        renderLogDrafts();
        renderDashboard();
      });
    });
  }

  function resumeDraft(id) {
    const draft = getWorkouts().find((w) => w.id === id);
    if (!draft) return;
    editingDraftId = id;
    $("log-type").value = "lifting";
    $("log-type").dispatchEvent(new Event("change"));
    $("log-date").value = draft.date;
    $("log-exercise-list").innerHTML = "";
    (draft.exercises || []).forEach((ex) => addLogExerciseRow(ex));
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
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

    $("plan-repeat").addEventListener("change", () => {
      $("plan-repeat-end-wrap").classList.toggle("hidden", $("plan-repeat").value === "none");
    });
  }

  const REPEAT_STEP_DAYS = { daily: 1, weekly: 7, biweekly: 14 };

  function expandRepeatDates(startDate, repeat, endDate) {
    // returns array of ISO date strings, including the start date
    const dates = [startDate];
    if (repeat === "none" || !endDate) return dates;
    const [sy, sm, sd] = startDate.split("-").map(Number);
    let cursor = new Date(sy, sm - 1, sd);
    const guardMax = 500; // safety cap
    let count = 0;
    while (count < guardMax) {
      count++;
      if (repeat === "monthly") {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
      } else {
        const step = REPEAT_STEP_DAYS[repeat];
        if (!step) break;
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + step);
      }
      const iso = toISO(cursor);
      if (iso > endDate) break;
      dates.push(iso);
    }
    return dates;
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

    const repeat = $("plan-repeat").value;
    const repeatEnd = $("plan-repeat-end").value;
    if (repeat !== "none" && !repeatEnd) { errEl.textContent = "Choose a repeat end date."; return; }
    if (repeat !== "none" && repeatEnd < date) { errEl.textContent = "Repeat end date must be after the start date."; return; }

    const planBase = {
      name, type,
      repeat, repeatEndDate: repeat === "none" ? null : repeatEnd,
      createdAt: new Date().toISOString(),
    };

    if (DISTANCE_TYPES.includes(type)) {
      const distance = Number($("plan-distance").value);
      if (!$("plan-distance").value || !(distance > 0)) { errEl.textContent = "Enter a target distance greater than 0."; return; }
      planBase.distance = distance;
      planBase.timeMinutes = $("plan-time").value ? Number($("plan-time").value) : null;
    } else if (type === "lifting") {
      planBase.exercises = collectPlanExercises();
    } else if (DURATION_TYPES.includes(type)) {
      const duration = Number($("plan-duration").value);
      if (!$("plan-duration").value || duration <= 0) { errEl.textContent = "Enter a target duration greater than 0."; return; }
      planBase.duration = duration;
      planBase.notes = $("plan-notes").value.trim();
    }

    const seriesId = repeat !== "none" ? makeId("series") : null;
    const occurrenceDates = expandRepeatDates(date, repeat, repeatEnd);
    const plans = plansStore.get();
    occurrenceDates.forEach((occDate) => {
      plans.push({ ...planBase, id: makeId("plan"), date: occDate, seriesId });
    });
    plansStore.save(plans);
    const plan = { ...planBase, id: makeId("plan"), date }; // for favorite snapshot below

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
    $("plan-repeat").value = "none";
    $("plan-repeat-end").value = "";
    $("plan-repeat-end-wrap").classList.add("hidden");
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
  // A workout "counts" once it's logged and, for lifting, marked completed.
  function countableWorkouts(workouts) {
    return workouts.filter((w) => w.type !== "lifting" || w.completed !== false);
  }

  let dashRange = "alltime"; // alltime | month | year

  function wireDashTabs() {
    document.querySelectorAll("#dash-stat-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#dash-stat-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        dashRange = btn.dataset.range;
        renderDashboard();
      });
    });
  }

  let dashActiveSection = "calendar"; // calendar | monthly | overload

  function wireDashSectionTabs() {
    document.querySelectorAll("#dash-section-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        showDashSection(btn.dataset.section);
      });
    });
  }

  function showDashSection(name) {
    dashActiveSection = name;
    document.querySelectorAll("#dash-section-tabs .tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.section === name);
    });
    document.querySelectorAll(".dash-section").forEach((s) => {
      s.classList.toggle("hidden", s.id !== "dash-section-" + name);
    });
    if (name === "calendar") renderCalendar();
    if (name === "overload") renderOverloadTab();
  }

  function filterByRange(workouts, range) {
    if (range === "alltime") return workouts;
    const now = new Date();
    if (range === "year") {
      const y = String(now.getFullYear());
      return workouts.filter((w) => w.date.slice(0, 4) === y);
    }
    if (range === "month") {
      const ym = toISO(now).slice(0, 7);
      return workouts.filter((w) => w.date.slice(0, 7) === ym);
    }
    return workouts;
  }

  function renderDashboard() {
    const allWorkouts = countableWorkouts(getWorkouts());
    const workouts = filterByRange(allWorkouts, dashRange);

    const totalDays = new Set(workouts.map((w) => w.date)).size;
    $("stat-total-workouts").textContent = totalDays;
    $("stat-total-workouts-label").textContent = "Total days";
    $("stat-total-workouts-unit").textContent = dashRange === "alltime" ? "days with a workout, all-time" : dashRange === "month" ? "days with a workout this month" : "days with a workout this year";
    $("stat-streak").textContent = computeStreak(allWorkouts);

    const distanceTotals = { running: 0, walking: 0, swimming: 0, biking: 0 };
    let weightLifted = 0;
    let bodyweightSets = 0;

    workouts.forEach((w) => {
      if (DISTANCE_TYPES.includes(w.type) && typeof w.distance === "number") {
        distanceTotals[w.type] += w.distance;
      }
      if (w.type === "lifting") {
        const totals = liftingEntryWeightTotal(w);
        weightLifted += totals.weight;
        bodyweightSets += totals.bodyweightSets;
      }
    });

    $("stat-running").innerHTML = distanceTotals.running.toFixed(1) + "<small>mi</small>";
    $("stat-walking").innerHTML = distanceTotals.walking.toFixed(1) + "<small>mi</small>";
    $("stat-swimming").innerHTML = distanceTotals.swimming.toFixed(1) + "<small>mi</small>";
    $("stat-biking").innerHTML = distanceTotals.biking.toFixed(1) + "<small>mi</small>";
    $("stat-weight-lifted").innerHTML = Math.round(weightLifted).toLocaleString() + "<small>lbs</small>";
    $("stat-bodyweight-sets").textContent = bodyweightSets;

    renderRecentList(dashRange === "alltime" ? allWorkouts : workouts);
    renderDashGoals();
    renderDashUpcoming();
    renderMonthlyConsistencyChart(allWorkouts);
    renderDashExtraCharts(allWorkouts);
    renderCalendar();
    renderOverloadTab();
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
      return `<div class="recent-item clickable" data-goal-id="${g.id}">
        <div class="recent-icon blue">🎯</div>
        <div class="recent-body">
          <p class="recent-title">${escapeHTML(goalTitle(g))}</p>
          <p class="recent-meta">${Math.round(p.pct * 100)}% there · due ${formatShortDate(g.targetDate)}</p>
        </div>
      </div>`;
    }).join("");
    container.querySelectorAll(".recent-item.clickable").forEach((row) => {
      row.addEventListener("click", () => goToView("goals"));
    });
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
      <div class="recent-item clickable" data-plan-date="${p.date}">
        <div class="recent-icon">${TYPE_ICON[p.type] || "•"}</div>
        <div class="recent-body">
          <p class="recent-title">${escapeHTML(p.name)}</p>
          <p class="recent-meta">${escapeHTML(planSummaryMeta(p))}</p>
        </div>
        <div class="recent-date">${formatShortDate(p.date)}</div>
      </div>`).join("");
    container.querySelectorAll(".recent-item.clickable").forEach((row) => {
      row.addEventListener("click", () => {
        goToView("dashboard");
        showDashSection("calendar");
        calendarViewDate = new Date(row.dataset.planDate.split("-").map(Number)[0], row.dataset.planDate.split("-").map(Number)[1] - 1, 1);
        selectedDayISO = row.dataset.planDate;
        renderCalendar();
      });
    });
  }

  function computeStreak(workouts) {
    const daysWithWorkout = new Set(workouts.map((w) => w.date));
    const restDays = getRestDaySet();
    const isActiveDay = (iso) => daysWithWorkout.has(iso) || restDays.has(iso);
    let streak = 0;
    let cursor = new Date();
    // if no workout/rest today, streak counts back from yesterday (today doesn't break a streak until day ends)
    if (!isActiveDay(toISO(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (isActiveDay(toISO(cursor))) {
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
    container.innerHTML = recent.map((w) => workoutRowHTML(w, true)).join("");
    container.querySelectorAll(".recent-item.clickable").forEach((row) => {
      row.addEventListener("click", () => goToView("history"));
    });
  }

  function workoutRowHTML(w, clickable) {
    const icon = TYPE_ICON[w.type] || "•";
    const title = TYPE_LABEL[w.type] || w.type;
    let meta = "";
    if (DISTANCE_TYPES.includes(w.type)) {
      meta = `${w.distance.toFixed(2)} mi${w.timeMinutes ? " · " + w.timeMinutes + " min" : ""}`;
    } else if (w.type === "lifting") {
      const names = (w.exercises || []).map((e) => e.name).join(", ");
      meta = names || "Lifting session";
    } else {
      meta = `${w.duration} min${w.notes ? " · " + w.notes : ""}`;
    }
    const accentClass = DISTANCE_TYPES.includes(w.type) ? "blue" : "";
    return `<div class="recent-item${clickable ? " clickable" : ""}" data-workout-id="${w.id}">
      <div class="recent-icon ${accentClass}">${icon}</div>
      <div class="recent-body">
        <p class="recent-title">${title}</p>
        <p class="recent-meta">${escapeHTML(meta)}</p>
      </div>
      <div class="recent-date">${formatShortDate(w.date)}</div>
    </div>`;
  }

  /* ---- Monthly consistency horizontal bar chart (last 6 months) ---- */
  function renderMonthlyConsistencyChart(allCountedWorkouts) {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    const daysWithWorkout = new Set(allCountedWorkouts.map((w) => w.date));
    const restDays = getRestDaySet();

    const rows = months.map(({ year, month }) => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
      const cappedDaysInMonth = isCurrentMonth ? now.getDate() : daysInMonth;
      let trainedCount = 0;
      let restCount = 0;
      for (let d = 1; d <= cappedDaysInMonth; d++) {
        const iso = toISO(new Date(year, month, d));
        if (daysWithWorkout.has(iso)) trainedCount++;
        else if (restDays.has(iso)) restCount++;
      }
      const trainedPct = cappedDaysInMonth > 0 ? (trainedCount / cappedDaysInMonth) * 100 : 0;
      const restPct = cappedDaysInMonth > 0 ? Math.min(restCount / cappedDaysInMonth, 1 - trainedCount / cappedDaysInMonth) * 100 : 0;
      const label = new Date(year, month, 1).toLocaleString("default", { month: "short" });
      return { year, month, label, trainedCount, restCount, daysCounted: cappedDaysInMonth, trainedPct, restPct };
    });

    // Rows are built oldest→newest; reverse for display so the current month sits at the top.
    $("dash-monthly-bars").innerHTML = rows.slice().reverse().map((r) => `
      <div class="hbar-row">
        <span class="hbar-label">${r.label}</span>
        <div class="hbar-track">
          <div class="hbar-fill" style="width:${Math.min(r.trainedPct, 100).toFixed(1)}%"></div>
          <div class="hbar-fill-rest" style="left:${Math.min(r.trainedPct, 100).toFixed(1)}%;width:${r.restPct.toFixed(1)}%"></div>
        </div>
        <span class="hbar-count">${r.trainedCount}/${r.daysCounted}</span>
      </div>`).join("");

    // best month ever (across all history, not just last 6)
    const byMonth = {};
    allCountedWorkouts.forEach((w) => {
      const key = w.date.slice(0, 7);
      byMonth[key] = byMonth[key] || new Set();
      byMonth[key].add(w.date);
    });
    let bestKey = null, bestCount = 0;
    Object.keys(byMonth).forEach((key) => {
      const c = byMonth[key].size;
      if (c > bestCount) { bestCount = c; bestKey = key; }
    });
    if (bestKey) {
      const [by, bm] = bestKey.split("-").map(Number);
      const label = new Date(by, bm - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
      $("dash-best-month").textContent = `Best month ever: ${label} — ${bestCount} day${bestCount === 1 ? "" : "s"} trained`;
    } else {
      $("dash-best-month").textContent = "Log a few workouts to see your best month.";
    }
  }

  /* ---- Additional dashboard charts: activity mix donut + 8-week sparkline ---- */
  function renderDashExtraCharts(allCountedWorkouts) {
    const container = $("dash-extra-charts");
    if (allCountedWorkouts.length === 0) {
      container.innerHTML = "";
      return;
    }

    // Activity mix breakdown
    const mix = {};
    allCountedWorkouts.forEach((w) => { mix[w.type] = (mix[w.type] || 0) + 1; });
    const mixEntries = Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const totalMix = mixEntries.reduce((s, [, c]) => s + c, 0);
    const colors = ["var(--green)", "var(--blue)", "#f2c14e", "#ef5a5a", "#9d7bff", "#5b6b7d"];
    let cumulative = 0;
    const gradientStops = mixEntries.map(([type, count], i) => {
      const start = (cumulative / totalMix) * 360;
      cumulative += count;
      const end = (cumulative / totalMix) * 360;
      return `${colors[i % colors.length]} ${start}deg ${end}deg`;
    }).join(", ");

    const donutHTML = `
      <div class="chart-card">
        <h3>Activity mix (all-time)</h3>
        <div class="donut-wrap">
          <svg width="88" height="88" viewBox="0 0 88 88" style="flex-shrink:0;">
            <circle cx="44" cy="44" r="40" fill="none" stroke="var(--bg-elevated)" stroke-width="10"/>
            <foreignObject x="0" y="0" width="88" height="88">
              <div style="width:88px;height:88px;border-radius:50%;background:conic-gradient(${gradientStops});mask:radial-gradient(circle,transparent 27px,black 28px);-webkit-mask:radial-gradient(circle,transparent 27px,black 28px);"></div>
            </foreignObject>
          </svg>
          <div class="donut-legend">
            ${mixEntries.map(([type, count], i) => `
              <div class="donut-legend-row">
                <span class="swatch" style="background:${colors[i % colors.length]}"></span>
                <span>${TYPE_LABEL[type] || type}</span>
                <span class="val">${count}</span>
              </div>`).join("")}
          </div>
        </div>
      </div>`;

    // 8-week sparkline of workout days per week
    const now = new Date();
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      weeks.push({ start: toISO(start), end: toISO(end) });
    }
    const daysSet = new Set(allCountedWorkouts.map((w) => w.date));
    const weekCounts = weeks.map((wk) => {
      let c = 0;
      let cursor = new Date(wk.start.split("-").map((n, i) => i === 1 ? n - 1 : n));
      for (let i = 0; i < 7; i++) {
        const iso = toISO(cursor);
        if (daysSet.has(iso)) c++;
        cursor.setDate(cursor.getDate() + 1);
      }
      return c;
    });
    const maxWeek = Math.max(...weekCounts, 1);
    const sparkHTML = `
      <div class="chart-card">
        <h3>Weekly activity (last 8 weeks)</h3>
        <div class="sparkline-row">
          ${weekCounts.map((c) => `<div class="spark-bar" style="height:${Math.max((c / maxWeek) * 100, 4)}%" title="${c} day${c === 1 ? "" : "s"}"></div>`).join("")}
        </div>
      </div>`;

    container.innerHTML = donutHTML + sparkHTML;
  }

  /* =========================================================
     History (all logged workouts — edit & delete)
     ========================================================= */
  function getActiveHistoryType() {
    const activeChip = document.querySelector("#history-chip-row .chip.active");
    return activeChip ? activeChip.dataset.type : "all";
  }

  function wireHistory() {
    document.querySelectorAll("#history-chip-row .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("#history-chip-row .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        renderHistory(chip.dataset.type);
      });
    });
  }

  function renderHistory(type) {
    const all = getWorkouts();
    const filtered = type === "all" ? all : all.filter((w) => w.type === type);
    const container = $("history-list");

    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">No workouts logged yet.</p>';
      return;
    }

    const sorted = [...filtered].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    container.innerHTML = sorted.map((w) => {
      const icon = TYPE_ICON[w.type] || "•";
      const title = TYPE_LABEL[w.type] || w.type;
      let meta = "";
      let draftPill = "";
      if (DISTANCE_TYPES.includes(w.type)) {
        meta = `${w.distance.toFixed(2)} mi${w.timeMinutes ? " · " + w.timeMinutes + " min" : ""}`;
      } else if (w.type === "lifting") {
        meta = (w.exercises || []).map((e) => e.name).join(", ") || "Lifting session";
        if (w.completed === false) draftPill = '<span class="status-pill">Not finished</span>';
      } else {
        meta = `${w.duration} min${w.notes ? " · " + w.notes : ""}`;
      }
      return `<div class="history-item" data-workout-id="${w.id}">
        <div class="recent-icon">${icon}</div>
        <div class="recent-body">
          <p class="recent-title">${title} ${draftPill}</p>
          <p class="recent-meta">${escapeHTML(meta)} · ${formatShortDate(w.date)}</p>
        </div>
        <div class="history-actions">
          <button class="btn-small" data-action="edit">Edit</button>
          <button class="icon-x-btn" data-action="delete" aria-label="Delete">✕</button>
        </div>
      </div>`;
    }).join("");

    container.querySelectorAll(".history-item").forEach((row) => {
      const id = row.dataset.workoutId;
      row.querySelector('[data-action="delete"]').addEventListener("click", () => {
        saveWorkouts(getWorkouts().filter((w) => w.id !== id));
        renderHistory(getActiveHistoryType());
        renderDashboard();
        renderCalendar();
      });
      row.querySelector('[data-action="edit"]').addEventListener("click", () => editHistoryEntry(id));
    });
  }

  function editHistoryEntry(id) {
    const w = getWorkouts().find((x) => x.id === id);
    if (!w) return;

    if (w.type === "lifting") {
      editingDraftId = id;
      goToView("log");
      $("log-type").value = "lifting";
      $("log-type").dispatchEvent(new Event("change"));
      $("log-date").value = w.date;
      $("log-exercise-list").innerHTML = "";
      (w.exercises || []).forEach((ex) => addLogExerciseRow(ex));
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
      return;
    }

    // Cardio / duration types: edit inline via the simple log form
    goToView("log");
    $("log-type").value = w.type;
    $("log-type").dispatchEvent(new Event("change"));
    $("log-date").value = w.date;
    if (DISTANCE_TYPES.includes(w.type)) {
      $("log-distance").value = w.distance != null ? w.distance : "";
      $("log-time").value = w.timeMinutes != null ? w.timeMinutes : "";
    } else if (DURATION_TYPES.includes(w.type)) {
      $("log-duration").value = w.duration != null ? w.duration : "";
      $("log-notes").value = w.notes || "";
    }

    // Put the simple "Log workout" button into "update" mode for this one save.
    // (handleLogSimple checks editingSimpleWorkoutId and updates in place instead of creating a new entry.)
    editingSimpleWorkoutId = id;
    $("btn-log-workout-simple").textContent = "Update workout";
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
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
    const workouts = getWorkouts().filter((w) => w.type === type && (type !== "lifting" || w.completed !== false));
    const content = $("bests-content");

    if (workouts.length === 0) {
      content.innerHTML = '<p class="empty-state">No ' + (TYPE_LABEL[type] || type).toLowerCase() + ' workouts logged yet.</p>';
      return;
    }

    if (type === "lifting") {
      const query = ($("bests-search").value || "").trim().toLowerCase();
      const byExercise = {};
      workouts.forEach((w) => {
        (w.exercises || []).forEach((ex) => {
          if (!ex.name) return;
          const key = ex.name.toLowerCase();
          (ex.sets || []).forEach((s) => {
            const score = (ex.bodyweight ? 0 : s.weight) * 1000 + s.reps;
            const current = byExercise[key];
            if (!current || score > current.score) {
              byExercise[key] = { name: ex.name, weight: s.weight, reps: s.reps, sets: s.sets, bodyweight: ex.bodyweight, date: w.date, score };
            }
          });
        });
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
    $("btn-toggle-rest-day").addEventListener("click", () => {
      if (!selectedDayISO) return;
      toggleRestDay(selectedDayISO);
      renderCalendar();
      renderDashboard();
    });
  }

  function getJoinDateISO() {
    const profile = getProfile();
    return profile && profile.createdAt ? profile.createdAt.slice(0, 10) : null;
  }

  function renderCalendar() {
    const workouts = countableWorkouts(getWorkouts());
    const workoutDates = new Set(workouts.map((w) => w.date));
    const plannedDates = new Set(plansStore.get().map((p) => p.date));
    const goalDueDates = new Set(goalsStore.get().filter((g) => !g.achieved && !g.cancelled).map((g) => g.targetDate));
    const restDays = getRestDaySet();
    const joinDate = getJoinDateISO();

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

      if (joinDate && iso < joinDate) {
        cell.classList.add("before-join");
      } else if (iso === todayStr) {
        cell.classList.add("today");
        if (workoutDates.has(iso)) cell.classList.add("trained");
        else if (restDays.has(iso)) cell.classList.add("rest");
      } else if (workoutDates.has(iso)) {
        cell.classList.add("trained");
      } else if (restDays.has(iso)) {
        cell.classList.add("rest");
      } else if (iso > todayStr) {
        cell.classList.add(plannedDates.has(iso) ? "planned" : "future");
      } else {
        cell.classList.add("missed");
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
    renderRestDayToggle(iso, dayWorkouts.length > 0);
    const dayPlans = plansStore.get().filter((p) => p.date === iso);
    const dayGoals = goalsStore.get().filter((g) => !g.achieved && !g.cancelled && g.targetDate === iso);
    const listEl = $("day-detail-list");

    if (dayWorkouts.length === 0 && dayPlans.length === 0 && dayGoals.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No workouts logged for this day.</p>';
      return;
    }
    let html = dayWorkouts.map((w) => workoutRowHTML(w, true)).join("");
    html += dayPlans.map((p) => `<div class="planned-item">
      <div class="recent-icon">${TYPE_ICON[p.type] || "•"}</div>
      <div class="fav-body">
        <p class="fav-title">${escapeHTML(p.name)} <span style="color:var(--blue); font-size:11px;">PLANNED</span></p>
        <p class="fav-meta">${escapeHTML(planSummaryMeta(p))}</p>
      </div>
    </div>`).join("");
    html += dayGoals.map((g) => {
      const p = computeGoalProgress(g, workouts);
      return `<div class="planned-item goal-due-item" data-goal-id="${g.id}">
        <div class="recent-icon blue">🎯</div>
        <div class="fav-body">
          <p class="fav-title">${escapeHTML(goalTitle(g))} <span style="color:var(--yellow); font-size:11px;">GOAL DUE</span></p>
          <p class="fav-meta">${Math.round(p.pct * 100)}% there</p>
        </div>
      </div>`;
    }).join("");
    listEl.innerHTML = html;
    listEl.querySelectorAll(".recent-item.clickable").forEach((row) => {
      row.addEventListener("click", () => goToView("history"));
    });
    listEl.querySelectorAll(".goal-due-item").forEach((row) => {
      row.addEventListener("click", () => goToView("goals"));
    });
  }

  function renderRestDayToggle(iso, hasWorkout) {
    const wrap = $("day-detail-rest-wrap");
    const btn = $("btn-toggle-rest-day");
    const todayStr = todayISO();

    // Marking a rest day only makes sense for today or a past day, and only
    // if nothing was actually trained on it.
    if (iso > todayStr || hasWorkout) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    btn.textContent = isRestDay(iso) ? "✕ Unmark rest day" : "😌 Mark as rest day";
  }

  // Quick rest-day toggle shown right on the Log workout view, so marking a
  // deliberate rest day (and keeping the streak intact) doesn't require a trip
  // through the calendar tab first. Only makes sense for *today*, and only
  // when nothing has been logged today already.
  function renderLogRestDayBanner() {
    const todayStr = todayISO();
    const workoutsToday = countableWorkouts(getWorkouts()).some((w) => w.date === todayStr);
    const banner = $("log-rest-day-banner");
    const btn = $("btn-quick-rest-day");
    const text = $("log-rest-day-text");

    if (workoutsToday) {
      banner.classList.add("hidden");
      return;
    }
    banner.classList.remove("hidden");
    const marked = isRestDay(todayStr);
    banner.classList.toggle("marked", marked);
    text.textContent = marked ? "Today is marked as a rest day — your streak is safe." : "Not training today?";
    btn.textContent = marked ? "✕ Unmark" : "😌 Mark as rest day";
  }

  function wireLogRestDayBanner() {
    $("btn-quick-rest-day").addEventListener("click", () => {
      toggleRestDay(todayISO());
      renderLogRestDayBanner();
      renderDashboard();
    });
  }

  /* =========================================================
     Progressive overload tracking (dashboard tab)

     The idea: consistency (the calendar/monthly tabs) tells you whether
     you showed up. It doesn't tell you whether you're actually getting
     stronger. For a chosen lifting exercise, this pulls every session
     it was logged in and tracks a single "score" per session:
       - weighted exercises: estimated 1-rep max (Epley formula:
         weight × (1 + reps/30)) from that session's best set. 1RM is a
         fairer comparison than raw weight, since it accounts for reps —
         5 reps at 185 lbs is a bigger effort than 1 rep at 185 lbs.
       - bodyweight exercises (weight is 0 by design): score is just the
         best single-set rep count instead, since there's no load to
         estimate a 1RM from.
     From that per-session score we derive: the current estimate, the
     trend vs. the last session, total logged sessions, a chart of the
     most recent sessions, an "overload streak" (consecutive recent
     sessions that matched or beat the one before — the plainest signal
     of progressive overload), and a session-by-session history with
     per-session deltas so a plateau or regression is easy to spot.
     ========================================================= */
  let overloadSelectedExercise = null;

  function wireOverloadTab() {
    $("overload-exercise-select").addEventListener("change", (e) => {
      overloadSelectedExercise = e.target.value || null;
      renderOverloadTab();
    });
  }

  function getLiftingExerciseNames() {
    const workouts = getWorkouts().filter((w) => w.type === "lifting");
    const nameSet = new Set();
    workouts.forEach((w) => (w.exercises || []).forEach((ex) => { if (ex.name) nameSet.add(ex.name); }));
    return Array.from(nameSet).sort((a, b) => a.localeCompare(b));
  }

  // Simple Levenshtein edit distance (case-insensitive), used to catch near-duplicate
  // exercise names ("Bemch press" vs "Bench press") that a plain substring match wouldn't.
  function levenshtein(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  // Given what someone is typing for an exercise name, look for a previously-used
  // name that's probably the same exercise — same text but different case/spacing,
  // or just a couple characters off (typo) — so we can nudge them toward reusing the
  // existing name instead of quietly creating a near-duplicate that would split their
  // personal bests and progressive-overload history across two "different" exercises.
  function findSimilarExerciseName(typed) {
    const trimmed = (typed || "").trim();
    if (trimmed.length < 3) return null;
    const names = getLiftingExerciseNames();
    if (names.includes(trimmed)) return null; // exact match already — nothing to suggest

    const caseInsensitiveMatch = names.find((n) => n.toLowerCase() === trimmed.toLowerCase());
    if (caseInsensitiveMatch) return caseInsensitiveMatch;

    let best = null, bestDist = Infinity;
    names.forEach((n) => {
      if (Math.abs(n.length - trimmed.length) > 3) return;
      const dist = levenshtein(n, trimmed);
      if (dist < bestDist) { bestDist = dist; best = n; }
    });
    const threshold = trimmed.length <= 5 ? 1 : 2;
    return (best && bestDist > 0 && bestDist <= threshold) ? best : null;
  }

  function wireExerciseNameSuggestion(nameInput, hintEl) {
    if (!nameInput || !hintEl) return;
    const update = () => {
      const suggestion = findSimilarExerciseName(nameInput.value);
      if (suggestion) {
        hintEl.innerHTML = `Did you mean <strong>${escapeHTML(suggestion)}</strong>? <span class="hint-action">Use it</span>`;
        hintEl.classList.remove("hidden");
      } else {
        hintEl.classList.add("hidden");
      }
    };
    nameInput.addEventListener("input", update);
    hintEl.addEventListener("click", () => {
      const suggestion = findSimilarExerciseName(nameInput.value);
      if (suggestion) {
        nameInput.value = suggestion;
        hintEl.classList.add("hidden");
      }
    });
  }

  // Reduces one logged exercise entry (a single session's sets, incl. drop sets)
  // down to one comparable "score", plus the total volume and a display label
  // for its best set.
  function exerciseSessionScore(ex) {
    const allSets = [];
    (ex.sets || []).forEach((s) => {
      allSets.push(s);
      (s.dropSets || []).forEach((ds) => allSets.push(ds));
    });

    let volume = 0;
    let best1RM = 0;
    let bestReps = 0;
    let bestSetLabel = "—";

    allSets.forEach((s) => {
      const reps = s.reps || 0;
      const weight = s.weight || 0;
      const count = s.sets || 1;
      volume += weight * reps * count;

      if (ex.bodyweight) {
        if (reps > bestReps) bestReps = reps;
      } else {
        const oneRM = weight * (1 + reps / 30);
        if (oneRM > best1RM) {
          best1RM = oneRM;
          bestSetLabel = `${weight} lbs × ${reps}`;
        }
      }
    });

    if (ex.bodyweight) {
      return { mode: "reps", score: bestReps, volume, bestLabel: `${bestReps} reps (bodyweight)` };
    }
    return { mode: "weight", score: Math.round(best1RM), volume, bestLabel: bestSetLabel };
  }

  // One entry per calendar date, oldest → newest. If an exercise was logged
  // more than once on the same date, keep whichever set scored higher.
  function getExerciseSessions(name) {
    const workouts = getWorkouts().filter((w) => w.type === "lifting" && w.date);
    const byDate = {};
    workouts.forEach((w) => {
      (w.exercises || []).forEach((ex) => {
        if (ex.name !== name) return;
        const metrics = exerciseSessionScore(ex);
        if (!byDate[w.date] || metrics.score > byDate[w.date].score) {
          byDate[w.date] = { date: w.date, ...metrics };
        }
      });
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderOverloadTab() {
    const names = getLiftingExerciseNames();
    const select = $("overload-exercise-select");

    if (names.length === 0) {
      select.innerHTML = "";
      $("overload-select-wrap").classList.add("hidden");
      $("overload-empty").classList.remove("hidden");
      $("overload-content").classList.add("hidden");
      return;
    }
    $("overload-select-wrap").classList.remove("hidden");
    $("overload-empty").classList.add("hidden");
    $("overload-content").classList.remove("hidden");

    if (!overloadSelectedExercise || !names.includes(overloadSelectedExercise)) {
      overloadSelectedExercise = names[0];
    }
    select.innerHTML = names.map((n) => `<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join("");
    select.value = overloadSelectedExercise;

    const sessions = getExerciseSessions(overloadSelectedExercise);
    if (sessions.length === 0) return;

    const last = sessions[sessions.length - 1];
    const prev = sessions.length > 1 ? sessions[sessions.length - 2] : null;
    const isReps = last.mode === "reps";
    const unit = isReps ? " reps" : " lbs";

    $("overload-chart-title").textContent = isReps ? "Best reps by session" : "Estimated 1RM by session";
    $("overload-stat-1rm").innerHTML = isReps ? `${last.score}<small>reps</small>` : `${last.score}<small>lbs</small>`;

    let trendText = "First session logged";
    if (prev) {
      const diff = last.score - prev.score;
      if (diff > 0) trendText = `▲ +${diff}${unit} vs last session`;
      else if (diff < 0) trendText = `▼ ${diff}${unit} vs last session`;
      else trendText = "→ No change vs last session";
    }
    $("overload-stat-trend").textContent = trendText;
    $("overload-stat-best").textContent = last.bestLabel;
    $("overload-stat-sessions").textContent = sessions.length;

    // Overload streak: walk backward from the most recent session and count
    // how many in a row matched or beat the one right before it.
    let streak = 1;
    for (let i = sessions.length - 1; i > 0; i--) {
      if (sessions[i].score >= sessions[i - 1].score) streak++;
      else break;
    }
    $("overload-stat-streak").textContent = sessions.length > 1 ? streak : 1;

    const recent = sessions.slice(-10);
    const maxScore = Math.max(...recent.map((s) => s.score), 1);
    $("overload-chart").innerHTML = recent.map((s) => `
      <div class="spark-bar" style="height:${Math.max((s.score / maxScore) * 100, 4)}%" title="${formatShortDate(s.date)}: ${s.score}${unit}"></div>
    `).join("");

    const reversed = sessions.slice().reverse();
    $("overload-sessions-list").innerHTML = reversed.slice(0, 8).map((s, idx) => {
      const older = reversed[idx + 1];
      let deltaHTML = "";
      if (older) {
        const diff = s.score - older.score;
        if (diff > 0) deltaHTML = `<span style="color:var(--green)">▲ +${diff}${unit}</span>`;
        else if (diff < 0) deltaHTML = `<span style="color:var(--red)">▼ ${diff}${unit}</span>`;
        else deltaHTML = `<span style="color:var(--text-tertiary)">→ no change</span>`;
      }
      return `<div class="recent-item">
        <div class="recent-icon">🏋️</div>
        <div class="recent-body">
          <p class="recent-title">${escapeHTML(s.bestLabel)}</p>
          <p class="recent-meta">Volume ${Math.round(s.volume).toLocaleString()}${isReps ? " reps" : " lbs"}${deltaHTML ? " · " + deltaHTML : ""}</p>
        </div>
        <div class="recent-date">${formatShortDate(s.date)}</div>
      </div>`;
    }).join("");
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
    const workouts = getWorkouts().filter((w) => w.type === "lifting");
    const nameSet = new Set();
    workouts.forEach((w) => (w.exercises || []).forEach((ex) => { if (ex.name) nameSet.add(ex.name); }));
    const names = Array.from(nameSet);
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
      const mode = $("goal-distance-mode").value;
      const target = Number($("goal-distance-target").value);
      if (!$("goal-distance-target").value || !(target > 0)) { errEl.textContent = "Enter a target greater than 0."; return; }
      goal.activity = activity;
      goal.metric = metric;
      goal.mode = mode;
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
    $("goal-distance-mode").value = "single";
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
      const modeTag = g.mode === "total" ? " total" : "";
      return `${TYPE_ICON[g.activity] || "•"} ${TYPE_LABEL[g.activity] || g.activity}: ${label}${modeTag}`;
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
      if (g.mode === "total") {
        if (g.metric === "time") {
          current = relevant.reduce((sum, w) => sum + (w.timeMinutes || 0), 0);
          unit = "min accumulated";
        } else {
          current = relevant.reduce((sum, w) => sum + (typeof w.distance === "number" ? w.distance : 0), 0);
          unit = "mi accumulated";
        }
        pct = g.target > 0 ? Math.min(current / g.target, 1) : 0;
      } else if (g.metric === "time") {
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
      const relevant = workouts.filter((w) => w.type === "lifting" && w.completed !== false);
      const setsForExercise = [];
      relevant.forEach((w) => (w.exercises || []).forEach((ex) => {
        if (ex.name && ex.name.toLowerCase() === g.exerciseName.toLowerCase()) {
          (ex.sets || []).forEach((s) => setsForExercise.push({ ...s, bodyweight: ex.bodyweight }));
        }
      }));
      if (g.metric === "reps") {
        const best = setsForExercise.map((s) => s.reps || 0);
        current = best.length ? Math.max(...best) : 0;
        unit = "reps (best)";
      } else {
        const best = setsForExercise.filter((s) => !s.bodyweight).map((s) => s.weight || 0);
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

      const joinDate = getJoinDateISO();
      if (joinDate && iso < joinDate) cell.classList.add("before-join");
      else if (iso === todayStr) cell.classList.add("today");
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
