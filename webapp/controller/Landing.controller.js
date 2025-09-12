sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
  "use strict";

  var ROTATE_MS = 10000; // 10s
  var LS_KEY = "agilh.user";

  function first(obj, keys, dflt) {
    for (var i=0;i<keys.length;i++){ var k=keys[i]; if (obj && obj[k]!=null) return obj[k]; }
    return dflt;
  }
  function lower(s){ return (s==null?"":String(s)).toLowerCase(); }
  function toHours(min){ if(min==null) return null; return Math.round((min/60)*10)/10; }
  function byDateDesc(getter){
    return function(a,b){
      var da = getter(a) ? Date.parse(getter(a)) : 0;
      var db = getter(b) ? Date.parse(getter(b)) : 0;
      return db - da;
    };
  }

  return Controller.extend("agilh.controller.Landing", {

    onInit: function () {
      // Ziel-ViewModel
      var oLanding = new JSONModel({
        user: { isLoggedIn: false, name: "", email: "" },
        lastCourse: null,
        recommendations: [],
        todos: [],
        newCourses: [],
        showInProgress: false,
        showEmptyState: true
      });
      this.getView().setModel(oLanding, "landing");

      // a) Beim erstmaligen Laden des globalen Models "data"
      var m = this.getOwnerComponent().getModel("data");
      if (m && m.getData && Object.keys(m.getData()||{}).length) {
        this._buildLanding();
      } else if (m) {
        var done = () => { m.detachRequestCompleted(done, this); this._buildLanding(); };
        m.attachRequestCompleted(done, this);
      }

      // b) Jedes Mal, wenn die Route "landing" aufgerufen wird
      this._router = this.getOwnerComponent().getRouter();
      if (this._router && this._router.getRoute) {
        this._router.getRoute("landing").attachPatternMatched(this._onRouteMatched, this);
      }

      // c) Nach Login/Logout (kommt aus App.controller)
      sap.ui.getCore().getEventBus().subscribe("agilh", "authChanged", this._onAuthChanged, this);
    },

    _onRouteMatched: function () {
      this._buildLanding();
    },

    _onAuthChanged: function () {
      this._buildLanding();
    },

    // Kern: baut alle Sektionen anhand des globalen Models und des aktuellen Logins
    _buildLanding: function () {
      var m = this.getOwnerComponent().getModel("data");
      if (!m || !m.getData) return;
      var ds = m.getData() || {};
      var md = ds.master_data || {};
      var td = ds.transactional_data || {};
      var courses = md.courses || [];
      var levels  = md.levels  || [];
      var users   = md.users   || [];
      var progressEntries = td.user_course_progress || [];

      // aktueller User
      var currentUser = null;
      try { currentUser = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch(e){}
      var isLoggedIn = !!(currentUser && currentUser.email);

      var userObj = isLoggedIn
        ? (users.find(u => lower(u.email) === lower(currentUser.email)) || currentUser)
        : null;

      var levelTitle = function (level_id) {
        var l = levels.find(x => x.id === level_id);
        return l ? l.title : (level_id || "");
      };

      // ---- lastCourse ----
      var lastCourse = null;
      if (isLoggedIn) {
        var myProg = progressEntries.filter(p =>
          lower(first(p, ["user_email","email","userMail"], "")) === lower(currentUser.email)
        );

        if (myProg.length) {
          var inProg = myProg.filter(p => lower(first(p, ["status"], "")) === "in_progress");
          var pickFrom = inProg.length ? inProg : myProg;

          pickFrom.sort((a,b) => {
            var ta = Date.parse(first(a, ["completed_at","started_at","updated_at"], 0));
            var tb = Date.parse(first(b, ["completed_at","started_at","updated_at"], 0));
            return tb - ta;
          });

          var latest = pickFrom[0];
          var c = courses.find(x => x.id === first(latest, ["course_id","courseId","course"], null));
          if (c) {
            var pct = first(latest, ["progress_percent","progress","percent"], 0) || 0;
            lastCourse = {
              id: c.id,
              title: c.title,
              level: levelTitle(c.level_id),
              durationH: toHours(first(c, ["total_duration_minutes","duration_minutes"], null)) || null,
              progressPercent: Number(pct) || 0
            };
          }
        }
      }

      // ---- recommendations ----
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
              durationH: toHours(first(x.c, ["total_duration_minutes","duration_minutes"], null)) || null
            }));
        }
      }
      if (!recommendations.length) {
        recommendations = courses
          .filter(c => c.is_public !== false)
          .slice().sort(byDateDesc(c => c.updated_at))
          .slice(0, 6)
          .map(c => ({
            id: c.id,
            title: c.title,
            level: levelTitle(c.level_id),
            durationH: toHours(first(c, ["total_duration_minutes","duration_minutes"], null)) || null
          }));
      }

      // ---- newCourses ----
      var newCourses = courses
        .filter(c => c.is_public !== false)
        .slice().sort(byDateDesc(c => c.created_at))
        .slice(0, 6)
        .map(c => ({
          id: c.id,
          title: c.title,
          level: levelTitle(c.level_id)
        }));

      // ---- todos (nur wenn eingeloggt) ----
      var todos = [];
      if (isLoggedIn) {
        var myOpen = progressEntries.filter(p =>
          lower(first(p, ["user_email","email","userMail"], "")) === lower(currentUser.email) &&
          lower(first(p, ["status"], "")) !== "completed"
        );
        todos = myOpen.slice(0, 6).map(p => {
          var cc = courses.find(x => x.id === first(p, ["course_id","courseId","course"], null));
          return {
            id: first(p, ["course_id","courseId","course"], ""),
            title: cc ? ("Weiter mit: " + cc.title) : ("Weiter mit Kurs " + first(p, ["course_id","courseId","course"], "")),
            done: false
          };
        });
      }

      // ---- Landing-Model setzen inkl. Sichtbarkeiten ----
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
        newCourses: newCourses,
        showInProgress: !!(isLoggedIn && lastCourse),
        showEmptyState: !isLoggedIn || !lastCourse
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
    onExit: function () {
      this._clearAuto();
      sap.ui.getCore().getEventBus().unsubscribe("agilh", "authChanged", this._onAuthChanged, this);
    },
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
      // später: this.getOwnerComponent().getRouter().navTo("course", {id});
      console.log("open course:", id);
    },

    onToggleTodo: function (oEvent) {
      var ctx = oEvent.getSource().getBindingContext("landing");
      var done = oEvent.getParameter("selected");
      ctx.getModel().setProperty(ctx.getPath() + "/done", done);
    }
  });
});
