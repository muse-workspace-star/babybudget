/* BabyBudget calculators — pure math + DOM wiring.
   All figures are ESTIMATES based on 2026 US averages, not quotes.
   Sources documented on the methodology page. */
(function () {
  'use strict';

  // One-time nursery & gear setup (USD)
  var GEAR = {
    budget:  { name: 'Budget',     amount: 1200 },
    mid:     { name: 'Mid-range',  amount: 2800 },
    premium: { name: 'Premium',    amount: 6000 }
  };

  // Feeding cost per month (USD)
  var FEED = {
    breast:         { name: 'Breastmilk',            amount: 30  },
    combo:          { name: 'Combo feeding',         amount: 100 },
    formula_store: { name: 'Formula · store brand', amount: 75  },
    formula_brand: { name: 'Formula · name brand',  amount: 150 },
    formula_prem:  { name: 'Formula · premium',     amount: 250 }
  };

  // Diapering cost per month (USD)
  var DIAPER = {
    cloth:   { name: 'Cloth (amortized)', amount: 45  },
    store:   { name: 'Store brand',       amount: 60  },
    brand:   { name: 'Name brand',        amount: 90  },
    premium: { name: 'Premium / eco',     amount: 120 }
  };

  var WIPES_MONTH = 25; // wipes & changing supplies per month

  // Childcare cost per month (USD)
  var CARE = {
    none:   { name: 'Family / at home',   amount: 0    },
    home:   { name: 'Home-based daycare', amount: 970  },
    center: { name: 'Daycare center',     amount: 1230 },
    nanny:  { name: 'Nanny',              amount: 2700 }
  };

  // Budget allocator: category shares of the first-year total (sum = 100)
  var ALLOC_CATS = [
    { key: 'childcare',   name: 'Childcare',              pct: 52 },
    { key: 'gear',        name: 'Gear & nursery',         pct: 13 },
    { key: 'feeding',     name: 'Feeding',                pct: 12 },
    { key: 'diapers',     name: 'Diapers & supplies',     pct: 8  },
    { key: 'health',      name: 'Health & insurance',     pct: 6  },
    { key: 'clothing',    name: 'Clothing',               pct: 5  },
    { key: 'contingency', name: 'Contingency',            pct: 4  }
  ];

  function round10(n) { return Math.round(n / 10) * 10; }

  function pick(table, key, fallbackKey) {
    return table[key] || table[fallbackKey];
  }

  // Mode A: three-segment first-year estimate.
  function estimateFirstYear(gearKey, feedKey, diaperKey, careKey, careMonths) {
    var gear = pick(GEAR, gearKey, 'mid').amount;
    var feedMo = pick(FEED, feedKey, 'combo').amount;
    var diaperMo = pick(DIAPER, diaperKey, 'brand').amount;
    var careMo = pick(CARE, careKey, 'center').amount;
    careMonths = Math.max(0, Math.min(12, Math.round(Number(careMonths) || 0)));

    var feeding = (feedMo + WIPES_MONTH) * 12;
    var diapers = diaperMo * 12;
    var childcare = careMo * careMonths;
    var rawTotal = gear + feeding + diapers + childcare;

    var segments = [
      { name: pick(GEAR, gearKey, 'mid').name + ' gear (one-time)', amount: round10(gear) },
      { name: pick(FEED, feedKey, 'combo').name + ' · feeding (12 mo)', amount: round10(feeding) },
      { name: pick(DIAPER, diaperKey, 'brand').name + ' · diapers (12 mo)', amount: round10(diapers) },
      { name: pick(CARE, careKey, 'center').name + ' · childcare (' + careMonths + ' mo)', amount: round10(childcare) }
    ];
    var total = segments.reduce(function (s, x) { return s + x.amount; }, 0);
    segments.forEach(function (x) {
      x.pct = total > 0 ? Math.round(x.amount / total * 100) : 0;
    });
    return {
      gearKey: gearKey, feedKey: feedKey, diaperKey: diaperKey,
      careKey: careKey, careMonths: careMonths,
      total: total, perMonth: total / 12, segments: segments
    };
  }

  // Mode B: allocate a fixed first-year budget across categories.
  function allocateBudget(budget) {
    budget = Math.max(1000, Math.round(Number(budget) || 20000));
    var items = ALLOC_CATS.map(function (c) {
      return { key: c.key, name: c.name, pct: c.pct, amount: round10(budget * c.pct / 100) };
    });
    var total = items.reduce(function (s, i) { return s + i.amount; }, 0);
    return { budget: budget, total: total, items: items };
  }

  function fmt(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function renderItems(el, items) {
    var maxPct = Math.max.apply(null, items.map(function (i) { return i.pct; }).concat([1]));
    el.innerHTML = items.map(function (i) {
      var w = Math.round(i.pct / maxPct * 100);
      return '<div class="alloc-row">' +
        '<span>' + i.name + ' <span style="color:var(--muted)">(' + i.pct + '%)</span></span>' +
        '<span class="bar-track"><span class="bar-fill" style="display:block;width:' + w + '%"></span></span>' +
        '<span class="amt">' + fmt(i.amount) + '</span>' +
      '</div>';
    }).join('');
  }

  // ---- DOM wiring (browser only) ----
  function checkedValue(name, fallback) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : fallback;
  }

  function wire() {
    var tabBtns = document.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('.tab-panel');
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    // Mode A controls
    var moSlider = document.getElementById('caremonths-slider');
    var moNum = document.getElementById('caremonths-num');
    var aTotal = document.getElementById('a-total');
    var aPerMonth = document.getElementById('a-permonth');
    var aBody = document.getElementById('a-breakdown');

    function recalcA() {
      var months = Number(moNum.value) || 0;
      if (months < 0) months = 0;
      if (months > 12) months = 12;
      if (moSlider && document.activeElement !== moSlider) moSlider.value = months;
      if (moNum && document.activeElement !== moNum) moNum.value = months;
      var r = estimateFirstYear(
        checkedValue('gear', 'mid'),
        checkedValue('feed', 'combo'),
        checkedValue('diaper', 'brand'),
        checkedValue('care', 'center'),
        months
      );
      if (aTotal) aTotal.textContent = fmt(r.total);
      if (aPerMonth) aPerMonth.textContent = 'About ' + fmt(r.perMonth) + ' per month — estimate, not a quote.';
      if (aBody) renderItems(aBody, r.segments);
    }

    if (moSlider && moNum) {
      moSlider.addEventListener('input', function () { moNum.value = moSlider.value; recalcA(); });
      moNum.addEventListener('input', recalcA);
      document.querySelectorAll('input[name="gear"], input[name="feed"], input[name="diaper"], input[name="care"]').forEach(function (el) {
        el.addEventListener('change', recalcA);
      });
      recalcA();
    }

    // Mode B controls
    var bInput = document.getElementById('b-budget');
    var bTotal = document.getElementById('b-total');
    var bBody = document.getElementById('b-breakdown');

    function recalcB() {
      var r = allocateBudget(Number(bInput.value) || 20000);
      if (bTotal) bTotal.textContent = fmt(r.total);
      if (bBody) renderItems(bBody, r.items);
    }

    if (bInput) {
      bInput.addEventListener('input', recalcB);
      document.querySelectorAll('[data-budget]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          bInput.value = chip.dataset.budget;
          recalcB();
        });
      });
      recalcB();
    }
  }

  var api = {
    GEAR: GEAR, FEED: FEED, DIAPER: DIAPER, CARE: CARE,
    WIPES_MONTH: WIPES_MONTH, ALLOC_CATS: ALLOC_CATS,
    estimateFirstYear: estimateFirstYear,
    allocateBudget: allocateBudget,
    fmt: fmt
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // node self-test
  } else if (typeof window !== 'undefined') {
    window.BabyCalc = api;
    document.addEventListener('DOMContentLoaded', wire);
  }
})();
