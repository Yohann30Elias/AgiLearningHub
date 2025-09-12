sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/SuggestionItem"
], function (Controller, JSONModel, MessageToast, SuggestionItem) {
  "use strict";

  function first(obj, keys, dflt) {
    for (var i=0;i<keys.length;i++) { var k=keys[i]; if (obj && obj[k]!=null) return obj[k]; }
    return dflt;
  }
  function lower(s){ return (s==null?"":String(s)).toLowerCase(); }
  function toHours(min){ if(min==null) return null; return Math.round((min/60)*10)/10; }

  return Controller.extend("agilh.controller.Catalog", {

    onInit: function () {
      // ViewModel für UI-State
      var vm = new JSONModel({
        type: "all",
        query: "",
        categories: [],           // [{id,title}]
        selectedCategoryIds: [],  // keys vom MultiComboBox
        items: [],                // Gesamtliste (Kurse + Pfade)
        filtered: []              // Gefilterte Liste
      });
      this.getView().setModel(vm, "catalog");

      // Globales Datenmodell abwarten / verarbeiten
      var m = this.getOwnerComponent().getModel("data");
      if (m && m.getData && Object.keys(m.getData()||{}).length) {
        this._buildFromDataset(m.getData());
      } else if (m) {
        var done = () => { m.detachRequestCompleted(done, this); this._buildFromDataset(m.getData()); };
        m.attachRequestCompleted(done, this);
      }

      // Kategorien-Binding (View) setzen, sobald Daten da sind
      var catMCB = this.byId("catMCB");
      catMCB.bindItems("catalog>/categories", new sap.ui.core.Item({
        key: "{catalog>id}",
        text: "{catalog>title}"
      }));
    },

    // --- Daten in flache "items" + "categories" transformieren ---
    _buildFromDataset: function (ds) {
      ds = ds || {};
      var md = ds.master_data || {};
      var levels = md.levels || [];
      var courses = md.courses || [];
      var paths   = md.learning_paths || md.paths || [];
      var categoriesMD = md.categories || [];

      // Helper
      var levelTitle = function (level_id) {
        var l = levels.find(x => x.id === level_id);
        return l ? l.title : (level_id || "");
      };
      var categoryTitle = function (id) {
        var c = categoriesMD.find(x => x.id === id);
        return c ? (c.title || c.name || id) : ("Kategorie " + id);
      };

      // Alle Kurse -> Item
      var items = courses.map(function (c) {
        var durMin = first(c, ["total_duration_minutes","duration_minutes"], null);
        var durH   = toHours(durMin);
        var cats   = c.category_ids || [];
        return {
          type: "course",
          typeLabel: "Kurs",
          id: c.id,
          title: c.title,
          subtitle: [ levelTitle(c.level_id), durH ? (durH + " h") : null ].filter(Boolean).join(" · "),
          number: durH ? String(durH) : "",
          numberUnit: durH ? "h" : "",
          categoryIds: cats,
          searchText: lower([c.title, (c.tags||[]).join(" "), (c.description||"")].join(" "))
        };
      });

      // Alle Lernpfade -> Item (robust)
      if (Array.isArray(paths)) {
        // Map Kurse für Dauer/Details
        var cMap = {}; courses.forEach(c => cMap[c.id] = c);

        paths.forEach(function (p) {
          var courseIds = p.course_ids || p.courses || [];
          var durMinSum = 0;
          courseIds.forEach(function (cid) {
            var cc = cMap[cid];
            durMinSum += Number(first(cc, ["total_duration_minutes","duration_minutes"], 0)) || 0;
          });
          var durH = toHours(durMinSum);
          items.push({
            type: "path",
            typeLabel: "Lernpfad",
            id: p.id,
            title: p.title || p.name,
            subtitle: [ courseIds.length + " Kurse", durH ? (durH + " h gesamt") : null ].filter(Boolean).join(" · "),
            number: String(courseIds.length),
            numberUnit: "Kurse",
            categoryIds: p.category_ids || [],
            searchText: lower([p.title||p.name, (p.tags||[]).join(" "), (p.description||"")].join(" "))
          });
        });
      }

      // Kategorien aus Items ableiten (falls kein master_data.categories)
      var catIdSet = new Set();
      items.forEach(it => (it.categoryIds||[]).forEach(id => catIdSet.add(id)));
      var categories = Array.from(catIdSet).map(id => ({ id: id, title: categoryTitle(id) }))
        .sort((a,b) => a.title.localeCompare(b.title));

      var vm = this.getView().getModel("catalog");
      vm.setProperty("/items", items);
      vm.setProperty("/categories", categories);

      // initial filtern
      this._applyFilters();
    },

    // --- Suche / Filter ---
    onLiveSearch: function (oEvent) {
      var q = (oEvent.getParameter("newValue") || "").trim();
      this.getView().getModel("catalog").setProperty("/query", q);
      this._applyFilters();
    },
    onSearch: function (oEvent) {
      var q = (oEvent.getParameter("query") || "").trim();
      this.getView().getModel("catalog").setProperty("/query", q);
      this._applyFilters();
    },
    onTypeChange: function () {
      this._applyFilters();
    },
    onCategoryChange: function () {
      var keys = this.byId("catMCB").getSelectedKeys();
      this.getView().getModel("catalog").setProperty("/selectedCategoryIds", keys);
      this._applyFilters();
    },

    _applyFilters: function () {
      var vm = this.getView().getModel("catalog");
      var items = vm.getProperty("/items") || [];
      var type  = vm.getProperty("/type");
      var q     = lower(vm.getProperty("/query") || "");
      var sel   = vm.getProperty("/selectedCategoryIds") || [];

      var filtered = items.filter(function (it) {
        if (type !== "all" && it.type !== type) return false;
        if (q && it.searchText.indexOf(q) === -1) return false;
        if (sel.length) {
          var hasOne = (it.categoryIds || []).some(id => sel.indexOf(id) >= 0);
          if (!hasOne) return false;
        }
        return true;
      });

      vm.setProperty("/filtered", filtered);
    },

    // --- Autosuggest für SearchField ---
    onSuggest: function (oEvent) {
      var sf = oEvent.getSource();
      var q = lower(oEvent.getParameter("suggestValue") || "");
      sf.destroySuggestionItems();

      if (!q) return;

      var items = this.getView().getModel("catalog").getProperty("/items") || [];
      var take = items
        .filter(it => it.searchText.indexOf(q) >= 0)
        .slice(0, 10);

      take.forEach(function (it) {
        sf.addSuggestionItem(new SuggestionItem({
          text: it.title,
          description: it.type === "path" ? "Lernpfad" : "Kurs",
          key: it.type + ":" + it.id
        }));
      });
    },

    onSuggestionItemSelected: function (oEvent) {
      var item = oEvent.getParameter("selectedItem");
      if (!item) return;
      var token = item.getKey(); // "course:ID" | "path:ID"
      var parts = (token || "").split(":");
      if (parts.length === 2) {
        // setzt Suchfeld auf exakten Titel, filtert und scrollt nach oben
        this.byId("sf").setValue(item.getText());
        this.getView().getModel("catalog").setProperty("/query", item.getText());
        this._applyFilters();
        try { window.scrollTo({top:0, behavior:"auto"}); } catch(e){}
      }
    },

    // --- Item-Klick: einfacher Detail-Dialog (Stub) ---
    onItemPress: function (oEvent) {
      var cd = (oEvent.getSource().getCustomData() || []).reduce(function (acc, c) {
        acc[c.getKey()] = c.getValue(); return acc;
      }, {});
      var id = cd.id, type = cd.type;

      var vm = this.getView().getModel("catalog");
      var item = (vm.getProperty("/items") || []).find(it => it.id === id && it.type === type);
      if (!item) return;

      // Placeholder-Dialog; später per Router auf echte Detailseiten
      var that = this;
      if (this._dlg) { this._dlg.destroy(); this._dlg = null; }
      this._dlg = new sap.m.Dialog({
        title: (type === "path" ? "Lernpfad" : "Kurs") + ": " + item.title,
        contentWidth: "40rem",
        content: [
          new sap.m.VBox({
            width: "100%",
            items: [
              new sap.m.ObjectStatus({ text: item.typeLabel, state: "Information" }),
              new sap.m.Text({ text: item.subtitle, wrapping: true }).addStyleClass("sapUiSmallMarginTop")
            ]
          }).addStyleClass("sapUiMediumMargin")
        ],
        beginButton: new sap.m.Button({
          text: "Start",
          type: "Emphasized",
          press: function () {
            sap.m.MessageToast.show("Start (Stub) – Routing/Player folgt");
            that._dlg.close();
          }
        }),
        endButton: new sap.m.Button({ text: "Schliessen", press: () => this._dlg.close() })
      });
      this.getView().addDependent(this._dlg);
      this._dlg.open();
    },

    onStartPress: function (oEvent) {
      const cd = (oEvent.getSource().getCustomData() || []).reduce((acc, c) => {
        acc[c.getKey()] = c.getValue(); return acc;
      }, {});
      // später: Router auf echten Player / Detailroute
      sap.m.MessageToast.show((cd.type === "path" ? "Lernpfad" : "Kurs") + " starten: " + cd.id);
    }

  });
});
