// Parser checks: real phrasings people type or say -> expected actions.
const { serve, open } = require('./lib');
const C = [
  ['2 eggs, toast and a banana', a => a.length === 1 && a[0].type === 'log_food' && a[0].items.length === 3 && a[0].items[0].q === 2],
  ['I weigh 79.5 kg', a => a[0].type === 'log_bodyweight' && a[0].weight === 79.5],
  ['weighed 172.4 lbs this morning', a => a[0].type === 'log_bodyweight' && a[0].weight === 172.4 && a[0].unit === 'lb'],
  ['goblet squat 16 kg 30 s', a => a[0].type === 'log_set' && a[0].exercise === 'goblet-squat' && a[0].weight === 16 && a[0].seconds === 30],
  ['goblet squat 16kg for 45 seconds', a => a[0].seconds === 45 && a[0].weight === 16],
  ['curls 3x10 with 12 kg', a => a[0].exercise === 'curl' && a[0].sets === 3 && a[0].reps === 10 && a[0].weight === 12],
  ['did 3 sets of 12 lateral raises with 6 kg dumbbells', a => a[0].exercise === 'lateral-raise' && a[0].sets === 3 && a[0].reps === 12 && a[0].weight === 6 && a[0].eq === 'd'],
  ['wall sit 60 seconds', a => a[0].exercise === 'wall-sit' && a[0].seconds === 60],
  ['plank for a minute', a => a[0].exercise === 'plank-db' && a[0].seconds === 60],
  ['hip thrust machine 60 kg 10 reps', a => a[0].exercise === 'glute-bridge' && a[0].reps === 10 && a[0].eq === 'c'],
  ['RDL 40 kg 8 reps', a => a[0].exercise === 'rdl' && a[0].reps === 8 && a[0].weight === 40],
  ['romanian deadlift 95 lb 10 reps', a => a[0].exercise === 'rdl' && a[0].unit === 'lb'],
  ['set goblet squat weight to 20 kg', a => a[0].type === 'set_weight' && a[0].weight === 20],
  ['walked 30 min', a => a[0].type === 'log_cardio' && a[0].minutes === 30],
  ['rowed 2000 m in 9 minutes', a => a[0].type === 'log_cardio' && a[0].machine === 'Rowing' && a[0].minutes === 9 && Math.abs(a[0].distance_km - 2) < .01],
  ['ran 5k', a => a[0].type === 'log_cardio' && a[0].distance_km === 5],
  ['8000 steps today', a => a[0].type === 'log_cardio' && a[0].steps === 8000],
  ['knee pain 5/10', a => a[0].type === 'log_pain' && a[0].area === 'knee' && a[0].score === 5],
  ['my lower back is a bit sore', a => a[0].type === 'log_pain' && a[0].area === 'back'],
  ['sharp pain in my shoulder', a => a[0].type === 'log_pain' && a[0].sharp && a[0].area === 'shoulder'],
  ['slept 6 hours', a => a[0].type === 'log_sleep' && a[0].hours === 6],
  ['2 litres of water', a => a[0].type === 'log_water' && a[0].ml === 2000],
  ['a glass of water', a => a[0].type === 'log_water' && a[0].ml === 250],
  ["i'm vegan now", a => a[0].type === 'set_profile' && a[0].diet === 'vegan'],
  ['use pounds', a => a[0].type === 'set_profile' && a[0].units === 'lb'],
  ["I'm at the gym today", a => a[0].type === 'set_equipment' && a[0].equipment.length === 4],
  ['switch to kettlebells only', a => a[0].type === 'set_equipment' && a[0].equipment.join('') === 'k'],
  ['start morning session', a => a[0].type === 'start_session' && a[0].session === 'am'],
  ["let's do the evening workout", a => a[0].type === 'start_session' && a[0].session === 'pm'],
  ['go to week 5', a => a[0].type === 'set_week' && a[0].week === 5],
  ['skip wall sit today', a => a[0].type === 'skip_exercise' && a[0].exercise === 'wall-sit'],
  ['lunch: chicken biryani and raita', a => a[0].type === 'log_food' && a[0].items.length === 2 && a[0].meal_name === 'Lunch'],
  ['200g chicken breast with rice and broccoli', a => a[0].items.length === 3 && a[0].items[0].g === 200],
  ['a scoop of whey with 300 ml milk', a => a[0].items.length === 2 && a[0].items[1].g === 300],
  ['3 idlis with sambar', a => a[0].items[0].q === 3 && a[0].items.length === 2],
  ['tofu stir fry with quinoa', a => a[0].items.length === 2],
  ['greek yogurt with berries and a tbsp of peanut butter', a => a[0].items.length === 3],
  ['had 2 slices of pizza and a coke', a => a[0].items.length === 2 && a[0].items[0].q === 2],
  ['walked 30 min and had 2 eggs', a => a.length === 2 && a[0].type === 'log_cardio' && a[1].type === 'log_food'],
  ['goblet squat 16 kg 30 s and curls 10 kg 12 reps', a => a.length === 2 && a[1].exercise === 'curl' && a[1].reps === 12],
  ['bacon and eggs with coffee', a => a[0].items.length === 3],
  ['cottage cheese and an apple', a => a[0].items.length === 2 && a[0].items[0].n === 'Cottage cheese'],
  ['kickbacks 8 kg 12 reps', a => a[0].exercise === 'kickback'],
  ['dead bug 30 s', a => a[0].exercise === 'dead-bug' && a[0].seconds === 30],
  ['single leg rdl 12 kg 10 reps', a => a[0].exercise === 'sl-rdl'],
  ['seated calf raise 20 kg 15 reps', a => a[0].exercise === 'seated-calf'],

  // round-1 persona reports
  ['cable lat raise 15x12', a => a[0].exercise === 'lateral-raise' && a[0].weight === 15 && a[0].reps === 12 && a[0].eq === undefined || a[0].weight === 15 && a[0].reps === 12],
  ['RDL 135x10', a => a[0].exercise === 'rdl' && a[0].weight === 135 && a[0].reps === 10 && !a[0].sets],
  ['hack squat 180 3x8', a => a[0].exercise === 'goblet-squat' && a[0].weight === 180 && a[0].sets === 3 && a[0].reps === 8 && a[0].eq === 'c'],
  ['kettlebell swing 24 kg 15 reps', a => a[0].exercise === 'bird-dog' && a[0].part === 'reps' && a[0].reps === 15],
  ['goblet squat 24 kg 10 and 8 reps', a => a.length === 1 && a[0].reps === 10 && a[0].more && a[0].more[0] === 8],
  ['goblet squat sixteen kilos thirty seconds', a => a[0].weight === 16 && a[0].seconds === 30],
  ['lateral raises with 3 kilos for 12 reps', a => a[0].exercise === 'lateral-raise' && a[0].weight === 3 && a[0].reps === 12],
  ['lat pulldown 120x10', a => a[0].type === 'log_lift' && a[0].weight === 120 && a[0].reps === 10 && /Lat Pulldown/.test(a[0].name)],
  ['leg press 3x12 100 kg', a => a[0].exercise === 'wall-sit' && a[0].sets === 3 && a[0].reps === 12 && a[0].weight === 100],
  ['smith machine bench 60 kg 8 reps', a => a[0].type === 'log_lift' && a[0].reps === 8],
  ['blood pressure 138 over 85', a => a[0].type === 'log_bp' && a[0].sys === 138 && a[0].dia === 85],
  ["I weigh 10 stone 4", a => a[0].type === 'log_bodyweight' && Math.abs(a[0].weight - 65.3) < 0.2],
  ['water 24 fl oz', a => a[0].type === 'log_water' && Math.abs(a[0].ml - 710) < 2],
  ['drank 32 oz of water', a => a[0].type === 'log_water' && Math.abs(a[0].ml - 946) < 2],
  ['ribeye 10 oz', a => a[0].items.length === 1 && Math.abs(a[0].items[0].g - 284) < 2],
  ['steak 10 oz ribeye', a => a[0].items.length === 1],
  ['bulletproof coffee', a => a[0].items[0].n === 'Bulletproof coffee'],
  ['pea protein shake 30g', a => a[0].items[0].n === 'Plant protein'],
  ['tofu scramble 200g tofu with 2 slices toast', a => a[0].items.length === 2 && a[0].items[0].g === 200],
  ['2 roti, dal makhani, thoda chawal', a => a[0].items.length === 3 && a[0].items[1].n === 'Dal makhani' && a[0].items[2].g === 75],
  ['paneer bhurji and chaas', a => a[0].items.length === 2 && a[0].items[0].n === 'Paneer bhurji'],
  ['knee and back pain', a => a[0].type === 'log_pain'],

  // round-2 persona reports
  ['seated cable row 110 lb 12 reps', a => a[0].type === 'log_lift' && /Seated Cable Row/.test(a[0].name)],
  ['cable row 30 kg 12 reps', a => a[0].exercise === 'sa-row' && a[0].eq === 'c'],
  ['back squat 100 kg 5 reps', a => a[0].type === 'log_lift'],
  ['romanian deadlift 60 kg 8 reps', a => a[0].exercise === 'rdl'],
  ['goblet squat 24 kg 10 reps', a => a[0].exercise === 'goblet-squat' && (a[0].eq === 'k' || a[0].eq === 'd')],
  ['leg press 140 kg 10 reps', a => a[0].exercise === 'wall-sit' && a[0].eq === 'c'],
  ['10 stone 2', a => a[0].type === 'log_bodyweight' && Math.abs(a[0].weight - 64.4) < 0.2],
  ['sabzi aur curd, 1 katori', a => a[0].items.length === 2],
  ['a spoon of peanut butter on toast', a => a[0].items.length === 2 && a[0].items[0].g === 15],
  ['2 cheese sticks and pork rinds', a => a[0].items.length === 2],
  ['quest bar', a => a[0].items[0].n === 'Keto protein bar' && a[0].items[0].c - a[0].items[0].fb < 6],
  ['seated cable row 40 kg 10', a => a[0].type === 'log_lift' && a[0].weight === 40 && a[0].reps === 10],
  ['treadmill 30 min 2.5 miles', a => a[0].machine === 'Treadmill' && a[0].minutes === 30],
];
const Q = ['how much protein today?', 'what should I do today', 'what is my best goblet squat'];
const PC = [['my knee hurts 4 out of 10', 'pain'], ['add some rest', 'more'], ['what is this exercise', 'cues'], ['I only held 25', 'logged'], ['next', 'next'], ['pause', 'pause'], ['resume', 'resume'], ['go back', 'prev'], ['16 kilos', 'weight'], ['heavier', 'up'], ['skip this exercise', 'skipex'], ['i only got 8', 'logged'], ['end session', 'end'], ['done', 'next'], ['more rest', 'more'], ['hold on', 'pause']];
(async () => {
  const srv = await serve(8125);
  let fail = 0, n = 0;
  for (const kind of ['android', 'iphone']) {
    const { b, page, errs } = await open(kind, { state: { profile: { units: 'kg', diet: 'any' } } });
    await page.goto('http://localhost:8125/index.html'); await page.waitForFunction(() => window.__isoholdReady);
    for (const [t, ok] of C) { n++; const r = await page.evaluate(t => window.__isoTest.parseText(t), t); let pass = false; try { pass = ok(r.actions); } catch (e) { } if (!pass || r.unknown.length && !/fry|stir|today|this morning/.test(r.unknown.join(' '))) { if (!pass) fail++; console.log((pass ? 'WARN ' : 'FAIL ') + kind + ' | ' + t + ' -> ' + JSON.stringify(r).slice(0, 300)); } }
    for (const t of Q) { n++; const r = await page.evaluate(t => window.__isoTest.parseText(t), t); if (!r.question) { fail++; console.log('FAIL q ' + t); } }
    for (const [t, e] of PC) { n++; const r = await page.evaluate(t => window.__isoTest.parsePlayerCmd(t), t); if (!r || r[0] !== e) { fail++; console.log('FAIL cmd ' + t + ' -> ' + JSON.stringify(r)); } }
    if (errs.length) console.log(errs);
    await b.close();
  }
  console.log(`${n - fail}/${n} passed`); srv.close();
})();
