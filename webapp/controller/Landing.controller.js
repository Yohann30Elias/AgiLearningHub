sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
  "use strict";

  var ROTATE_MS = 10000; // 10s

  return Controller.extend("agilh.controller.Landing", {
    onInit: function () {
      // 1) Ziel-Model für die Landing-Sektionen (leerer Start)
      var oLanding = new JSONModel({
        user: { isLoggedIn: false, name: "", email: "" },
        lastCourse: null,
        recommendations: [],
        todos: [],
        newCourses: []
      });
      this.getView().setModel(oLanding, "landing");

      // 2) Dataset laden (data.json über /api)
      var oDS = new JSONModel();
      oDS.attachRequestCompleted(this._onDatasetLoaded.bind(this, oDS));
      oDS.attachRequestFailed(function (e) {
        /* eslint-disable no-console */
        console.error("data.json laden fehlgeschlagen:", e);
      });
      oDS.loadData("/api/data.json", null, true);
    },

    _onDatasetLoaded: function (oDS) {
      var ds = oDS.getData();
      if (!ds || !ds.master_data || !ds.master_data.courses) return;

      var courses = ds.master_data.courses || [];
      var levels  = ds.master_data.levels  || [];
      var users   = ds.master_data.users   || [];
      var progressEntries = (ds.transactional_data && ds.transactional_data.user_course_progress) || [];

      // "Demo-Login": Wenn du lokal einen User simulieren willst:
      // localStorage.setItem('agilh.demoEmail', 'ali.mueller@contoso.net')
      var demoEmail = window.localStorage.getItem("agilh.demoEmail") || "";
      var userObj = users.find(u => u.email === demoEmail);
      var isLoggedIn = !!userObj;

      // --- Mapping-Funktionen ---
      var levelTitle = function (level_id) {
        var l = levels.find(x => x.id === level_id);
        return l ? l.title : (level_id || "");
      };
      var toHours = function (min) {
        if (min == null) return null;
        return Math.round((min / 60) * 10) / 10; // 1 Nachkommastelle
      };
      var byDateDesc = function (getter) {
        return function (a, b) {
          var da = getter(a) ? Date.parse(getter(a)) : 0;
          var db = getter(b) ? Date.parse(getter(b)) : 0;
          return db - da;
        };
      };

      // --- lastCourse (nur wenn "eingeloggt") ---
      var lastCourse = null;
      if (isLoggedIn) {
        var myProg = progressEntries.filter(p => p.user_email === demoEmail);
        if (myProg.length) {
          // bevorzugt "in_progress", sonst jüngster Start/Abschluss
          var inProg = myProg.filter(p => p.status === "in_progress");
          var pickFrom = inProg.length ? inProg : myProg;
          pickFrom.sort((a,b) => {
            var ta = Date.parse(a.completed_at || a.started_at || 0);
            var tb = Date.parse(b.completed_at || b.started_at || 0);
            return tb - ta;
          });
          var latest = pickFrom[0];
          var c = courses.find(x => x.id === latest.course_id);
          if (c) {
            lastCourse = {
              id: c.id,
              title: c.title,
              level: levelTitle(c.level_id),
              durationH: toHours(c.total_duration_minutes) || null,
              progressPercent: latest.progress_percent || 0
            };
          }
        }
      }

      // --- recommendations ---
      var recommendations = [];
      if (isLoggedIn && lastCourse) {
        var anchor = courses.find(c => c.id === lastCourse.id);
        if (anchor) {
          var catSet = new Set(anchor.category_ids || []);
          var anchorLevel = anchor.level_id;
          recommendations = courses
            .filter(c => c.id !== anchor.id && c.is_public !== false)
            .map(c => {
              var sameCat = (c.category_ids || []).some(id => catSet.has(id)) ? 1 : 0;
              var sameLvl = c.level_id === anchorLevel ? 1 : 0;
              var fresh   = c.updated_at ? Date.parse(c.updated_at) : 0;
              var score = sameCat * 3 + sameLvl * 2 + fresh / 1e12;
              return { c, score };
            })
            .sort((a,b) => b.score - a.score)
            .slice(0, 6)
            .map(x => ({
              id: x.c.id,
              title: x.c.title,
              level: levelTitle(x.c.level_id),
              durationH: toHours(x.c.total_duration_minutes) || null
            }));
        }
      }
      if (!recommendations.length) {
        // Guest/Default: zuletzt aktualisierte, öffentlich
        recommendations = courses
          .filter(c => c.is_public !== false)
          .slice().sort(byDateDesc(c => c.updated_at))
          .slice(0, 6)
          .map(c => ({
            id: c.id,
            title: c.title,
            level: levelTitle(c.level_id),
            durationH: toHours(c.total_duration_minutes) || null
          }));
      }

      // --- newCourses ---
      var newCourses = courses
        .filter(c => c.is_public !== false)
        .slice().sort(byDateDesc(c => c.created_at))
        .slice(0, 6)
        .map(c => ({
          id: c.id,
          title: c.title,
          level: levelTitle(c.level_id)
        }));

      // --- todos (nur wenn eingeloggt) ---
      var todos = [];
      if (isLoggedIn) {
        var myOpen = progressEntries
          .filter(p => p.user_email === demoEmail && p.status !== "completed");
        // zeige max. 6 „Weiter mit …“
        todos = myOpen.slice(0, 6).map(p => {
          var cc = courses.find(x => x.id === p.course_id);
          return {
            id: p.course_id,
            title: cc ? ("Weiter mit: " + cc.title) : ("Weiter mit Kurs " + p.course_id),
            done: false
          };
        });
      }

      // --- Landing-Model setzen ---
      var oLanding = this.getView().getModel("landing");
      oLanding.setData({
        user: {
          isLoggedIn: isLoggedIn,
          name: userObj ? (userObj.name || userObj.email) : "",
          email: userObj ? userObj.email : ""
        },
        lastCourse: lastCourse,
        recommendations: recommendations,
        todos: todos,
        newCourses: newCourses
      });
    },

    onAfterRendering: function () {
      var crsl = this.byId("hero");
      if (!crsl || this._autoTimer) return;

      this._autoTimer = setInterval(function () {
        var aPages = crsl.getPages();
        if (!aPages || !aPages.length) return;
        var sActiveId = crsl.getActivePage();
        var i = aPages.findIndex(function (p) { return p.getId() === sActiveId; });
        var next = aPages[((i >= 0 ? i : -1) + 1) % aPages.length];
        crsl.setActivePage(next);
      }, ROTATE_MS);
    },

    onBeforeRendering: function () { this._clearAuto(); },
    onExit: function () { this._clearAuto(); },
    _clearAuto: function () {
      if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
    },

    onOpenExternal: function (oEvent) {
      var cd = (oEvent.getSource().getCustomData() || []).find(function (c) { return c.getKey && c.getKey() === "url"; });
      var url = cd && cd.getValue();
      if (url) window.open(url, "_blank", "noopener");
    },

    onOpenCourse: function (oEvent) {
      var cd = (oEvent.getSource().getCustomData() || []).find(function (c) { return c.getKey && c.getKey() === "courseId"; });
      var id = cd && cd.getValue();
      console.log("open course:", id); // später: Router navTo
    },

    onToggleTodo: function (oEvent) {
      var ctx = oEvent.getSource().getBindingContext("landing");
      var done = oEvent.getParameter("selected");
      ctx.getModel().setProperty(ctx.getPath() + "/done", done);
    }
  });
});
